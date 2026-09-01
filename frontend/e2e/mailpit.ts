import { expect, type APIRequestContext } from "@playwright/test";

const mailpitUrl = (process.env.MAILPIT_URL ?? "http://127.0.0.1:8025").replace(/\/$/, "");

export async function latestMailText(request: APIRequestContext, recipient: string) {
  const res = await request.get(latestMessageUrl(recipient));

  if (res.status() === 404) {
    return null;
  }

  expect(res.ok(), `Mailpit returned ${res.status()} while reading mail for ${recipient}`).toBe(true);
  return res.text();
}

export async function waitForNewMail(
  request: APIRequestContext,
  recipient: string,
  previous: string | null
) {
  let mail: string | null = null;

  await expect
    .poll(
      async () => {
        const next = await latestMailText(request, recipient);

        if (!next || next === previous) {
          return false;
        }

        mail = next;
        return true;
      },
      { message: `a new auth email should arrive for ${recipient}`, timeout: 15_000 }
    )
    .toBe(true);

  return mail!;
}

export function readSingleCode(message: string) {
  const match = message.match(/\bCode:\s*(\d{6})\b/);
  expect(match, "the delivered auth email should contain one six-digit code").not.toBeNull();
  return match![1];
}

export function readVerificationCode(message: string) {
  const match = message.match(/\bVerification code:\s*(\d{8})\b/);
  expect(match, "the delivered verification email should contain one eight-digit code").not.toBeNull();
  return match![1];
}

export function readAdminCodes(message: string) {
  const match = message.match(/Code A:\s*(\d{6})[\s\S]*Code B:\s*(\d{6})[\s\S]*Code C:\s*(\d{6})/);
  expect(match, "the delivered admin email should contain all three six-digit codes").not.toBeNull();
  return { codeA: match![1], codeB: match![2], codeC: match![3] };
}

export function readResetToken(message: string) {
  const match = message.match(/\b[a-f0-9]{64}\b/);
  expect(match, "the delivered password reset email should contain a 64-character token").not.toBeNull();
  return match![0];
}

function latestMessageUrl(recipient: string) {
  const url = new URL("/view/latest.txt", mailpitUrl);
  url.searchParams.set("query", `to:"${recipient}"`);
  return url.toString();
}
