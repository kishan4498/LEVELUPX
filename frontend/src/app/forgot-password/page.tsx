"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { KeyRound } from "lucide-react";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/Notice";
import { apiRequest, errorMessage } from "@/lib/api";

type ForgotPasswordResponse = {
  message: string;
  devResetToken?: string;
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    setDevToken(null);

    try {
      const resetReply = await apiRequest<ForgotPasswordResponse>("/auth/forgot-password", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ email })
      });

      setMessage(resetReply.message);
      setDevToken(resetReply.devResetToken ?? null);
    } catch (err) {
      setError(errorMessage(err, "Password reset failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Reset password" subtitle="Request a secure reset token for your LevelUpX account.">
      <form className="grid gap-4" onSubmit={submit}>
        <Input label="Email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        {message && <Notice space="form" tone="success">{message}</Notice>}
        {devToken && (
          <p className="break-words rounded-md bg-paper px-3 py-2 text-sm text-ink/70">
            Development token: {devToken}
          </p>
        )}
        {error && <Notice space="form" tone="error">{error}</Notice>}
        <Button disabled={loading} type="submit">
          <KeyRound size={18} />
          {loading ? "Requesting reset" : "Request reset"}
        </Button>
      </form>
      <p className="mt-5 text-sm text-ink/60">
        Have a token?{" "}
        <Link className="font-semibold text-violet hover:text-violet/80" href="/reset-password">
          Set a new password
        </Link>
      </p>
    </AuthShell>
  );
}
