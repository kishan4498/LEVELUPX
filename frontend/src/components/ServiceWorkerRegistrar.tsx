"use client";

import { useEffect } from "react";

import { flushOfflineActions } from "@/lib/offlineQueue";
import { useAuthStore } from "@/store/auth.store";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    const flush = () => {
      if (useAuthStore.getState().accessToken) {
        void flushOfflineActions();
      }
    };
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "FLUSH_OFFLINE_ACTIONS") {
        flush();
      }
    };
    const unsubscribe = useAuthStore.subscribe((auth, previousAuth) => {
      if (auth.accessToken && !previousAuth.accessToken) {
        flush();
      }
    });

    window.addEventListener("online", flush);
    navigator.serviceWorker?.addEventListener("message", onMessage);

    const register = () => {
      if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
        void navigator.serviceWorker.register("/sw.js");
      }
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    flush();

    return () => {
      unsubscribe();
      window.removeEventListener("online", flush);
      window.removeEventListener("load", register);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);

  return null;
}
