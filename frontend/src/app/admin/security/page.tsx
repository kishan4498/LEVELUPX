"use client";

import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration
} from "@simplewebauthn/browser";
import { Fingerprint, KeyRound, MonitorSmartphone, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PanelHeader, RouteFallback } from "@/components/ui/PagePrimitives";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { apiRequest, errorMessage } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import type {
  AdminAuthenticationOptions,
  AdminPasskeyList,
  AdminPasskeyRegistrationResult,
  AdminRegistrationOptions
} from "@/types/adminPasskey";
import type { AdminTrustedDevice, AdminTrustedDeviceList } from "@/types/adminTrustedDevice";
import type { AuthResponse } from "@/types/auth";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short"
});

function formatDate(timestamp: string) {
  return dateFormatter.format(new Date(timestamp));
}

export default function AdminSecurityPage() {
  const router = useRouter();
  const { accessToken, user } = useRequireAuth();
  const setSession = useAuthStore((s) => s.setSession);
  const [passkeyState, setPasskeyState] = useState<AdminPasskeyList | null>(null);
  const [deviceState, setDeviceState] = useState<AdminTrustedDeviceList | null>(null);
  const [label, setLabel] = useState("Primary passkey");
  const [busy, setBusy] = useState<"loading" | "registering" | "verifying" | "removing" | null>("loading");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPasskeys = useCallback(async () => {
    const passkeyList = await apiRequest<AdminPasskeyList>("/auth/admin-passkeys");
    setPasskeyState(passkeyList);
    return passkeyList;
  }, []);

  const loadDevices = useCallback(async () => {
    const trustedDevices = await apiRequest<AdminTrustedDeviceList>("/auth/admin-devices");
    setDeviceState(trustedDevices);
  }, []);

  useEffect(() => {
    if (!accessToken || !user) {
      return;
    }

    if (user.role === "USER") {
      router.replace("/dashboard");
      return;
    }

    setBusy("loading");
    void loadPasskeys()
      .then(({ passkeyVerified }) => (passkeyVerified ? loadDevices() : undefined))
      .catch((err) => setError(errorMessage(err, "Could not load passkey security")))
      .finally(() => setBusy(null));
  }, [accessToken, loadDevices, loadPasskeys, router, user]);

  async function registerPasskey() {
    if (!browserSupportsWebAuthn()) {
      setError("This browser does not support passkeys.");
      return;
    }

    setBusy("registering");
    setError(null);

    try {
      const { options: credentialOptions, session } = await apiRequest<AdminRegistrationOptions>(
        "/auth/admin-passkeys/registration/options",
        { method: "POST" }
      );
      setSession(session);
      const credential = await startRegistration({ optionsJSON: credentialOptions });
      const auth = await apiRequest<AdminPasskeyRegistrationResult>(
        "/auth/admin-passkeys/registration/verify",
        {
          method: "POST",
          body: JSON.stringify({ label, response: credential })
        }
      );
      setSession(auth);
      await Promise.all([loadPasskeys(), loadDevices()]);
    } catch (err) {
      setError(errorMessage(err, "Passkey registration failed"));
    } finally {
      setBusy(null);
    }
  }

  async function verifyPasskey() {
    if (!browserSupportsWebAuthn()) {
      setError("This browser does not support passkeys.");
      return;
    }

    setBusy("verifying");
    setError(null);

    try {
      const { options: credentialOptions } = await apiRequest<AdminAuthenticationOptions>(
        "/auth/admin-passkeys/authentication/options",
        { method: "POST" }
      );
      const credential = await startAuthentication({ optionsJSON: credentialOptions });
      const auth = await apiRequest<AuthResponse>(
        "/auth/admin-passkeys/authentication/verify",
        {
          method: "POST",
          body: JSON.stringify({ response: credential })
        }
      );
      setSession(auth);
      await Promise.all([loadPasskeys(), loadDevices()]);
    } catch (err) {
      setError(errorMessage(err, "Passkey verification failed"));
    } finally {
      setBusy(null);
    }
  }

  async function removePasskey(id: string) {
    setBusy("removing");
    setError(null);

    try {
      await apiRequest<void>(`/auth/admin-passkeys/${id}`, { method: "DELETE" });
      await loadPasskeys();
    } catch (err) {
      setError(errorMessage(err, "Passkey removal failed"));
    } finally {
      setBusy(null);
    }
  }

  async function revokeDevice(id: string) {
    setRemovingId(id);
    setError(null);

    try {
      await apiRequest<void>(`/auth/admin-devices/${id}`, { method: "DELETE" });
      await loadDevices();
    } catch (err) {
      setError(errorMessage(err, "Trusted device revocation failed"));
    } finally {
      setRemovingId(null);
    }
  }

  if (!accessToken || !user || user.role === "USER") {
    return <RouteFallback />;
  }

  const passkeys = passkeyState?.passkeys ?? [];
  const verified = passkeyState?.passkeyVerified === true;
  const devices = deviceState?.devices ?? [];

  return (
    <AppShell eyebrow="Privileged access" title="Admin security checkpoint">
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-md border border-ink bg-ink text-white shadow-command">
          <div className="border-b border-white/10 p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-mint text-white">
                <Fingerprint size={22} />
              </span>
              <div>
                <p className="text-xs font-bold uppercase text-white/45">Session factor</p>
                <h2 className="mt-1 text-xl font-bold">
                  {verified ? "Passkey verified" : passkeys.length > 0 ? "Passkey verification required" : "Enroll the first passkey"}
                </h2>
                <p className="mt-2 text-sm text-white/55">
                  {verified ? "This token can access privileged routes." : "Complete the hardware-backed checkpoint to continue."}
                </p>
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-6">
            {passkeys.length === 0 ? (
              <div className="max-w-md">
                <Input
                  label="Passkey name"
                  name="passkeyLabel"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                />
                <Button
                  className="mt-4"
                  disabled={busy !== null || label.trim().length < 2}
                  onClick={() => void registerPasskey()}
                >
                  <KeyRound size={18} />
                  {busy === "registering" ? "Waiting for authenticator" : "Enroll passkey"}
                </Button>
              </div>
            ) : (
              <Button disabled={busy !== null || verified} onClick={() => void verifyPasskey()}>
                <Fingerprint size={18} />
                {verified ? "Session verified" : busy === "verifying" ? "Waiting for authenticator" : "Verify passkey"}
              </Button>
            )}

            {error && <p className="mt-4 rounded-md bg-ember/15 px-3 py-2 text-sm text-ember">{error}</p>}

            {verified && (
              <Link
                className="lx-button mt-4 inline-flex h-11 items-center gap-2 rounded-md border border-mint bg-mint px-4 text-sm font-bold text-white"
                href="/admin"
              >
                <ShieldCheck size={18} />
                Open admin console
              </Link>
            )}
          </div>
        </div>

        <aside className="rounded-md border border-line bg-white p-5 shadow-panel">
          <div className="flex items-center gap-2 text-sm font-bold text-violet">
            <KeyRound size={17} />
            Enrolled passkeys
          </div>
          <div className="mt-4 divide-y divide-line border-y border-line">
            {passkeys.map((passkey) => (
              <div className="flex min-h-[78px] items-center gap-3 py-3" key={passkey.id}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-mint/10 text-mint">
                  <Fingerprint size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{passkey.label}</p>
                  <p className="mt-1 text-xs text-ink/45">
                    {passkey.backedUp ? "Synced credential" : "Device credential"}
                  </p>
                </div>
                {passkeys.length > 1 && verified && (
                  <button
                    aria-label={`Remove ${passkey.label}`}
                    className="lx-button flex h-9 w-9 items-center justify-center rounded-md border border-line text-ink/45 hover:border-ember hover:text-ember"
                    disabled={busy !== null}
                    onClick={() => void removePasskey(passkey.id)}
                    title="Remove passkey"
                    type="button"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
            {!busy && passkeys.length === 0 && (
              <p className="py-4 text-sm text-ink/45">No passkey enrolled.</p>
            )}
            {busy === "loading" && <p className="py-4 text-sm text-ink/45">Loading security state...</p>}
          </div>

          {verified && passkeys.length > 0 && (
            <div className="mt-4">
              <Input
                label="New passkey name"
                name="additionalPasskeyLabel"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
              <Button
                className="mt-3"
                disabled={busy !== null || label.trim().length < 2}
                onClick={() => void registerPasskey()}
                variant="secondary"
              >
                <KeyRound size={17} />
                Add passkey
              </Button>
            </div>
          )}
        </aside>
      </section>

      {verified && (
        <section className="mt-6 border-y border-line py-5 sm:py-6">
          <PanelHeader>
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-violet">
                <MonitorSmartphone size={18} />
                Trusted devices
              </div>
              <p className="mt-1 text-sm text-ink/50">
                {devices.length} active {devices.length === 1 ? "device" : "devices"}
              </p>
            </div>
          </PanelHeader>

          <div className="mt-4 divide-y divide-line border-y border-line">
            {devices.map((device) => (
              <TrustedDeviceRow
                canRevoke={devices.length > 1}
                device={device}
                key={device.id}
                onRevoke={revokeDevice}
                removing={removingId !== null}
              />
            ))}
            {deviceState === null && (
              <p className="py-4 text-sm text-ink/45">Loading trusted devices...</p>
            )}
          </div>
        </section>
      )}
    </AppShell>
  );
}

function TrustedDeviceRow({
  canRevoke,
  device,
  onRevoke,
  removing
}: {
  canRevoke: boolean;
  device: AdminTrustedDevice;
  onRevoke: (id: string) => Promise<void>;
  removing: boolean;
}) {
  return (
    <div className="flex min-h-[76px] items-center gap-3 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-violet/10 text-violet">
        <MonitorSmartphone size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-sm font-bold">{device.label}</p>
          {device.current && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-mint">
              <ShieldCheck size={13} />
              Current
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-ink/45">
          {device.lastUsedAt ? `Last used ${formatDate(device.lastUsedAt)}` : `Added ${formatDate(device.createdAt)}`}
        </p>
      </div>
      {!device.current && canRevoke && (
        <button
          aria-label={`Revoke ${device.label}`}
          className="lx-button flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line text-ink/45 hover:border-ember hover:text-ember"
          disabled={removing}
          onClick={() => void onRevoke(device.id)}
          title="Revoke trusted device"
          type="button"
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}
