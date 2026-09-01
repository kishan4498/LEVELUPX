"use client";

import { useEffect } from "react";

import { createRealtimeSocket } from "@/lib/realtime";

type SocketHandler = (...eventArgs: never[]) => void;
type SocketHandlers = Record<string, SocketHandler>;
type RealtimeSocket = ReturnType<typeof createRealtimeSocket>;
type SocketListener = {
  eventName: string;
  listener: (...eventArgs: unknown[]) => void;
};

function bindListener(socket: RealtimeSocket, eventName: string, socketHandler: SocketHandler): SocketListener {
  const listener = (...eventArgs: unknown[]) => socketHandler(...(eventArgs as never[]));
  socket.on(eventName, listener);
  return { eventName, listener };
}

function disconnect(socket: RealtimeSocket, listeners: SocketListener[]) {
  listeners.forEach(({ eventName, listener }) => socket.off(eventName, listener));
  socket.disconnect();
}

export function useRealtimeSocket({
  accessToken,
  guildId,
  enabled,
  handlers
}: {
  accessToken: string | null;
  guildId?: string | null;
  enabled?: boolean;
  handlers: SocketHandlers;
}) {
  useEffect(() => {
    if (!accessToken || enabled === false) {
      return;
    }

    const socket = createRealtimeSocket({
      accessToken,
      guildId
    });

    const listeners = Object.entries(handlers).map(([eventName, socketHandler]) =>
      bindListener(socket, eventName, socketHandler)
    );

    return () => disconnect(socket, listeners);
  }, [accessToken, enabled, guildId, handlers]);
}
