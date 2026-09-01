export type UserSession = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  current: boolean;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string;
  createdAt: string;
};
