import { describe, expect, it } from "vitest";

import {
  ApiAuthEmailSender,
  SmtpAuthEmailSender,
  resolveAuthEmailDeliveryPlan,
  type IAuthSmtpTransport
} from "./authEmailDelivery.js";

describe("auth email delivery", () => {
  it("stays disabled by default", () => {
    expect(resolveAuthEmailDeliveryPlan({})).toEqual({
      enabled: false,
      status: "DISABLED",
      provider: "NONE",
      timeoutMs: 10000
    });
  });

  it("resolves API delivery using auth-specific settings", () => {
    expect(
      resolveAuthEmailDeliveryPlan({
        AUTH_EMAIL_DELIVERY_ENABLED: "true",
        AUTH_EMAIL_PROVIDER: "api",
        AUTH_EMAIL_FROM: "security@example.com",
        AUTH_EMAIL_API_ENDPOINT: "https://mail.example.com/send",
        AUTH_EMAIL_API_KEY: "secret",
        AUTH_EMAIL_TIMEOUT_MS: "5000"
      })
    ).toMatchObject({
      enabled: true,
      status: "READY",
      provider: "API",
      from: "security@example.com",
      api: {
        endpoint: "https://mail.example.com/send",
        apiKey: "secret"
      },
      timeoutMs: 5000
    });
  });

  it("sends auth email through API delivery", async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    const fetcher: typeof fetch = async (url, init) => {
      requests.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ messageId: "api-message-1" }), { status: 202 });
    };

    await expect(
      new ApiAuthEmailSender(
        resolveAuthEmailDeliveryPlan({
          AUTH_EMAIL_DELIVERY_ENABLED: "true",
          AUTH_EMAIL_PROVIDER: "api",
          AUTH_EMAIL_FROM: "security@example.com",
          AUTH_EMAIL_API_ENDPOINT: "https://mail.example.com/send",
          AUTH_EMAIL_API_KEY: "secret"
        }),
        fetcher
      ).send({
        to: "user@example.com",
        subject: "Security code",
        text: "123456"
      })
    ).resolves.toEqual({
      attempted: true,
      messageId: "api-message-1"
    });
    expect(JSON.parse(String(requests[0]!.init.body))).toEqual({
      from: "security@example.com",
      to: ["user@example.com"],
      subject: "Security code",
      text: "123456"
    });
  });

  it("sends auth email through SMTP transport when configured", async () => {
    const sent: unknown[] = [];
    const transport: IAuthSmtpTransport = {
      async sendMail(mail) {
        sent.push(mail);
        return { messageId: "smtp-message-1" };
      }
    };

    await expect(
      new SmtpAuthEmailSender(
        resolveAuthEmailDeliveryPlan({
          AUTH_EMAIL_DELIVERY_ENABLED: "true",
          AUTH_EMAIL_PROVIDER: "smtp",
          AUTH_EMAIL_FROM: "security@example.com",
          AUTH_EMAIL_SMTP_HOST: "smtp.example.com",
          AUTH_EMAIL_SMTP_USERNAME: "user",
          AUTH_EMAIL_SMTP_PASSWORD: "password"
        }),
        transport
      ).send({
        to: "user@example.com",
        subject: "Security code",
        text: "123456"
      })
    ).resolves.toEqual({
      attempted: true,
      messageId: "smtp-message-1"
    });
    expect(sent[0]).toEqual(
      expect.objectContaining({
        from: "security@example.com",
        to: "user@example.com",
        subject: "Security code"
      })
    );
  });
});
