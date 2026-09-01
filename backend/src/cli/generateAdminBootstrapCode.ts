import "dotenv/config";

import { prisma } from "../prisma/client.js";
import { generateAdminBootstrapCode } from "../modules/auth/adminBootstrapCode.js";

type CliArgs = {
  email?: string;
  expiresInMinutes?: number;
};

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (!flags.email) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const generated = await generateAdminBootstrapCode(
    {
      findUserByEmail(email) {
        return prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            role: true,
            status: true
          }
        });
      },
      async setTwoStepChallenge(challenge) {
        await prisma.user.update({
          where: { id: challenge.userId },
          data: {
            twoStepCodeHash: challenge.codeHash,
            twoStepExpiresAt: challenge.expiresAt
          }
        });
      }
    },
    {
      email: flags.email,
      expiresInMinutes: flags.expiresInMinutes
    }
  );

  console.log("LevelUpX admin bootstrap verification code");
  console.log(`Email: ${generated.email}`);
  console.log(`Role: ${generated.role}`);
  console.log(`Code: ${generated.code}`);
  console.log(`Expires at: ${generated.expiresAt}`);
  console.log(`Expires in: ${generated.expiresInMinutes} minutes`);
  console.log("Submit this code on the login screen. After successful verification, two-step is enabled for the account.");
}

function parseArgs(tokens: string[]): CliArgs {
  const parsed: CliArgs = {};

  for (let i = 0; i < tokens.length; i += 1) {
    const arg = tokens[i];

    if (arg === "--email") {
      parsed.email = tokens[i + 1];
      i += 1;
      continue;
    }

    if (arg?.startsWith("--email=")) {
      parsed.email = arg.slice("--email=".length);
      continue;
    }

    if (arg === "--expires-minutes") {
      parsed.expiresInMinutes = Number(tokens[i + 1]);
      i += 1;
      continue;
    }

    if (arg?.startsWith("--expires-minutes=")) {
      parsed.expiresInMinutes = Number(arg.slice("--expires-minutes=".length));
    }
  }

  return parsed;
}

function printUsage() {
  console.error("Usage: npm run auth:admin-bootstrap -- --email admin@example.com [--expires-minutes 10]");
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);

    console.error(`Admin bootstrap code generation failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
