import { Role } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { AuthRequest } from "../types/auth.types.js";
import { requireRole } from "./roleMiddleware.js";

describe("requireRole", () => {
  it("allows users with an accepted role", () => {
    const middleware = requireRole(Role.SUPER_ADMIN);
    const req = {
      user: {
        id: "super-admin-1",
        email: "super@example.com",
        role: Role.SUPER_ADMIN
      }
    } as AuthRequest;
    const next = vi.fn();

    middleware(req, {} as never, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("rejects users without an accepted role", () => {
    const middleware = requireRole(Role.SUPER_ADMIN);
    const req = {
      user: {
        id: "admin-1",
        email: "admin@example.com",
        role: Role.ADMIN
      }
    } as AuthRequest;
    const next = vi.fn();

    middleware(req, {} as never, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "FORBIDDEN",
        statusCode: 403
      })
    );
  });
});
