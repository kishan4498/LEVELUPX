import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";

import { verifyAccessToken } from "../common/middlewares/authMiddleware.js";
import { PrismaGuildRepository } from "../modules/guilds/guild.repository.js";
import { guildRoom, setRealtimeServer, userRoom } from "./realtime.publisher.js";
import type { SocketUser } from "./realtime.types.js";

declare module "socket.io" {
  interface Socket {
    user?: SocketUser;
  }
}

export type GuildRoomAuthorizer = {
  findMember(memberKey: { guildId: string; userId: string }): Promise<unknown | null>;
};

export function createRealtimeServer(
  server: HttpServer,
  guildRoomAuthorizer: GuildRoomAuthorizer = new PrismaGuildRepository()
) {
  const io = new Server(server, {
    cors: {
      origin: "*"
    }
  });
  setRealtimeServer(io);

  io.use((socket, next) => {
    // Sockets bypass Express auth, so verify the JWT before joining private rooms.
    try {
      socket.user = authenticateSocketUser(
        socket.handshake.auth.token,
        socket.handshake.headers.authorization
      );
      return next();
    } catch (error) {
      return next(error instanceof Error ? error : new Error("Invalid or expired access token"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.user!;

    socket.join(userRoom(user.id));

    const guildId = socket.handshake.auth.guildId;
    if (typeof guildId === "string" && guildId.length > 0) {
      void authorizeGuildRoom(user.id, guildId, guildRoomAuthorizer).then((room) => {
        if (room) {
          void socket.join(room);
          return;
        }

        socket.emit("guild.room.denied", { guildId });
      });
    }
  });

  return io;
}

export function authenticateSocketUser(
  auth: unknown,
  header: string | string[] | undefined,
  verify: (token: string) => SocketUser = verifyAccessToken
) {
  const token = readSocketToken(auth, header);

  if (!token) {
    throw new Error("Authentication required");
  }

  try {
    return verify(token);
  } catch {
    throw new Error("Invalid or expired access token");
  }
}

export async function authorizeGuildRoom(
  userId: string,
  guildId: string,
  authorizer: GuildRoomAuthorizer
): Promise<string | null> {
  try {
    const membership = await authorizer.findMember({ guildId, userId });
    return membership ? guildRoom(guildId) : null;
  } catch {
    // A lookup failure must fail closed so a database outage cannot expose guild events.
    return null;
  }
}

function readSocketToken(auth: unknown, header: string | string[] | undefined) {
  if (typeof auth === "string") {
    return auth;
  }

  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length);
  }

  return null;
}
