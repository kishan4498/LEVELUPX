"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { RouteFallback } from "@/components/ui/PagePrimitives";
import { restoreSession } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

export default function HomePage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.sessStatus);

  useEffect(() => {
    if (status === "checking" && !accessToken) {
      void restoreSession();
      return;
    }

    if (status === "checking") {
      return;
    }

    if (!accessToken) {
      router.replace("/login");
    } else if (user?.role !== "USER") {
      router.replace("/admin/security");
    } else {
      router.replace(user.profile?.onboardingCompletedAt ? "/dashboard" : "/onboarding");
    }
  }, [accessToken, router, status, user]);

  return <RouteFallback />;
}
