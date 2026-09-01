import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/store/auth.store";
import type { AuthResponse, TwoStepChallenge } from "@/types/auth";
import { LoginExperience } from "./LoginExperience";

const testMocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  push: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: testMocks.push })
}));

vi.mock("@/lib/api", () => ({
  apiRequest: testMocks.apiRequest,
  errorMessage: (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback
}));

const adminSession: AuthResponse = {
  accessToken: "admin-token",
  user: {
    id: "admin-1",
    name: "Administrator",
    email: "admin@example.test",
    role: "ADMIN",
    status: "ACTIVE",
    emailVerifiedAt: "2026-05-20T00:00:00.000Z",
    twoStepEnabled: true,
    profile: null
  }
};

const memberSession: AuthResponse = {
  accessToken: "member-token",
  user: {
    ...adminSession.user,
    id: "member-1",
    name: "Member",
    email: "member@example.test",
    role: "USER"
  }
};

const deviceChallenge: TwoStepChallenge = {
  twoStepRequired: true,
  message: "Trusted device required",
  expiresAt: "2026-05-20T00:05:00.000Z",
  adminChallenge: true,
  deviceKeyRequired: true
};

const codeChallenge: TwoStepChallenge = {
  ...deviceChallenge,
  message: "Administrator codes required",
  deviceKeyRequired: false
};

function enterCredentials(email = "admin@example.test") {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-password" } });
}

describe("LoginExperience administrator entry", () => {
  beforeEach(() => {
    testMocks.apiRequest.mockReset();
    testMocks.push.mockReset();
    useAuthStore.getState().logout();
  });

  afterEach(() => {
    cleanup();
  });

  it("preserves the trusted-device and administrator-code sequence before WebAuthn routing", async () => {
    testMocks.apiRequest
      .mockResolvedValueOnce(deviceChallenge)
      .mockResolvedValueOnce(codeChallenge)
      .mockResolvedValueOnce(adminSession);

    render(<LoginExperience entry="admin" />);
    enterCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Continue to administrator verification" }));

    await screen.findByLabelText("Trusted device key");
    fireEvent.change(screen.getByLabelText("Trusted device key"), { target: { value: "device-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify trusted device" }));

    await screen.findByLabelText("Code A");
    fireEvent.change(screen.getByLabelText("Code A"), { target: { value: "111111" } });
    fireEvent.change(screen.getByLabelText("Code B"), { target: { value: "222222" } });
    fireEvent.change(screen.getByLabelText("Code C"), { target: { value: "333333" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and log in" }));

    await waitFor(() => expect(testMocks.push).toHaveBeenCalledWith("/admin/security"));
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: "admin-token",
      user: adminSession.user,
      sessStatus: "authenticated"
    });

    const deviceRequest = JSON.parse(String(testMocks.apiRequest.mock.calls[1]?.[1]?.body));
    const codeRequest = JSON.parse(String(testMocks.apiRequest.mock.calls[2]?.[1]?.body));
    expect(deviceRequest).toMatchObject({ adminDeviceKey: "device-key" });
    expect(deviceRequest).not.toHaveProperty("adminCodeA");
    expect(codeRequest).toMatchObject({
      adminDeviceKey: "device-key",
      adminCodeA: "111111",
      adminCodeB: "222222",
      adminCodeC: "333333"
    });
  });

  it("does not retain a member session entered through the privileged route", async () => {
    testMocks.apiRequest
      .mockResolvedValueOnce(memberSession)
      .mockResolvedValueOnce({ message: "Signed out" });

    render(<LoginExperience entry="admin" />);
    enterCredentials("member@example.test");
    fireEvent.click(screen.getByRole("button", { name: "Continue to administrator verification" }));

    expect(await screen.findByText(/does not have administrator access/i)).toBeInTheDocument();
    expect(testMocks.apiRequest).toHaveBeenNthCalledWith(2, "/auth/logout", {
      method: "POST"
    });
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: null,
      user: null,
      sessStatus: "anonymous"
    });
    expect(testMocks.push).not.toHaveBeenCalled();
  });
});
