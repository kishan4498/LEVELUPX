import { describe, expect, it } from "vitest";

import {
  ApiWeeklyReportDeliverySender,
  SmtpWeeklyReportDeliverySender,
  resolveWeeklyReportDeliveryPlan,
  type ISmtpWeeklyReportTransport
} from "./weeklyReportDelivery.js";

describe("resolveWeeklyReportDeliveryPlan", () => {
  it("defaults to disabled delivery", () => {
    expect(resolveWeeklyReportDeliveryPlan({})).toEqual({
      enabled: false,
      status: "DISABLED",
      provider: "NONE",
      timeoutMs: 10000,
      recipientEmails: []
    });
  });

  it("flags enabled delivery without recipients as pending configuration", () => {
    expect(
      resolveWeeklyReportDeliveryPlan({
        WEEKLY_REPORT_DELIVERY_ENABLED: "true"
      })
    ).toEqual({
      enabled: true,
      status: "PENDING_CONFIGURATION",
      provider: "EMAIL",
      emailProvider: "SMTP",
      emailFrom: undefined,
      smtp: undefined,
      api: undefined,
      timeoutMs: 10000,
      recipientEmails: []
    });
  });

  it("keeps email delivery pending until provider credentials are configured", () => {
    expect(
      resolveWeeklyReportDeliveryPlan({
        WEEKLY_REPORT_DELIVERY_ENABLED: "true",
        WEEKLY_REPORT_EMAIL_PROVIDER: "api",
        WEEKLY_REPORT_RECIPIENT_EMAILS: "admin@example.com, , owner@example.com "
      })
    ).toEqual({
      enabled: true,
      status: "PENDING_CONFIGURATION",
      provider: "EMAIL",
      emailProvider: "API",
      emailFrom: undefined,
      smtp: undefined,
      api: undefined,
      timeoutMs: 10000,
      recipientEmails: ["admin@example.com", "owner@example.com"]
    });
  });

  it("resolves configured API delivery credentials", () => {
    expect(
      resolveWeeklyReportDeliveryPlan({
        WEEKLY_REPORT_DELIVERY_ENABLED: "true",
        WEEKLY_REPORT_EMAIL_PROVIDER: "api",
        WEEKLY_REPORT_RECIPIENT_EMAILS: "admin@example.com, owner@example.com ",
        WEEKLY_REPORT_EMAIL_FROM: "reports@example.com",
        WEEKLY_REPORT_API_ENDPOINT: "https://mail.example.com/send",
        WEEKLY_REPORT_API_KEY: "secret",
        WEEKLY_REPORT_DELIVERY_TIMEOUT_MS: "7000"
      })
    ).toEqual({
      enabled: true,
      status: "READY_FOR_DELIVERY",
      provider: "EMAIL",
      emailProvider: "API",
      emailFrom: "reports@example.com",
      smtp: undefined,
      api: {
        endpoint: "https://mail.example.com/send",
        apiKey: "secret"
      },
      timeoutMs: 7000,
      recipientEmails: ["admin@example.com", "owner@example.com"]
    });
  });

  it("resolves configured SMTP delivery credentials", () => {
    expect(
      resolveWeeklyReportDeliveryPlan({
        WEEKLY_REPORT_DELIVERY_ENABLED: "true",
        WEEKLY_REPORT_EMAIL_PROVIDER: "smtp",
        WEEKLY_REPORT_RECIPIENT_EMAILS: "admin@example.com",
        WEEKLY_REPORT_EMAIL_FROM: "reports@example.com",
        WEEKLY_REPORT_SMTP_HOST: "smtp.example.com",
        WEEKLY_REPORT_SMTP_PORT: "465",
        WEEKLY_REPORT_SMTP_USERNAME: "user",
        WEEKLY_REPORT_SMTP_PASSWORD: "password"
      })
    ).toEqual({
      enabled: true,
      status: "READY_FOR_DELIVERY",
      provider: "EMAIL",
      emailProvider: "SMTP",
      emailFrom: "reports@example.com",
      smtp: {
        host: "smtp.example.com",
        port: 465,
        username: "user",
        password: "password",
        secure: true
      },
      api: undefined,
      timeoutMs: 10000,
      recipientEmails: ["admin@example.com"]
    });
  });

  it("keeps local outbox delivery separate from email provider configuration", () => {
    expect(
      resolveWeeklyReportDeliveryPlan({
        WEEKLY_REPORT_DELIVERY_ENABLED: "true",
        WEEKLY_REPORT_DELIVERY_PROVIDER: "local-outbox",
        WEEKLY_REPORT_EMAIL_PROVIDER: "api",
        WEEKLY_REPORT_RECIPIENT_EMAILS: "admin@example.com"
      })
    ).toEqual({
      enabled: true,
      status: "READY_FOR_DELIVERY",
      provider: "LOCAL_OUTBOX",
      emailProvider: undefined,
      emailFrom: undefined,
      smtp: undefined,
      api: undefined,
      timeoutMs: 10000,
      recipientEmails: ["admin@example.com"]
    });
  });
});

describe("weekly report delivery senders", () => {
  it("sends weekly reports through SMTP transport when configured", async () => {
    const sent: Parameters<ISmtpWeeklyReportTransport["sendMail"]>[0][] = [];
    const transport: ISmtpWeeklyReportTransport = {
      async sendMail(mail) {
        sent.push(mail);
        return { messageId: "smtp-message-1" };
      }
    };

    await expect(
      new SmtpWeeklyReportDeliverySender(transport).send({
        plan: resolveWeeklyReportDeliveryPlan({
          WEEKLY_REPORT_DELIVERY_ENABLED: "true",
          WEEKLY_REPORT_EMAIL_PROVIDER: "smtp",
          WEEKLY_REPORT_RECIPIENT_EMAILS: "admin@example.com",
          WEEKLY_REPORT_EMAIL_FROM: "reports@example.com",
          WEEKLY_REPORT_SMTP_HOST: "smtp.example.com",
          WEEKLY_REPORT_SMTP_USERNAME: "user",
          WEEKLY_REPORT_SMTP_PASSWORD: "password"
        }),
        filename: "weekly.csv",
        contentType: "text/csv; charset=utf-8",
        body: "metric,value"
      })
    ).resolves.toEqual({
      attempted: true,
      status: "SENT",
      provider: "EMAIL",
      recipientCount: 1,
      attemptCount: 1,
      messageId: "smtp-message-1"
    });
    expect(sent[0]).toEqual(
      expect.objectContaining({
        host: "smtp.example.com",
        from: "reports@example.com",
        to: ["admin@example.com"],
        subject: "LevelUpX weekly platform summary",
        attachment: expect.objectContaining({
          filename: "weekly.csv",
          body: "metric,value"
        })
      })
    );
  });

  it("sends weekly reports through API delivery when configured", async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    const fetcher: typeof fetch = async (url, init) => {
      requests.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ messageId: "api-message-1" }), { status: 202 });
    };

    await expect(
      new ApiWeeklyReportDeliverySender(fetcher).send({
        plan: resolveWeeklyReportDeliveryPlan({
          WEEKLY_REPORT_DELIVERY_ENABLED: "true",
          WEEKLY_REPORT_EMAIL_PROVIDER: "api",
          WEEKLY_REPORT_RECIPIENT_EMAILS: "admin@example.com",
          WEEKLY_REPORT_EMAIL_FROM: "reports@example.com",
          WEEKLY_REPORT_API_ENDPOINT: "https://mail.example.com/send",
          WEEKLY_REPORT_API_KEY: "secret"
        }),
        filename: "weekly.csv",
        contentType: "text/csv; charset=utf-8",
        body: "metric,value"
      })
    ).resolves.toEqual({
      attempted: true,
      status: "SENT",
      provider: "EMAIL",
      recipientCount: 1,
      attemptCount: 1,
      messageId: "api-message-1"
    });

    expect(requests[0].url).toBe("https://mail.example.com/send");
    expect(requests[0].init.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer secret",
        "Content-Type": "application/json"
      })
    );
    expect(JSON.parse(String(requests[0].init.body))).toEqual(
      expect.objectContaining({
        from: "reports@example.com",
        to: ["admin@example.com"],
        attachments: [
          expect.objectContaining({
            filename: "weekly.csv",
            content: Buffer.from("metric,value").toString("base64")
          })
        ]
      })
    );
  });
});
