"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/Notice";
import { apiRequest, errorMessage } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import type { ResetPasswordResponse } from "@/types/auth";

export default function ResetPasswordPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [signedOutMessage, setSignedOutMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const resetReply = await apiRequest<ResetPasswordResponse>("/auth/reset-password", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ email, token, newPassword })
      });

      if ("signInRequired" in resetReply) {
        setSignedOutMessage(resetReply.message);
        return;
      }

      setSession(resetReply);
      router.push("/dashboard");
    } catch (err) {
      setError(errorMessage(err, "Password reset failed"));
    } finally {
      setLoading(false);
    }
  }

  if (signedOutMessage) {
    return (
      <AuthShell title="Password secured" subtitle={signedOutMessage}>
        <div className="grid gap-4">
          <div className="flex items-center gap-3 rounded-md border border-mint/25 bg-mint/10 px-4 py-3 text-sm font-semibold text-mint">
            <ShieldCheck size={20} />
            Privileged sessions were revoked
          </div>
          <Link className="lx-button inline-flex h-11 items-center justify-center rounded-md border border-ink bg-ink px-4 text-sm font-bold text-white" href="/login">
            Go to login
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="New password" subtitle="Use your reset token to secure the account again.">
      <form className="grid gap-4" onSubmit={submit}>
        <Input label="Email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <Input label="Reset token" name="token" value={token} onChange={(event) => setToken(event.target.value)} />
        <Input
          label="New password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        {error && <Notice space="form" tone="error">{error}</Notice>}
        <Button disabled={loading} type="submit">
          <KeyRound size={18} />
          {loading ? "Resetting password" : "Reset password"}
        </Button>
      </form>
    </AuthShell>
  );
}
