export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN" | "SUPER_ADMIN";
  status: "ACTIVE" | "BANNED" | "SUSPENDED";
  emailVerifiedAt: string | null;
  twoStepEnabled: boolean;
  profile: {
    id?: string;
    avatarUrl?: string | null;
    level: number;
    totalXp: number;
    coins: number;
    currentStreak: number;
    longestStreak: number;
    timezone?: string;
    productivityMode?: "STUDENT" | "PROFESSIONAL" | "PERSONAL";
    preferredFocusMinutes?: number;
    dailyGoalMinutes?: number;
    onboardingCompletedAt?: string | null;
    selectedCharacterClass?: {
      id: string;
      name: string;
      description: string;
      baseXpMultiplier: number;
    } | null;
    selectedCosmetic?: {
      id: string;
      name: string;
      description: string;
      slot: "AVATAR_FRAME" | "PROFILE_BADGE";
      rarity: "COMMON" | "RARE" | "EPIC" | "LEGENDARY";
      unlockLevel: number;
      coinPrice: number;
      owned: boolean;
      selected: boolean;
      unlockedAt: string | null;
    } | null;
  } | null;
};

export type AuthResponse = {
  user: AuthUser;
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

export type EmailVerificationChallenge = {
  emailVerificationRequired: true;
  message: string;
  expiresAt: string;
  codeLength: 8;
};

export type RootActivationComplete = {
  rootActivationComplete: true;
  message: string;
  user: AuthUser;
};

export type SignedOutPasswordReset = {
  signInRequired: true;
  message: string;
  user: AuthUser;
};

export type RegistrationResponse = EmailVerificationChallenge;
export type LoginResponse = AuthResponse | TwoStepChallenge | EmailVerificationChallenge;
export type VerifyEmailResponse = AuthResponse | RootActivationComplete;
export type ResetPasswordResponse = AuthResponse | SignedOutPasswordReset;
