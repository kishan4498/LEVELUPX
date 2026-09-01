import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import net from "node:net";
import tls from "node:tls";

export type WeeklyReportDeliveryStatus = "DISABLED" | "PENDING_CONFIGURATION" | "READY_FOR_DELIVERY";

export type WeeklyReportDeliveryPlan = {
  enabled: boolean;
  status: WeeklyReportDeliveryStatus;
  provider: "NONE" | "EMAIL" | "LOCAL_OUTBOX";
  emailProvider?: "SMTP" | "API";
  emailFrom?: string;
  smtp?: {
    host: string;
    port: number;
    username: string;
    password: string;
    secure: boolean;
  };
  api?: {
    endpoint: string;
    apiKey: string;
  };
  timeoutMs: number;
  recipientEmails: string[];
};

export type WeeklyReportDeliveryResult = {
  attempted: boolean;
  status: WeeklyReportDeliveryStatus | "SENT" | "FAILED";
  provider: WeeklyReportDeliveryPlan["provider"];
  recipientCount: number;
  messageId?: string;
  attemptCount: number;
  errorMessage?: string;
};

export type WeeklyReportDeliveryInput = {
  plan: WeeklyReportDeliveryPlan;
  filename: string;
  contentType: string;
  body: string;
};

export interface IWeeklyReportDeliverySender {
  send(delivery: WeeklyReportDeliveryInput): Promise<WeeklyReportDeliveryResult>;
}

export interface ISmtpWeeklyReportTransport {
  sendMail(mail: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
    from: string;
    to: string[];
    subject: string;
    body: string;
    attachment: {
      filename: string;
      contentType: string;
      body: string;
    };
    timeoutMs: number;
  }): Promise<{ messageId: string }>;
}

export type WeeklyReportFetch = typeof fetch;

export function resolveWeeklyReportDeliveryPlan(env: NodeJS.ProcessEnv = process.env): WeeklyReportDeliveryPlan {
  const enabled = env.WEEKLY_REPORT_DELIVERY_ENABLED === "true";
  const timeoutMs = positiveInt(env.WEEKLY_REPORT_DELIVERY_TIMEOUT_MS, 10000);
  const recipientEmails = (env.WEEKLY_REPORT_RECIPIENT_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

  if (!enabled) {
    return {
      enabled: false,
      status: "DISABLED",
      provider: "NONE",
      timeoutMs,
      recipientEmails: []
    };
  }

  const provider = env.WEEKLY_REPORT_DELIVERY_PROVIDER === "local-outbox" ? "LOCAL_OUTBOX" : "EMAIL";
  const emailProvider = getEmailProvider(env.WEEKLY_REPORT_EMAIL_PROVIDER);
  const emailFrom = env.WEEKLY_REPORT_EMAIL_FROM?.trim();
  const smtp = getSmtpConfig(env);
  const api = getApiConfig(env);
  const configured =
    provider === "LOCAL_OUTBOX" ||
    (emailProvider === "SMTP" && Boolean(emailFrom && smtp)) ||
    (emailProvider === "API" && Boolean(emailFrom && api));
  const status = recipientEmails.length > 0 && configured ? "READY_FOR_DELIVERY" : "PENDING_CONFIGURATION";

  return {
    enabled: true,
    status,
    provider,
    emailProvider: provider === "EMAIL" ? emailProvider : undefined,
    emailFrom: provider === "EMAIL" ? emailFrom : undefined,
    smtp: provider === "EMAIL" && emailProvider === "SMTP" ? smtp : undefined,
    api: provider === "EMAIL" && emailProvider === "API" ? api : undefined,
    timeoutMs,
    recipientEmails
  };
}

export class DisabledWeeklyReportDeliverySender implements IWeeklyReportDeliverySender {
  async send(delivery: WeeklyReportDeliveryInput): Promise<WeeklyReportDeliveryResult> {
    return {
      attempted: false,
      status: delivery.plan.status,
      provider: delivery.plan.provider,
      recipientCount: delivery.plan.recipientEmails.length,
      attemptCount: 0
    };
  }
}

export class LocalOutboxWeeklyReportDeliverySender implements IWeeklyReportDeliverySender {
  constructor(private readonly outboxDir = process.env.WEEKLY_REPORT_DELIVERY_OUTBOX_DIR) {}

  async send(delivery: WeeklyReportDeliveryInput): Promise<WeeklyReportDeliveryResult> {
    if (delivery.plan.status !== "READY_FOR_DELIVERY" || delivery.plan.provider !== "LOCAL_OUTBOX" || !this.outboxDir) {
      return {
        attempted: false,
        status: delivery.plan.status,
        provider: delivery.plan.provider,
        recipientCount: delivery.plan.recipientEmails.length,
        attemptCount: 0
      };
    }

    const messageId = randomUUID();
    const safeName = delivery.filename.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
    const root = path.resolve(this.outboxDir);
    const filePath = path.resolve(root, `${new Date().toISOString().slice(0, 10)}-${messageId}-${safeName}`);

    if (!filePath.startsWith(`${root}${path.sep}`)) {
      throw new Error("Weekly report outbox path escaped the configured directory");
    }

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      [
        `to: ${delivery.plan.recipientEmails.join(", ")}`,
        `content-type: ${delivery.contentType}`,
        `filename: ${delivery.filename}`,
        "",
        delivery.body
      ].join("\n")
    );

    return {
      attempted: true,
      status: "SENT",
      provider: "LOCAL_OUTBOX",
      recipientCount: delivery.plan.recipientEmails.length,
      attemptCount: 1,
      messageId
    };
  }
}

export class SmtpWeeklyReportDeliverySender implements IWeeklyReportDeliverySender {
  constructor(private readonly transport: ISmtpWeeklyReportTransport = new NodeSmtpWeeklyReportTransport()) {}

  async send(delivery: WeeklyReportDeliveryInput): Promise<WeeklyReportDeliveryResult> {
    if (
      delivery.plan.status !== "READY_FOR_DELIVERY" ||
      delivery.plan.provider !== "EMAIL" ||
      delivery.plan.emailProvider !== "SMTP" ||
      !delivery.plan.emailFrom ||
      !delivery.plan.smtp
    ) {
      return {
        attempted: false,
        status: delivery.plan.status,
        provider: delivery.plan.provider,
        recipientCount: delivery.plan.recipientEmails.length,
        attemptCount: 0
      };
    }

    const sent = await this.transport.sendMail({
      ...delivery.plan.smtp,
      from: delivery.plan.emailFrom,
      to: delivery.plan.recipientEmails,
      subject: "LevelUpX weekly platform summary",
      body: "The latest LevelUpX weekly platform summary is attached.",
      attachment: {
        filename: delivery.filename,
        contentType: delivery.contentType,
        body: delivery.body
      },
      timeoutMs: delivery.plan.timeoutMs
    });

    return {
      attempted: true,
      status: "SENT",
      provider: "EMAIL",
      recipientCount: delivery.plan.recipientEmails.length,
      attemptCount: 1,
      messageId: sent.messageId
    };
  }
}

export class ApiWeeklyReportDeliverySender implements IWeeklyReportDeliverySender {
  constructor(private readonly fetcher: WeeklyReportFetch = fetch) {}

  async send(delivery: WeeklyReportDeliveryInput): Promise<WeeklyReportDeliveryResult> {
    if (
      delivery.plan.status !== "READY_FOR_DELIVERY" ||
      delivery.plan.provider !== "EMAIL" ||
      delivery.plan.emailProvider !== "API" ||
      !delivery.plan.emailFrom ||
      !delivery.plan.api
    ) {
      return {
        attempted: false,
        status: delivery.plan.status,
        provider: delivery.plan.provider,
        recipientCount: delivery.plan.recipientEmails.length,
        attemptCount: 0
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), delivery.plan.timeoutMs);

    try {
      const res = await this.fetcher(delivery.plan.api.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${delivery.plan.api.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: delivery.plan.emailFrom,
          to: delivery.plan.recipientEmails,
          subject: "LevelUpX weekly platform summary",
          text: "The latest LevelUpX weekly platform summary is attached.",
          attachments: [
            {
              filename: delivery.filename,
              contentType: delivery.contentType,
              content: Buffer.from(delivery.body).toString("base64"),
              encoding: "base64"
            }
          ]
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        throw new Error(`Weekly report API delivery failed with ${res.status}`);
      }

      const apiBody = (await res.json().catch(() => ({}))) as { id?: unknown; messageId?: unknown };
      let messageId: string;

      if (typeof apiBody.messageId === "string") {
        messageId = apiBody.messageId;
      } else if (typeof apiBody.id === "string") {
        messageId = apiBody.id;
      } else {
        messageId = randomUUID();
      }

      return {
        attempted: true,
        status: "SENT",
        provider: "EMAIL",
        recipientCount: delivery.plan.recipientEmails.length,
        attemptCount: 1,
        messageId
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createWeeklyReportDeliverySenderFromEnv(
  env: NodeJS.ProcessEnv = process.env
): IWeeklyReportDeliverySender {
  if (env.WEEKLY_REPORT_DELIVERY_PROVIDER === "local-outbox") {
    return new LocalOutboxWeeklyReportDeliverySender(env.WEEKLY_REPORT_DELIVERY_OUTBOX_DIR);
  }

  if (env.WEEKLY_REPORT_DELIVERY_ENABLED === "true" && env.WEEKLY_REPORT_EMAIL_PROVIDER === "api") {
    return new ApiWeeklyReportDeliverySender();
  }

  if (env.WEEKLY_REPORT_DELIVERY_ENABLED === "true") {
    return new SmtpWeeklyReportDeliverySender();
  }

  return new DisabledWeeklyReportDeliverySender();
}

function getEmailProvider(rawProvider: string | undefined): WeeklyReportDeliveryPlan["emailProvider"] {
  if (rawProvider === "api") {
    return "API";
  }

  return "SMTP";
}

function getSmtpConfig(env: NodeJS.ProcessEnv): WeeklyReportDeliveryPlan["smtp"] {
  const host = env.WEEKLY_REPORT_SMTP_HOST?.trim();
  const port = positiveInt(env.WEEKLY_REPORT_SMTP_PORT, 587);
  const username = env.WEEKLY_REPORT_SMTP_USERNAME?.trim();
  const password = env.WEEKLY_REPORT_SMTP_PASSWORD;

  if (!host || !username || !password) {
    return undefined;
  }

  return {
    host,
    port,
    username,
    password,
    secure: env.WEEKLY_REPORT_SMTP_SECURE === "true" || port === 465
  };
}

function getApiConfig(env: NodeJS.ProcessEnv): WeeklyReportDeliveryPlan["api"] {
  const endpoint = env.WEEKLY_REPORT_API_ENDPOINT?.trim();
  const apiKey = env.WEEKLY_REPORT_API_KEY?.trim();

  if (!endpoint || !apiKey) {
    return undefined;
  }

  return { endpoint, apiKey };
}

function positiveInt(raw: string | undefined, fallback: number) {
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

class NodeSmtpWeeklyReportTransport implements ISmtpWeeklyReportTransport {
  async sendMail(mail: Parameters<ISmtpWeeklyReportTransport["sendMail"]>[0]): Promise<{ messageId: string }> {
    const messageId = `<${randomUUID()}@levelupx.local>`;
    const client = await SmtpClient.connect({
      host: mail.host,
      port: mail.port,
      secure: mail.secure,
      timeoutMs: mail.timeoutMs
    });

    try {
      await client.expect([220]);
      await client.command("EHLO levelupx.local", [250]);

      if (!mail.secure && client.lastResponse.includes("STARTTLS")) {
        await client.command("STARTTLS", [220]);
        await client.upgradeToTls(mail.host);
        await client.command("EHLO levelupx.local", [250]);
      }

      await client.command(`AUTH PLAIN ${Buffer.from(`\0${mail.username}\0${mail.password}`).toString("base64")}`, [235]);
      await client.command(`MAIL FROM:<${mail.from}>`, [250]);

      for (const recipient of mail.to) {
        await client.command(`RCPT TO:<${recipient}>`, [250, 251]);
      }

      await client.command("DATA", [354]);
      await client.writeData(buildMimeMessage(mail, messageId));
      await client.expect([250]);
      await client.command("QUIT", [221]);

      return { messageId };
    } finally {
      client.close();
    }
  }
}

class SmtpClient {
  lastResponse = "";
  private buffer = "";
  private readonly onSocketData = (chunk: Buffer) => this.onData(chunk.toString());
  private readonly onSocketError = (error: Error) => this.failPending(error);
  private pending:
    | {
        resolve: (reply: string) => void;
        reject: (reason: unknown) => void;
        timer: NodeJS.Timeout;
      }
    | null = null;

  private constructor(
    private socket: net.Socket | tls.TLSSocket,
    private readonly timeoutMs: number
  ) {
    this.socket.setEncoding("utf8");
    this.socket.on("data", this.onSocketData);
    this.socket.on("error", this.onSocketError);
    this.socket.on("close", () => this.failPending(new Error("SMTP connection closed")));
  }

  static connect(settings: { host: string; port: number; secure: boolean; timeoutMs: number }): Promise<SmtpClient> {
    return new Promise((resolve, reject) => {
      const socket = settings.secure
        ? tls.connect({ host: settings.host, port: settings.port, servername: settings.host })
        : net.connect({ host: settings.host, port: settings.port });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("SMTP connection timed out"));
      }, settings.timeoutMs);

      socket.once("connect", () => {
        clearTimeout(timer);
        resolve(new SmtpClient(socket, settings.timeoutMs));
      });
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  async command(line: string, codes: number[]) {
    this.socket.write(`${line}\r\n`);
    return this.expect(codes);
  }

  async writeData(message: string) {
    this.socket.write(`${message.replaceAll(/\r?\n/g, "\r\n").replaceAll(/^\./gm, "..")}\r\n.\r\n`);
  }

  expect(codes: number[]) {
    return this.readResponse().then((reply) => {
      this.lastResponse = reply;
      const code = Number(reply.slice(0, 3));

      if (!codes.includes(code)) {
        throw new Error(`Unexpected SMTP response ${reply}`);
      }

      return reply;
    });
  }

  upgradeToTls(host: string) {
    return new Promise<void>((resolve, reject) => {
      const secureSocket = tls.connect({ socket: this.socket, servername: host }, () => {
        this.socket = secureSocket;
        this.socket.setEncoding("utf8");
        this.socket.on("data", this.onSocketData);
        this.socket.on("error", this.onSocketError);
        resolve();
      });
      secureSocket.once("error", reject);
    });
  }

  close() {
    this.socket.destroy();
  }

  private readResponse() {
    return new Promise<string>((resolve, reject) => {
      const reply = this.takeResponse();

      if (reply) {
        resolve(reply);
        return;
      }

      const timer = setTimeout(() => {
        this.pending = null;
        reject(new Error("SMTP response timed out"));
      }, this.timeoutMs);
      this.pending = { resolve, reject, timer };
    });
  }

  private onData(chunk: string) {
    this.buffer += chunk;

    if (!this.pending) {
      return;
    }

    const reply = this.takeResponse();

    if (!reply) {
      return;
    }

    const pending = this.pending;
    this.pending = null;
    clearTimeout(pending.timer);
    pending.resolve(reply);
  }

  private failPending(error: unknown) {
    if (!this.pending) {
      return;
    }

    const pending = this.pending;
    this.pending = null;
    clearTimeout(pending.timer);
    pending.reject(error);
  }

  private takeResponse() {
    const normalized = this.buffer.replaceAll("\r\n", "\n");
    const lines = normalized.split("\n");
    const end = lines.findIndex((line) => /^\d{3} /.test(line));

    if (end === -1) {
      return null;
    }

    const replyLines = lines.slice(0, end + 1);
    this.buffer = lines.slice(end + 1).join("\n");

    return replyLines.join("\n");
  }
}

function buildMimeMessage(mail: Parameters<ISmtpWeeklyReportTransport["sendMail"]>[0], messageId: string) {
  const boundary = `levelupx-${randomUUID()}`;

  return [
    `From: ${mail.from}`,
    `To: ${mail.to.join(", ")}`,
    `Subject: ${mail.subject}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    mail.body,
    "",
    `--${boundary}`,
    `Content-Type: ${mail.attachment.contentType}; name="${mail.attachment.filename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${mail.attachment.filename}"`,
    "",
    Buffer.from(mail.attachment.body).toString("base64"),
    `--${boundary}--`
  ].join("\r\n");
}
