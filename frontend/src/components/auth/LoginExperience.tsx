"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { KeyRound, LogIn, MailCheck, RotateCcw, ShieldCheck } from "lucide-react";
import { type FormEvent, useState } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/Notice";
import { apiRequest, errorMessage } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import type { AuthResponse, LoginResponse, VerifyEmailResponse } from "@/types/auth";

export type LoginEntry = "member" | "admin";

export function LoginExperience({ entry }: { entry: LoginEntry }) {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.logout);
  const prefersReducedMotion = useReducedMotion();
  const adminEntry = entry === "admin";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoStepCode, setTwoStepCode] = useState("");
  const [adminDeviceKey, setAdminDeviceKey] = useState("");
  const [adminCodeA, setAdminCodeA] = useState("");
  const [adminCodeB, setAdminCodeB] = useState("");
  const [adminCodeC, setAdminCodeC] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [needsEmailCode, setNeedsEmailCode] = useState(false);
  const [needsTwoStep, setNeedsTwoStep] = useState(false);
  const [needsDeviceKey, setNeedsDeviceKey] = useState(false);
  const [adminChallenge, setAdminChallenge] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [devCodes, setDevCodes] = useState<{ codeA: string; codeB: string; codeC: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rootVerified, setRootVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function acceptSession(session: AuthResponse) {
    if (adminEntry && session.user.role === "USER") {
      // Revoke the refresh cookie before dropping the short-lived in-memory token.
      // Otherwise a later API call could silently refresh the rejected member session.
      setSession(session);
      try {
        await apiRequest<{ message: string }>("/auth/logout", {
          method: "POST"
        });
      } catch {
        // The client session is still cleared below even if the revocation request fails.
      }
      clearSession();
      setNeedsTwoStep(false);
      setNeedsDeviceKey(false);
      setAdminChallenge(false);
      setError("This account does not have administrator access. Use the standard member sign-in.");
      return;
    }

    setSession(session);
    if (session.user.role !== "USER") {
      // Privileged API routes remain unavailable until the existing WebAuthn checkpoint succeeds.
      router.push("/admin/security");
      return;
    }

    router.push(session.user.profile?.onboardingCompletedAt ? "/dashboard" : "/onboarding");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (needsEmailCode) {
        const verification = await apiRequest<VerifyEmailResponse>("/auth/email-verification/verify", {
          method: "POST",
          auth: false,
          body: JSON.stringify({ email, password, code: emailCode })
        });

        if ("rootActivationComplete" in verification) {
          setRootVerified(true);
          setMessage(verification.message);
          return;
        }

        await acceptSession(verification);
        return;
      }

      const loginReply = await apiRequest<LoginResponse>("/auth/login", {
        method: "POST",
        auth: false,
        body: JSON.stringify({
          email,
          password,
          ...(adminDeviceKey ? { adminDeviceKey } : {}),
          ...(needsTwoStep && !adminChallenge ? { twoStepCode } : {}),
          ...(adminChallenge && !needsDeviceKey
            ? {
                adminCodeA,
                adminCodeB,
                adminCodeC
              }
            : {})
        })
      });

      if ("emailVerificationRequired" in loginReply) {
        setNeedsEmailCode(true);
        setMessage(loginReply.message);
        setNeedsTwoStep(false);
        setNeedsDeviceKey(false);
        setAdminChallenge(false);
        return;
      }

      if ("twoStepRequired" in loginReply) {
        // A challenge response is not a session; no token is stored before every required factor succeeds.
        setNeedsTwoStep(true);
        setNeedsDeviceKey(loginReply.deviceKeyRequired === true);
        setAdminChallenge(loginReply.adminChallenge === true || loginReply.superAdminChallenge === true);
        setDevCode(loginReply.devCode ?? null);
        setDevCodes(loginReply.devCodes ?? null);
        return;
      }

      await acceptSession(loginReply);
    } catch (err) {
      setError(errorMessage(err, "Login failed"));
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    setLoading(true);
    setError(null);

    try {
      const resendReply = await apiRequest<{ message: string }>("/auth/email-verification/request", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ email, password })
      });
      setEmailCode("");
      setMessage(resendReply.message);
    } catch (err) {
      setError(errorMessage(err, "Verification email could not be sent"));
    } finally {
      setLoading(false);
    }
  }

  function resetLogin() {
    setRootVerified(false);
    setNeedsEmailCode(false);
    setEmailCode("");
  }

  if (rootVerified) {
    return (
      <AuthShell title="Root identity verified" subtitle={message ?? "Trusted-device enrollment is required before sign-in."}>
        <div className="grid gap-4">
          <div className="flex items-center gap-3 rounded-md border border-mint/25 bg-mint/10 px-4 py-3 text-sm font-semibold text-mint">
            <ShieldCheck size={20} />
            Privileged access remains signed out
          </div>
          <Button onClick={resetLogin} type="button">
            <LogIn size={18} />
            Return to login
          </Button>
        </div>
      </AuthShell>
    );
  }

  let action = adminEntry ? "Continue to administrator verification" : "Log in";
  if (loading) action = "Working";
  else if (needsEmailCode) action = "Verify email";
  else if (needsDeviceKey) action = "Verify trusted device";
  else if (needsTwoStep) action = "Verify and log in";

  const title = needsEmailCode
    ? adminEntry ? "Verify administrator email" : "Verify your email"
    : adminChallenge
      ? "Verify privileged factors"
      : adminEntry ? "Administrator sign in" : "Welcome back";
  const subtitle = needsEmailCode
    ? message ?? "Enter the code from your email."
    : adminChallenge
      ? "Complete the trusted-device and administrator code checks. Passkey verification follows."
      : adminEntry
        ? "Use administrator credentials to begin the protected multi-factor access sequence."
        : "Log in to continue your quests and focus progress.";
  const loginStage = needsEmailCode
    ? "email-verification"
    : adminChallenge && !needsDeviceKey
      ? "administrator-codes"
      : adminChallenge
        ? "trusted-device"
        : needsTwoStep
          ? "two-step"
          : "credentials";

  return (
    <AuthShell title={title} subtitle={subtitle}>
      {adminEntry && !needsEmailCode && (
        <Notice space="form" tone="success">
          <span className="inline-flex items-start gap-2">
            <KeyRound className="mt-0.5 shrink-0" size={17} />
            Password sign-in is only the first checkpoint. Trusted-device codes and WebAuthn passkey verification remain required.
          </span>
        </Notice>
      )}
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -6 }}
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          key={loginStage}
          transition={{ duration: prefersReducedMotion ? 0 : 0.18, ease: "easeOut" }}
        >
          <form className="grid gap-4" onSubmit={submit}>
        <Input
          autoComplete="email"
          disabled={needsEmailCode}
          label="Email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          value={email}
        />
        <Input
          autoComplete="current-password"
          label="Password"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
        {needsEmailCode && (
          <Input
            autoComplete="one-time-code"
            inputMode="numeric"
            label="Email verification code"
            name="emailVerificationCode"
            onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
            value={emailCode}
          />
        )}
        {adminChallenge && !needsEmailCode && (
          <Input
            autoComplete="off"
            label="Trusted device key"
            name="adminDeviceKey"
            onChange={(event) => setAdminDeviceKey(event.target.value.trim())}
            type="password"
            value={adminDeviceKey}
          />
        )}
        {needsTwoStep && !adminChallenge && !needsEmailCode && (
          <Input
            autoComplete="one-time-code"
            inputMode="numeric"
            label="Verification code"
            name="twoStepCode"
            onChange={(event) => setTwoStepCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            value={twoStepCode}
          />
        )}
        {adminChallenge && !needsDeviceKey && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              autoComplete="one-time-code"
              inputMode="numeric"
              label="Code A"
              name="adminCodeA"
              onChange={(event) => setAdminCodeA(event.target.value.replace(/\D/g, "").slice(0, 6))}
              value={adminCodeA}
            />
            <Input
              autoComplete="one-time-code"
              inputMode="numeric"
              label="Code B"
              name="adminCodeB"
              onChange={(event) => setAdminCodeB(event.target.value.replace(/\D/g, "").slice(0, 6))}
              value={adminCodeB}
            />
            <Input
              autoComplete="one-time-code"
              inputMode="numeric"
              label="Code C"
              name="adminCodeC"
              onChange={(event) => setAdminCodeC(event.target.value.replace(/\D/g, "").slice(0, 6))}
              value={adminCodeC}
            />
          </div>
        )}
        {devCode && <Notice space="form" tone="success">Development code: {devCode}</Notice>}
        {devCodes && (
          <Notice space="form" tone="success">
            Development codes: {devCodes.codeA} / {devCodes.codeB} / {devCodes.codeC}
          </Notice>
        )}
        {error && <Notice space="form" tone="error">{error}</Notice>}
        <Button disabled={loading} type="submit">
          {needsEmailCode ? <MailCheck size={18} /> : adminEntry ? <ShieldCheck size={18} /> : <LogIn size={18} />}
          {action}
        </Button>
        {needsEmailCode && (
          <Button disabled={loading} onClick={() => void resendCode()} type="button" variant="ghost">
            <RotateCcw size={17} />
            Send new code
          </Button>
        )}
          </form>
        </motion.div>
      </AnimatePresence>
      <p className="mt-5 text-sm text-ink/65">
        Forgot password?{" "}
        <Link className="font-semibold text-violet hover:text-violet/80" href="/forgot-password">
          Reset it
        </Link>
      </p>
      {adminEntry ? (
        <p className="mt-3 text-sm text-ink/65">
          Signing in as a member?{" "}
          <Link className="font-semibold text-violet hover:text-violet/80" href="/login">
            Use standard sign-in
          </Link>
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-ink/65">
            New here?{" "}
            <Link className="font-semibold text-violet hover:text-violet/80" href="/register">
              Create an account
            </Link>
          </p>
          <p className="mt-3 text-sm text-ink/65">
            Administrator?{" "}
            <Link className="font-semibold text-violet hover:text-violet/80" href="/admin/login">
              Use privileged entry
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
