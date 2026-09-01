import { ConnectionStatus } from "@prisma/client";

import { AppError } from "../../common/errors/AppError.js";
import { publishRealtimeEvent } from "../../realtime/realtime.publisher.js";
import { realtimeEvents } from "../../realtime/realtime.types.js";
import type { NotificationService } from "../notifications/notification.service.js";
import type { AccountabilityConnectionWithPeople, IAccountabilityRepository } from "./accountability.repository.js";
import type {
  AccountabilityConnectionDto,
  CreateAccountabilityRequestInput,
  RespondToAccountabilityRequestInput
} from "./accountability.types.js";

const PROGRESS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export class AccountabilityService {
  constructor(
    private readonly repo: IAccountabilityRepository,
    private readonly notifications: NotificationService,
    private readonly now: () => Date = () => new Date()
  ) {}

  async list(userId: string): Promise<AccountabilityConnectionDto[]> {
    const connections = await this.repo.findForUser(userId);

    return Promise.all(
      connections.map(async (connection) => {
        const partnerId = connection.requesterId === userId ? connection.recipientId : connection.requesterId;
        const progress =
          connection.status === ConnectionStatus.ACCEPTED
            ? await this.repo.getProgress(partnerId, new Date(this.now().getTime() - PROGRESS_WINDOW_MS))
            : undefined;

        return this.toDto(connection, userId, progress);
      })
    );
  }

  async request(userId: string, invite: CreateAccountabilityRequestInput): Promise<AccountabilityConnectionDto> {
    const recipient = await this.repo.findActiveUserByEmail(invite.email);

    if (!recipient) {
      throw new AppError("No active user was found for that email", 404, "ACCOUNTABILITY_USER_NOT_FOUND");
    }

    if (recipient.id === userId) {
      throw new AppError("You cannot add yourself as an accountability partner", 409, "ACCOUNTABILITY_SELF_REQUEST");
    }

    const existing = await this.repo.findBetween(userId, recipient.id);

    if (existing?.status === ConnectionStatus.BLOCKED) {
      throw new AppError("This accountability connection is unavailable", 403, "ACCOUNTABILITY_CONNECTION_BLOCKED");
    }

    if (existing) {
      throw new AppError("An accountability connection already exists", 409, "ACCOUNTABILITY_ALREADY_EXISTS");
    }

    const connection = await this.repo.create(userId, recipient.id);
    await this.notifications.dispatchNotification({
      userId: recipient.id,
      title: "New accountability request",
      message: `${connection.requester.name} invited you to become accountability partners.`,
      category: "GENERAL"
    });

    return this.toDto(connection, userId);
  }

  async respond(
    userId: string,
    id: string,
    decision: RespondToAccountabilityRequestInput
  ): Promise<AccountabilityConnectionDto> {
    const connection = await this.requireConnection(id);

    if (connection.recipientId !== userId || connection.status !== ConnectionStatus.PENDING) {
      throw new AppError("Only the pending recipient can answer this request", 403, "ACCOUNTABILITY_RESPONSE_FORBIDDEN");
    }

    const updated = await this.repo.updateStatus(connection.id, decision.status);
    await this.notifications.dispatchNotification({
      userId: updated.requesterId,
      title: decision.status === "ACCEPTED" ? "Accountability request accepted" : "Accountability request declined",
      message:
        decision.status === "ACCEPTED"
          ? `${updated.recipient.name} is now your accountability partner.`
          : `${updated.recipient.name} declined your accountability request.`,
      category: "GENERAL"
    });

    return this.toDto(updated, userId);
  }

  async remove(userId: string, id: string): Promise<void> {
    const connection = await this.requireParticipant(userId, id);

    if (connection.status === ConnectionStatus.BLOCKED && connection.blockedByUserId !== userId) {
      throw new AppError("This connection cannot be changed", 403, "ACCOUNTABILITY_CONNECTION_BLOCKED");
    }

    await this.repo.delete(connection.id);
    this.clearFormerPartnerPresence(connection, userId);
  }

  async block(userId: string, id: string): Promise<AccountabilityConnectionDto> {
    const connection = await this.requireParticipant(userId, id);
    const updated = await this.repo.updateStatus(connection.id, ConnectionStatus.BLOCKED, userId);
    this.clearFormerPartnerPresence(connection, userId);
    return this.toDto(updated, userId);
  }

  private clearFormerPartnerPresence(
    connection: AccountabilityConnectionWithPeople,
    actorUserId: string
  ) {
    if (connection.status !== ConnectionStatus.ACCEPTED) {
      return;
    }

    const formerPartnerId =
      connection.requesterId === actorUserId ? connection.recipientId : connection.requesterId;
    const revokedAt = this.now().toISOString();

    publishRealtimeEvent({
      name: realtimeEvents.focusPresenceChanged,
      userIds: [formerPartnerId],
      payload: {
        userId: actorUserId,
        sessionId: `consent-revoked:${connection.id}:${actorUserId}`,
        state: "IDLE",
        sessionType: "WORK",
        targetMinutes: null,
        startedAt: revokedAt,
        updatedAt: revokedAt
      }
    });
    publishRealtimeEvent({
      name: realtimeEvents.focusPresenceChanged,
      userIds: [actorUserId],
      payload: {
        userId: formerPartnerId,
        sessionId: `consent-revoked:${connection.id}:${formerPartnerId}`,
        state: "IDLE",
        sessionType: "WORK",
        targetMinutes: null,
        startedAt: revokedAt,
        updatedAt: revokedAt
      }
    });
  }

  private async requireConnection(id: string) {
    const connection = await this.repo.findById(id);

    if (!connection) {
      throw new AppError("Accountability connection not found", 404, "ACCOUNTABILITY_NOT_FOUND");
    }

    return connection;
  }

  private async requireParticipant(userId: string, id: string) {
    const connection = await this.requireConnection(id);

    if (connection.requesterId !== userId && connection.recipientId !== userId) {
      throw new AppError("Accountability connection not found", 404, "ACCOUNTABILITY_NOT_FOUND");
    }

    return connection;
  }

  private toDto(
    connection: AccountabilityConnectionWithPeople,
    userId: string,
    progress?: AccountabilityConnectionDto["progress"]
  ): AccountabilityConnectionDto {
    const outgoing = connection.requesterId === userId;
    const person = outgoing ? connection.recipient : connection.requester;

    return {
      id: connection.id,
      status: connection.status,
      direction: outgoing ? "OUTGOING" : "INCOMING",
      person,
      ...(progress ? { progress } : {}),
      createdAt: connection.createdAt.toISOString(),
      updatedAt: connection.updatedAt.toISOString()
    };
  }
}
