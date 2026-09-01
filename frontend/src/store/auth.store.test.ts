import { beforeEach, describe, expect, it } from "vitest";

import { useAuthStore } from "./auth.store";
import type { AuthUser } from "@/types/auth";

const user: AuthUser = {
  id: "user-1",
  name: "Test Player",
  email: "player@example.com",
  role: "USER",
  status: "ACTIVE",
  emailVerifiedAt: "2026-05-20T00:00:00.000Z",
  twoStepEnabled: true,
  profile: {
    level: 2,
    totalXp: 1200,
    coins: 75,
    currentStreak: 3,
    longestStreak: 5
  }
};

describe("auth store", () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
  });

  it("keeps the access token in memory and clears the whole session together", () => {
    useAuthStore.getState().setSession({ accessToken: "short-lived-token", user });

    expect(useAuthStore.getState()).toMatchObject({
      accessToken: "short-lived-token",
      user,
      sessStatus: "authenticated"
    });
    expect(localStorage.getItem("levelupx-auth")).toBeNull();

    useAuthStore.getState().logout();

    expect(useAuthStore.getState()).toMatchObject({
      accessToken: null,
      user: null,
      sessStatus: "anonymous"
    });
  });
});
