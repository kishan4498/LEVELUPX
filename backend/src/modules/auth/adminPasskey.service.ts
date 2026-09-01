import { randomBytes } from "node:crypto";
import type { AdminPasskey } from "@prisma/client";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticatorTransportFuture
} from "@simplewebauthn/server";

import { AppError } from "../../common/errors/AppError.js";
import { env } from "../../config/env.js";
import type { IAdminPasskeyRepository, PrivilegedPasskeyUser } from "./adminPasskey.repository.js";
import type {
  AdminPasskeyDto,
  AdminPasskeyListDto,
  BeginAdminPasskeyAuthenticationDto,
  BeginAdminPasskeyRegistrationDto,
  VerifyAdminPasskeyAuthenticationInput,
  VerifyAdminPasskeyRegistrationDto,
  VerifyAdminPasskeyRegistrationInput
} from "./adminPasskey.types.js";
import type { AuthResponse } from "./auth.types.js";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export class AdminPasskeyService {
  constructor(
    private readonly repo: IAdminPasskeyRepository,
    private readonly issueToken: (
      userId: string,
      adminDeviceId: string,
      passkeyVerified: boolean
    ) => Promise<AuthResponse>,
    private readonly now: () => Date = () => new Date()
  ) {}

  async list(userId: string, passkeyVerified: boolean): Promise<AdminPasskeyListDto> {
    await this.requireAdmin(userId);
    const passkeys = await this.repo.findActiveForUser(userId);
    return {
      passkeys: passkeys.map((passkey) => this.toDto(passkey)),
      passkeyVerified
    };
  }

  async beginRegistration(
    userId: string,
    passkeyVerified: boolean,
    adminDeviceId: string
  ): Promise<BeginAdminPasskeyRegistrationDto> {
    let user = await this.requireAdmin(userId);
    const passkeys = await this.repo.findActiveForUser(userId);

    if (passkeys.length > 0 && !passkeyVerified) {
      throw new AppError("Verify an existing passkey before adding another", 403, "ADMIN_PASSKEY_STEP_UP_REQUIRED");
    }

    if (!user.adminWebAuthnUserId) {
      user = await this.repo.setWebAuthnUserId(user.id, randomBytes(32).toString("base64url"));
    }

    const registration = await generateRegistrationOptions({
      rpName: env.WEBAUTHN_RP_NAME,
      rpID: env.WEBAUTHN_RP_ID,
      userName: user.email,
      userDisplayName: user.name,
      userID: new TextEncoder().encode(user.adminWebAuthnUserId!),
      attestationType: "none",
      timeout: CHALLENGE_TTL_MS,
      excludeCredentials: passkeys.map((passkey) => ({
        id: passkey.credentialId,
        transports: passkey.transports as AuthenticatorTransportFuture[]
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required"
      }
    });

    await this.repo.createChallenge({
      userId,
      type: "REGISTRATION",
      challenge: registration.challenge,
      expiresAt: new Date(this.now().getTime() + CHALLENGE_TTL_MS)
    });

    // Assigning the WebAuthn ID bumps security state, so the browser needs a fresh token.
    const session = await this.issueToken(userId, adminDeviceId, passkeyVerified);

    return { options: registration, session };
  }

  async verifyRegistration(
    userId: string,
    passkeyVerified: boolean,
    adminDeviceId: string,
    registration: VerifyAdminPasskeyRegistrationInput
  ): Promise<VerifyAdminPasskeyRegistrationDto> {
    const user = await this.requireAdmin(userId);
    const passkeys = await this.repo.findActiveForUser(userId);

    if (passkeys.length > 0 && !passkeyVerified) {
      throw new AppError("Verify an existing passkey before adding another", 403, "ADMIN_PASSKEY_STEP_UP_REQUIRED");
    }

    const challenge = await this.repo.consumeChallenge({
      userId,
      type: "REGISTRATION",
      now: this.now()
    });

    if (!challenge) {
      throw new AppError("Passkey registration challenge is invalid or expired", 401, "ADMIN_PASSKEY_CHALLENGE_INVALID");
    }

    let verification;

    try {
      verification = await verifyRegistrationResponse({
        response: registration.response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: env.WEBAUTHN_ORIGIN,
        expectedRPID: env.WEBAUTHN_RP_ID,
        requireUserVerification: true
      });
    } catch {
      throw new AppError("Passkey registration could not be verified", 401, "ADMIN_PASSKEY_REGISTRATION_INVALID");
    }

    if (!verification.verified) {
      throw new AppError("Passkey registration could not be verified", 401, "ADMIN_PASSKEY_REGISTRATION_INVALID");
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    const passkey = await this.repo.create({
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: BigInt(credential.counter),
      webAuthnUserId: user.adminWebAuthnUserId!,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: credential.transports ?? registration.response.response.transports ?? [],
      label: registration.label
    });
    const session = await this.issueToken(userId, adminDeviceId, true);

    return {
      ...session,
      passkey: this.toDto(passkey)
    };
  }

  async beginAuthentication(userId: string): Promise<BeginAdminPasskeyAuthenticationDto> {
    await this.requireAdmin(userId);
    const passkeys = await this.repo.findActiveForUser(userId);

    if (passkeys.length === 0) {
      throw new AppError("No admin passkey is enrolled", 409, "ADMIN_PASSKEY_NOT_ENROLLED");
    }

    const authentication = await generateAuthenticationOptions({
      rpID: env.WEBAUTHN_RP_ID,
      timeout: CHALLENGE_TTL_MS,
      userVerification: "required",
      allowCredentials: passkeys.map((passkey) => ({
        id: passkey.credentialId,
        transports: passkey.transports as AuthenticatorTransportFuture[]
      }))
    });
    await this.repo.createChallenge({
      userId,
      type: "AUTHENTICATION",
      challenge: authentication.challenge,
      expiresAt: new Date(this.now().getTime() + CHALLENGE_TTL_MS)
    });

    return { options: authentication };
  }

  async verifyAuthentication(
    userId: string,
    adminDeviceId: string,
    authentication: VerifyAdminPasskeyAuthenticationInput
  ): Promise<AuthResponse> {
    await this.requireAdmin(userId);
    const challenge = await this.repo.consumeChallenge({
      userId,
      type: "AUTHENTICATION",
      now: this.now()
    });

    if (!challenge) {
      throw new AppError("Passkey challenge is invalid or expired", 401, "ADMIN_PASSKEY_CHALLENGE_INVALID");
    }

    const passkey = await this.repo.findActiveByCredential(userId, authentication.response.id);

    if (!passkey) {
      throw new AppError("Passkey is not registered for this admin", 401, "ADMIN_PASSKEY_INVALID");
    }

    let verification;

    try {
      verification = await verifyAuthenticationResponse({
        response: authentication.response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: env.WEBAUTHN_ORIGIN,
        expectedRPID: env.WEBAUTHN_RP_ID,
        requireUserVerification: true,
        credential: {
          id: passkey.credentialId,
          publicKey: new Uint8Array(passkey.publicKey),
          counter: Number(passkey.counter),
          transports: passkey.transports as AuthenticatorTransportFuture[]
        }
      });
    } catch {
      throw new AppError("Passkey verification failed", 401, "ADMIN_PASSKEY_INVALID");
    }

    if (!verification.verified) {
      throw new AppError("Passkey verification failed", 401, "ADMIN_PASSKEY_INVALID");
    }

    await this.repo.updateUse(passkey.id, BigInt(verification.authenticationInfo.newCounter), this.now());
    return this.issueToken(userId, adminDeviceId, true);
  }

  async remove(userId: string, passkeyVerified: boolean, passkeyId: string): Promise<void> {
    if (!passkeyVerified) {
      throw new AppError("Verify a passkey before changing passkey security", 403, "ADMIN_PASSKEY_STEP_UP_REQUIRED");
    }

    const passkeys = await this.repo.findActiveForUser(userId);

    if (passkeys.length <= 1) {
      throw new AppError(
        "The final admin passkey can only be removed through backend recovery",
        409,
        "ADMIN_LAST_PASSKEY_PROTECTED"
      );
    }

    if (!(await this.repo.delete(passkeyId, userId))) {
      throw new AppError("Passkey not found", 404, "ADMIN_PASSKEY_NOT_FOUND");
    }
  }

  private async requireAdmin(userId: string): Promise<PrivilegedPasskeyUser> {
    const user = await this.repo.findPrivilegedUser(userId);

    if (!user) {
      throw new AppError("Passkeys are available only to active admin accounts", 403, "ADMIN_PASSKEY_FORBIDDEN");
    }

    return user;
  }

  private toDto(passkey: AdminPasskey): AdminPasskeyDto {
    return {
      id: passkey.id,
      label: passkey.label,
      deviceType: passkey.deviceType,
      backedUp: passkey.backedUp,
      transports: passkey.transports,
      lastUsedAt: passkey.lastUsedAt?.toISOString() ?? null,
      createdAt: passkey.createdAt.toISOString()
    };
  }
}
