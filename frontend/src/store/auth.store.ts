"use client";

import { create } from "zustand";

import type { AuthUser } from "@/types/auth";

export type SessStatus = "checking" | "authenticated" | "anonymous";

type AuthStore = {
  accessToken: string | null;
  user: AuthUser | null;
  sessStatus: SessStatus;
  setSession: (session: { accessToken: string; user: AuthUser }) => void;
  setUser: (user: AuthUser) => void;
  startCheck: () => void;
  logout: () => void;
};

export const useAuthStore = create<AuthStore>((set) => ({
  accessToken: null,
  user: null,
  sessStatus: "checking",
  setSession: ({ accessToken, user }) => set({ accessToken, user, sessStatus: "authenticated" }),
  setUser: (user) => set({ user }),
  startCheck: () => set({ sessStatus: "checking" }),
  logout: () => set({ accessToken: null, user: null, sessStatus: "anonymous" })
}));
