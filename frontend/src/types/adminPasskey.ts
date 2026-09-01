import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON
} from "@simplewebauthn/browser";

import type { AuthResponse } from "./auth";

export type AdminPasskey = {
  id: string;
  label: string;
  deviceType: string;
  backedUp: boolean;
  transports: string[];
  lastUsedAt: string | null;
  createdAt: string;
};

export type AdminPasskeyList = {
  passkeys: AdminPasskey[];
  passkeyVerified: boolean;
};

export type AdminRegistrationOptions = {
  options: PublicKeyCredentialCreationOptionsJSON;
  session: AuthResponse;
};

export type AdminAuthenticationOptions = {
  options: PublicKeyCredentialRequestOptionsJSON;
};

export type AdminPasskeyRegistrationResult = AuthResponse & {
  passkey: AdminPasskey;
};
