# Realtime Events

LevelUpX uses Socket.IO on the backend HTTP server. Clients connect to the same host as the API and authenticate with the normal access token.

## Connection

Pass the access token in Socket.IO auth:

```ts
io(API_URL, {
  auth: {
    token: accessToken
  }
});
```

The server also accepts a `Bearer` token in the connection `Authorization` header.

Authenticated sockets automatically join a private `user:{userId}` room. A
client can also pass `guildId` in socket auth to request the corresponding
`guild:{guildId}` room. The server queries current `GuildMember` state and
fails closed unless the authenticated user is a member. Leaving a guild evicts
all sockets in that user's private room from the guild room.

## Events

- `focus.session.started`: sent to the user room when a focus session starts.
- `focus.session.stopped`: sent to the user room when a focus session stops.
- `focus.presence.changed`: sent on start, pause, resume, and stop to the user
  and accepted accountability partners only. The payload reports session
  presence without exposing task or goal text.
- `guild.teamQuest.progressUpdated`: sent to the guild room when team quest progress changes.
- `achievement.unlocked`: sent to the user room when a quest completion unlocks an achievement.
- `leaderboard.snapshots.refreshed`: broadcast when persisted leaderboard snapshots refresh.

The publisher is safe to call before Socket.IO is initialized. In tests and one-off scripts, events simply no-op unless the realtime server has been attached.

Realtime events are update signals rather than the authoritative record. The
client reads the current REST state after reconnecting or when an event could
have been missed.
