import { describe, expect, it } from "vitest";

import { guildRoom, publishRealtimeEvent, userRoom } from "./realtime.publisher.js";
import { realtimeEvents } from "./realtime.types.js";

describe("realtime publisher helpers", () => {
  it("builds stable room names", () => {
    expect(userRoom("user-1")).toBe("user:user-1");
    expect(guildRoom("guild-1")).toBe("guild:guild-1");
  });

  it("safely ignores events before Socket.IO is initialized", () => {
    const published = publishRealtimeEvent({
      name: realtimeEvents.leaderboardSnapshotsRefreshed,
      payload: {
        refreshedScopes: 2,
        rowsWritten: 10,
        scopes: []
      }
    });

    expect(published).toBe(false);
  });
});
