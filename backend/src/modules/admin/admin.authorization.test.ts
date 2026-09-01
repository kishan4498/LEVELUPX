import { Role } from "@prisma/client";
import express, { type Express, type RequestHandler } from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";

const accessSecret = "test-access-secret-with-at-least-32-characters";
let app: Express;

function accessToken(role: Role) {
  return jwt.sign(
    {
      id: `${role.toLowerCase()}-user`,
      email: `${role.toLowerCase()}@example.com`,
      role,
      type: "access"
    },
    accessSecret
  );
}

beforeAll(async () => {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/levelupx_test?schema=public");
  vi.stubEnv("JWT_ACCESS_SECRET", accessSecret);
  vi.stubEnv("JWT_REFRESH_SECRET", "test-refresh-secret-with-at-least-32-characters");

  const [{ authMiddleware }, { requireRole }] = await Promise.all([
    import("../../common/middlewares/authMiddleware.js"),
    import("../../common/middlewares/roleMiddleware.js")
  ]);

  app = express();
  app.use(express.json());
  const okHandler: RequestHandler = (_req, res) => {
    res.json({ ok: true });
  };

  app.get("/admin/dashboard", authMiddleware, requireRole(Role.ADMIN, Role.SUPER_ADMIN), okHandler);

  app.patch(
    "/admin/users/:id/role",
    authMiddleware,
    requireRole(Role.ADMIN, Role.SUPER_ADMIN),
    requireRole(Role.SUPER_ADMIN),
    okHandler
  );
});

describe("admin authorization", () => {
  it("rejects unauthenticated admin requests", async () => {
    const res = await request(app).get("/admin/dashboard").expect(401);

    expect(res.body).toEqual({});
  });

  it("blocks normal users from admin routes", async () => {
    const res = await request(app)
      .get("/admin/dashboard")
      .set("Authorization", `Bearer ${accessToken(Role.USER)}`)
      .expect(403);

    expect(res.body).toEqual({});
  });

  it("allows admins through general admin routes", async () => {
    const res = await request(app)
      .get("/admin/dashboard")
      .set("Authorization", `Bearer ${accessToken(Role.ADMIN)}`)
      .expect(200);

    expect(res.body).toEqual({ ok: true });
  });

  it("blocks admins from SUPER_ADMIN-only role management", async () => {
    const res = await request(app)
      .patch("/admin/users/user-1/role")
      .set("Authorization", `Bearer ${accessToken(Role.ADMIN)}`)
      .send({ role: Role.ADMIN })
      .expect(403);

    expect(res.body).toEqual({});
  });

  it("allows super admins through SUPER_ADMIN-only role management", async () => {
    const res = await request(app)
      .patch("/admin/users/user-1/role")
      .set("Authorization", `Bearer ${accessToken(Role.SUPER_ADMIN)}`)
      .send({ role: Role.ADMIN })
      .expect(200);

    expect(res.body).toEqual({ ok: true });
  });
});
