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

export type AuthResp = {
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

export type RootActivated = {
  rootActivationComplete: true;
  message: string;
  user: UserDto;
};

export type SignedOutReset = {
  signInRequired: true;
  message: string;
  user: UserDto;
};

export type RegResp = EmailChallenge;
export type LoginResp = AuthResp | TwoStepChallenge | EmailChallenge;
export type VerifyEmailResp = AuthResp | RootActivated;
export type ResetPwdResp = AuthResp | SignedOutReset;

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

export type ForgotPwdInput = {
  email: string;
};

export type ResetPwdInput = {
  email: string;
  token: string;
  newPassword: string;
};

export type VerifyEmailInput = {
  email: string;
  password: string;
  code: string;
};

export type ReqEmailVerifyInput = {
  email: string;
  password: string;
};

export type TwoStepPrefInput = {
  currentPassword: string;
};
