import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON
} from "@simplewebauthn/server";

import type { AuthResponse } from "./auth.types.js";

export type AdminPasskeyDto = {
  id: string;
  label: string;
  deviceType: string;
  backedUp: boolean;
  transports: string[];
  lastUsedAt: string | null;
  createdAt: string;
};

export type AdminPasskeyListDto = {
  passkeys: AdminPasskeyDto[];
  passkeyVerified: boolean;
};

export type BeginAdminPasskeyRegistrationDto = {
  options: PublicKeyCredentialCreationOptionsJSON;
  session: AuthResponse;
};

export type VerifyAdminPasskeyRegistrationInput = {
  label: string;
  response: RegistrationResponseJSON;
};

export type VerifyAdminPasskeyRegistrationDto = AuthResponse & {
  passkey: AdminPasskeyDto;
};

export type BeginAdminPasskeyAuthenticationDto = {
  options: PublicKeyCredentialRequestOptionsJSON;
};

export type VerifyAdminPasskeyAuthenticationInput = {
  response: AuthenticationResponseJSON;
};
