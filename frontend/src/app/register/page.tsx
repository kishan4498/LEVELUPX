"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailCheck, RotateCcw, ShieldCheck, UserPlus } from "lucide-react";
import { type FormEvent, useState } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/Notice";
import { apiRequest, errorMessage } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import type { RegistrationResponse, VerifyEmailResponse } from "@/types/auth";

export default function RegisterPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rootVerified, setRootVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (needsVerification) {
        const verification = await apiRequest<VerifyEmailResponse>("/auth/email-verification/verify", {
          method: "POST",
          auth: false,
          body: JSON.stringify({ email, password, code })
        });

        if ("rootActivationComplete" in verification) {
          setRootVerified(true);
          setMessage(verification.message);
          return;
        }

        setSession(verification);
        router.push("/onboarding");
        return;
      }

      const registration = await apiRequest<RegistrationResponse>("/auth/register", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ name, email, password })
      });

      setNeedsVerification(true);
      setMessage(registration.message);
    } catch (err) {
      setError(errorMessage(err, "Registration failed"));
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    setLoading(true);
    setError(null);

    try {
      const resendReply = await apiRequest<RegistrationResponse>("/auth/email-verification/request", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ email, password })
      });
      setCode("");
      setMessage(resendReply.message);
    } catch (err) {
      setError(errorMessage(err, "Verification email could not be sent"));
    } finally {
      setLoading(false);
    }
  }

  if (rootVerified) {
    return (
      <AuthShell title="Root identity verified" subtitle={message ?? "Trusted-device enrollment is required before sign-in."}>
        <div className="grid gap-4">
          <div className="flex items-center gap-3 rounded-md border border-mint/25 bg-mint/10 px-4 py-3 text-sm font-semibold text-mint">
            <ShieldCheck size={20} />
            Privileged access remains signed out
          </div>
          <Link className="lx-button inline-flex h-11 items-center justify-center rounded-md border border-ink bg-ink px-4 text-sm font-bold text-white" href="/login">
            Go to login
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={needsVerification ? "Verify your email" : "Create your account"}
      subtitle={needsVerification ? message ?? "Enter the code from your email." : "Create a secure profile, then choose your class and first quest."}
    >
      <form className="grid gap-4" onSubmit={submit}>
        {needsVerification ? (
          <>
            <Input label="Email" name="email" type="email" value={email} disabled />
            <Input
              label="Email verification code"
              name="verificationCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
            />
          </>
        ) : (
          <>
            <Input label="Name" name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
            <Input label="Email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            <Input
              label="Password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </>
        )}
        {error && <Notice space="form" tone="error">{error}</Notice>}
        <Button disabled={loading} type="submit">
          {needsVerification ? <MailCheck size={18} /> : <UserPlus size={18} />}
          {loading ? "Working" : needsVerification ? "Verify email" : "Create account"}
        </Button>
        {needsVerification && (
          <Button disabled={loading} onClick={() => void resendCode()} type="button" variant="ghost">
            <RotateCcw size={17} />
            Send new code
          </Button>
        )}
      </form>
      <p className="mt-5 text-sm text-ink/65">
        Already have an account?{" "}
        <Link className="font-semibold text-violet hover:text-violet/80" href="/login">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
