import { describe, expect, it } from "vitest";

import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, twoStepPreferenceSchema } from "./auth.validation.js";

describe("auth validation", () => {
  it("normalizes register email and trims the name", () => {
    const parsed = registerSchema.parse({
      name: "  Ada Lovelace  ",
      email: "  ADA@EXAMPLE.COM  ",
      password: "correct-horse"
    });

    expect(parsed).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "correct-horse"
    });
  });

  it("rejects short registration passwords", () => {
    const parsed = registerSchema.safeParse({
      name: "Ada",
      email: "ada@example.com",
      password: "short"
    });

    expect(parsed.success).toBe(false);
  });

  it("normalizes login email and keeps non-empty passwords", () => {
    const parsed = loginSchema.parse({
      email: " USER@EXAMPLE.COM ",
      password: "password"
    });

    expect(parsed.email).toBe("user@example.com");
    expect(parsed.password).toBe("password");
  });

  it("accepts a six digit two-step code during login", () => {
    const parsed = loginSchema.parse({
      email: "user@example.com",
      password: "password",
      twoStepCode: "123456"
    });

    expect(parsed.twoStepCode).toBe("123456");
  });

  it("normalizes forgot and reset password payloads", () => {
    expect(forgotPasswordSchema.parse({ email: " USER@EXAMPLE.COM " })).toEqual({
      email: "user@example.com"
    });
    expect(
      resetPasswordSchema.parse({
        email: " USER@EXAMPLE.COM ",
        token: "a".repeat(32),
        newPassword: "new-password"
      })
    ).toEqual({
      email: "user@example.com",
      token: "a".repeat(32),
      newPassword: "new-password"
    });
  });

  it("requires a current password for two-step preference changes", () => {
    expect(twoStepPreferenceSchema.safeParse({ currentPassword: "" }).success).toBe(false);
    expect(twoStepPreferenceSchema.safeParse({ currentPassword: "password" }).success).toBe(true);
  });
});
