"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { restoreSession } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

export function useRequireAuth() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.sessStatus);
  const restoreStarted = useRef(false);

  useEffect(() => {
    if (status === "checking" && !accessToken && !restoreStarted.current) {
      restoreStarted.current = true;
      void restoreSession();
    }
  }, [accessToken, status]);

  useEffect(() => {
    if (status === "anonymous") {
      // Do not leave protected pages in browser history after logout.
      router.replace("/login");
    }
  }, [router, status]);

  return { accessToken, user, sessStatus: status };
}
