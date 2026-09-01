import type { Role, UserStatus } from "@prisma/client";
import type { ProfileDto } from "../users/user.types.js";

export type UserDto = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  emailVerifiedAt: string | null;
  twoStepEnabled: boolean;
  profile: ProfileDto | null;
};

export type AuthResponse = {
  user: UserDto;
  accessToken: string;
};

export type TwoStepChallenge = {
  twoStepRequired: true;
  message: string;
  expiresAt: string;
  deviceKeyRequired?: boolean;
  adminChallenge?: boolean;
  superAdminChallenge?: boolean;
  requiredFactors?: string[];
  devCode?: string;
  devCodes?: {
    codeA: string;
    codeB: string;
    codeC: string;
  };
};

export type EmailChallenge = {
  emailVerificationRequired: true;
  message: string;
  expiresAt: string;
  codeLength: 8;
};

export type RootActivationResponse = {
  rootActivationComplete: true;
  message: string;
  user: UserDto;
};

export type SignedOutResetResponse = {
  signInRequired: true;
  message: string;
  user: UserDto;
};

export type RegistrationResponse = EmailChallenge;
export type LoginResponse = AuthResponse | TwoStepChallenge | EmailChallenge;
export type VerifyEmailResponse = AuthResponse | RootActivationResponse;
export type ResetPasswordResponse = AuthResponse | SignedOutResetResponse;

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
};

export type LoginInput = {
  email: string;
  password: string;
  twoStepCode?: string;
  adminDeviceKey?: string;
  adminCodeA?: string;
  adminCodeB?: string;
  adminCodeC?: string;
  superAdminCodeA?: string;
  superAdminCodeB?: string;
  superAdminCodeC?: string;
};

export type ForgotPasswordInput = {
  email: string;
};

export type ResetPasswordInput = {
  email: string;
  token: string;
  newPassword: string;
};

export type VerifyEmailInput = {
  email: string;
  password: string;
  code: string;
};

export type RequestEmailVerificationInput = {
  email: string;
  password: string;
};

export type TwoStepPreferenceInput = {
  currentPassword: string;
};
