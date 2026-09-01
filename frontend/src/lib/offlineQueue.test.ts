import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/store/auth.store";
import type { AuthUser } from "@/types/auth";

vi.mock("./api", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly code: string
    ) {
      super(message);
    }
  },
  apiRequest: vi.fn()
}));
vi.mock("./productEvents", () => ({
  trackProductEvent: vi.fn().mockResolvedValue(undefined)
}));

import { apiRequest } from "./api";
import {
  enqueueOfflineAction,
  flushOfflineActions,
  listOfflineActions,
  removeOfflineAction
} from "./offlineQueue";

const user: AuthUser = {
  id: "user-1",
  name: "Offline Player",
  email: "offline@example.com",
  role: "USER",
  status: "ACTIVE",
  emailVerifiedAt: "2026-05-20T00:00:00.000Z",
  twoStepEnabled: false,
  profile: null
};

describe("offline action queue", () => {
  beforeEach(async () => {
    for (const action of await listOfflineActions()) {
      await removeOfflineAction(action.id);
    }

    vi.mocked(apiRequest).mockReset();
    useAuthStore.getState().setSession({ accessToken: "memory-only-token", user });
  });

  it("stores a quest without credentials and removes it after a successful replay", async () => {
    const requestId = "123e4567-e89b-12d3-a456-426614174000";
    await enqueueOfflineAction({
      id: requestId,
      kind: "CREATE_QUEST",
      path: "/quests",
      method: "POST",
      body: {
        clientRequestId: requestId,
        title: "Offline task",
        difficulty: "EASY",
        category: "Quick capture",
        estimatedMinutes: 25
      }
    });

    const queued = await listOfflineActions();
    expect(queued).toHaveLength(1);
    expect(JSON.stringify(queued[0])).not.toContain("memory-only-token");

    vi.mocked(apiRequest).mockResolvedValue({ quest: { id: "quest-1" } });
    await flushOfflineActions();

    expect(apiRequest).toHaveBeenCalledWith(
      "/quests",
      expect.objectContaining({ method: "POST" })
    );
    expect(await listOfflineActions()).toEqual([]);
  });
});
