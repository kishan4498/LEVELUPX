import { createHmac, randomBytes } from "node:crypto";
import type { UserSession } from "@prisma/client";

import { AppError } from "../../common/errors/AppError.js";
import { env } from "../../config/env.js";
import type { IAuthSessionRepository } from "./authSession.repository.js";

const SESSION_TTL_DAYS = 30;

export type SessionContext = {
  userAgent?: string;
  ipAddress?: string;
};

export type SessionDto = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  current: boolean;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string;
  createdAt: string;
};

export class AuthSessionService {
  constructor(
    private readonly repo: IAuthSessionRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  async create(userId: string, client: SessionContext = {}) {
    const token = this.generateToken();
    const now = this.now();
    const session = await this.repo.create({
      userId,
      tokenHash: this.hashToken(token),
      userAgent: client.userAgent,
      ipAddress: client.ipAddress,
      expiresAt: new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
    });

    return { token, session };
  }

  async rollSessionToken(token: string, client: SessionContext = {}) {
    // We rotate tokens on every refresh request to prevent long-lived session hijacking.
    const now = this.now();
    const tokenHash = this.hashToken(token);
    const session = await this.repo.findActiveByTokenHash(tokenHash, now);

    if (!session) {
      throw new AppError("Your session has expired. Please sign in again.", 401, "REFRESH_SESSION_INVALID");
    }

    const nextToken = this.generateToken();
    const rotated = await this.repo.rollSessionToken({
      id: session.id,
      previousTokenHash: tokenHash,
      nextTokenHash: this.hashToken(nextToken),
      userAgent: client.userAgent,
      ipAddress: client.ipAddress,
      now
    });

    if (!rotated) {
      throw new AppError("Your session was already refreshed. Please retry.", 401, "REFRESH_SESSION_REUSED");
    }

    return {
      userId: session.userId,
      token: nextToken,
      sessionId: session.id
    };
  }

  async revokeToken(token: string | undefined) {
    if (!token) {
      return;
    }

    await this.repo.revokeByTokenHash(this.hashToken(token), this.now());
  }

  async revokeAllSessions(userId: string) {
    await this.repo.revokeAllSessions(userId, this.now());
  }

  async revokeSession(userId: string, sessionId: string) {
    const revoked = await this.repo.revokeSession(userId, sessionId, this.now());

    if (!revoked) {
      throw new AppError("Session not found", 404, "SESSION_NOT_FOUND");
    }
  }

  async listForUser(userId: string, currentToken: string | undefined): Promise<SessionDto[]> {
    const currentHash = currentToken ? this.hashToken(currentToken) : null;
    const sessions = await this.repo.listForUser(userId);

    return sessions.map((session) => this.toDto(session, currentHash));
  }

  private generateToken() {
    return randomBytes(48).toString("base64url");
  }

  private hashToken(token: string) {
    return createHmac("sha256", env.JWT_REFRESH_SECRET).update(token).digest("hex");
  }

  private toDto(session: UserSession, currentHash: string | null): SessionDto {
    return {
      id: session.id,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      current: currentHash === session.tokenHash,
      expiresAt: session.expiresAt.toISOString(),
      revokedAt: session.revokedAt?.toISOString() ?? null,
      lastUsedAt: session.lastUsedAt.toISOString(),
      createdAt: session.createdAt.toISOString()
    };
  }
}
