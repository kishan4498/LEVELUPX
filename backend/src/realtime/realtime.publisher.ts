import type { Server } from "socket.io";

import type { RealtimeEvent } from "./realtime.types.js";

let io: Server | null = null;

export function setRealtimeServer(server: Server) {
  io = server;
}

export function publishRealtimeEvent(event: RealtimeEvent) {
  if (!io) {
    return false;
  }

  if ("userIds" in event) {
    for (const userId of new Set(event.userIds)) {
      io.to(userRoom(userId)).emit(event.name, event.payload);
    }
    return true;
  }

  if ("userId" in event) {
    io.to(userRoom(event.userId)).emit(event.name, event.payload);
    return true;
  }

  if ("guildId" in event) {
    io.to(guildRoom(event.guildId)).emit(event.name, event.payload);
    return true;
  }

  io.emit(event.name, event.payload);
  return true;
}

export function userRoom(userId: string) {
  return `user:${userId}`;
}

export function guildRoom(guildId: string) {
  return `guild:${guildId}`;
}

export function removeUserFromGuildRoom(userId: string, guildId: string) {
  if (!io) {
    return false;
  }

  io.in(userRoom(userId)).socketsLeave(guildRoom(guildId));
  return true;
}
