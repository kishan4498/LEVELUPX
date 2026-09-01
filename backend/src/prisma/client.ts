import { PrismaClient } from "@prisma/client";

declare global {
  // Reuse the client during local hot reloads to avoid leaking connections.
  var levelupxPrisma: PrismaClient | undefined;
}

export const prisma = globalThis.levelupxPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.levelupxPrisma = prisma;
}
