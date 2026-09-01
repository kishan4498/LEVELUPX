import { ConnectionStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NotificationService } from "../notifications/notification.service.js";
import type {
  AccountabilityConnectionWithPeople,
  IAccountabilityRepository
} from "./accountability.repository.js";
import { AccountabilityService } from "./accountability.service.js";

vi.mock("../../realtime/realtime.publisher.js", () => ({
  publishRealtimeEvent: vi.fn()
}));

import { publishRealtimeEvent } from "../../realtime/realtime.publisher.js";

function connection(
  overrides: Partial<AccountabilityConnectionWithPeople> = {}
): AccountabilityConnectionWithPeople {
  return {
    id: "connection-1",
    requesterId: "requester-1",
    recipientId: "recipient-1",
    status: ConnectionStatus.ACCEPTED,
    blockedByUserId: null,
    requester: { id: "requester-1", name: "Requester" },
    recipient: { id: "recipient-1", name: "Recipient" },
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides
  };
}

function makeRepo(found: AccountabilityConnectionWithPeople): IAccountabilityRepository {
  return {
    findActiveUserByEmail: vi.fn(),
    findBetween: vi.fn(),
    findForUser: vi.fn(),
    findById: vi.fn().mockResolvedValue(found),
    create: vi.fn(),
    updateStatus: vi.fn().mockImplementation(
      async (_id, status, blockedByUserId) => ({
        ...found,
        status,
        blockedByUserId: blockedByUserId ?? null
      })
    ),
    delete: vi.fn(),
    getProgress: vi.fn(),
    findAcceptedPeerIds: vi.fn()
  };
}

describe("AccountabilityService", () => {
  beforeEach(() => {
    vi.mocked(publishRealtimeEvent).mockClear();
  });

  it("records which participant initiated a block", async () => {
    const repo = makeRepo(connection());
    const service = new AccountabilityService(
      repo,
      { createForUser: vi.fn() } as unknown as NotificationService
    );

    await service.block("requester-1", "connection-1");

    expect(repo.updateStatus).toHaveBeenCalledWith(
      "connection-1",
      ConnectionStatus.BLOCKED,
      "requester-1"
    );
    expect(publishRealtimeEvent).toHaveBeenCalledTimes(2);
    expect(publishRealtimeEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        userIds: ["recipient-1"],
        payload: expect.objectContaining({ userId: "requester-1", state: "IDLE" })
      })
    );
    expect(publishRealtimeEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        userIds: ["requester-1"],
        payload: expect.objectContaining({ userId: "recipient-1", state: "IDLE" })
      })
    );
  });

  it("does not let the blocked participant remove the block record", async () => {
    const repo = makeRepo(
      connection({ status: ConnectionStatus.BLOCKED, blockedByUserId: "requester-1" })
    );
    const service = new AccountabilityService(
      repo,
      { createForUser: vi.fn() } as unknown as NotificationService
    );

    await expect(service.remove("recipient-1", "connection-1")).rejects.toMatchObject({
      code: "ACCOUNTABILITY_CONNECTION_BLOCKED"
    });
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it("clears cached live presence for both parties when an accepted connection is removed", async () => {
    const repo = makeRepo(connection());
    const service = new AccountabilityService(
      repo,
      { createForUser: vi.fn() } as unknown as NotificationService
    );

    await service.remove("recipient-1", "connection-1");

    expect(repo.delete).toHaveBeenCalledWith("connection-1");
    expect(publishRealtimeEvent).toHaveBeenCalledTimes(2);
    expect(publishRealtimeEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        userIds: ["requester-1"],
        payload: expect.objectContaining({ userId: "recipient-1", state: "IDLE" })
      })
    );
    expect(publishRealtimeEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        userIds: ["recipient-1"],
        payload: expect.objectContaining({ userId: "requester-1", state: "IDLE" })
      })
    );
  });
});
