import { describe, expect, it, vi } from "vitest";

import {
  authenticateSocketUser,
  authorizeGuildRoom,
  type GuildRoomAuthorizer
} from "./realtime.server.js";

describe("socket authentication", () => {
  it("accepts a verified handshake token and rejects missing or invalid credentials", () => {
    const user = { id: "user-1", email: "user@example.com", role: "USER" as const };
    const verify = vi.fn().mockReturnValue(user);

    expect(authenticateSocketUser("signed-token", undefined, verify)).toEqual(user);
    expect(verify).toHaveBeenCalledWith("signed-token");
    expect(() => authenticateSocketUser(undefined, undefined, verify)).toThrow("Authentication required");
    expect(() =>
      authenticateSocketUser(undefined, "Bearer bad-token", () => {
        throw new Error("bad signature");
      })
    ).toThrow("Invalid or expired access token");
  });
});

describe("guild realtime room authorization", () => {
  it("returns the private guild room only for a current member", async () => {
    const authorizer: GuildRoomAuthorizer = {
      findMember: vi.fn().mockResolvedValue({ role: "MEMBER" })
    };

    await expect(authorizeGuildRoom("user-1", "guild-1", authorizer)).resolves.toBe("guild:guild-1");
    expect(authorizer.findMember).toHaveBeenCalledWith({ guildId: "guild-1", userId: "user-1" });
  });

  it("denies a non-member and fails closed when membership lookup fails", async () => {
    const nonMember: GuildRoomAuthorizer = {
      findMember: vi.fn().mockResolvedValue(null)
    };
    const unavailable: GuildRoomAuthorizer = {
      findMember: vi.fn().mockRejectedValue(new Error("database unavailable"))
    };

    await expect(authorizeGuildRoom("user-2", "guild-1", nonMember)).resolves.toBeNull();
    await expect(authorizeGuildRoom("user-2", "guild-1", unavailable)).resolves.toBeNull();
  });
});
