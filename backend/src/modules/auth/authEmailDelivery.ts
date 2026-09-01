import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import net from "node:net";
import tls from "node:tls";
import path from "node:path";

export type AuthEmailDeliveryPlan = {
  enabled: boolean;
  status: "DISABLED" | "PENDING_CONFIGURATION" | "READY";
  provider: "NONE" | "SMTP" | "API" | "LOCAL_OUTBOX";
  from?: string;
  api?: { endpoint: string; apiKey: string };
  smtp?: { host: string; port: number; secure: boolean; username: string; password: string };
  outboxDirectory?: string;
  timeoutMs: number;
};

export type AuthEmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export interface IAuthEmailSender {
  send(message: AuthEmailMessage): Promise<{ attempted: boolean; messageId?: string }>;
}

export function resolveAuthEmailDeliveryPlan(env: NodeJS.ProcessEnv = process.env): AuthEmailDeliveryPlan {
  const enabled = env.AUTH_EMAIL_DELIVERY_ENABLED === "true";
  const provider = resolveProvider(env.AUTH_EMAIL_PROVIDER);
  const timeoutMs = readPositiveInt(env.AUTH_EMAIL_TIMEOUT_MS) ?? readPositiveInt(env.WEEKLY_REPORT_DELIVERY_TIMEOUT_MS) ?? 10000;

  if (!enabled) {
    return { enabled: false, status: "DISABLED", provider: "NONE", timeoutMs };
  }

  const from = env.AUTH_EMAIL_FROM?.trim() || env.WEEKLY_REPORT_EMAIL_FROM?.trim();
  const api = resolveApi(env);
  const smtp = resolveSmtp(env);
  const outboxDirectory = env.AUTH_EMAIL_OUTBOX_DIR?.trim() || env.WEEKLY_REPORT_DELIVERY_OUTBOX_DIR?.trim();
  const ready =
    (provider === "LOCAL_OUTBOX" && Boolean(outboxDirectory)) ||
    (provider === "API" && Boolean(from && api)) ||
    (provider === "SMTP" && Boolean(from && smtp));

  return {
    enabled: true,
    status: ready ? "READY" : "PENDING_CONFIGURATION",
    provider,
    from,
    api: provider === "API" ? api : undefined,
    smtp: provider === "SMTP" ? smtp : undefined,
    outboxDirectory: provider === "LOCAL_OUTBOX" ? outboxDirectory : undefined,
    timeoutMs
  };
}

export function createAuthEmailSenderFromEnv(env: NodeJS.ProcessEnv = process.env): IAuthEmailSender {
  const plan = resolveAuthEmailDeliveryPlan(env);

  if (plan.provider === "LOCAL_OUTBOX") {
    return new LocalOutboxAuthEmailSender(plan);
  }

  if (plan.provider === "API") {
    return new ApiAuthEmailSender(plan);
  }

  if (plan.provider === "SMTP") {
    return new SmtpAuthEmailSender(plan);
  }

  return new DisabledAuthEmailSender(plan);
}

export class DisabledAuthEmailSender implements IAuthEmailSender {
  constructor(private readonly plan: AuthEmailDeliveryPlan = resolveAuthEmailDeliveryPlan()) {}

  async send() {
    return { attempted: false, messageId: this.plan.status };
  }
}

export class LocalOutboxAuthEmailSender implements IAuthEmailSender {
  constructor(private readonly plan: AuthEmailDeliveryPlan) {}

  async send(message: AuthEmailMessage) {
    if (this.plan.status !== "READY" || !this.plan.outboxDirectory) {
      return { attempted: false };
    }

    const messageId = randomUUID();
    const outbox = path.resolve(this.plan.outboxDirectory);
    const file = path.resolve(outbox, `${new Date().toISOString().slice(0, 10)}-${messageId}.txt`);

    if (!file.startsWith(`${outbox}${path.sep}`)) {
      throw new Error("Auth email outbox path escaped the configured directory");
    }

    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, [`to: ${message.to}`, `subject: ${message.subject}`, "", message.text].join("\n"));

    return { attempted: true, messageId };
  }
}

export class ApiAuthEmailSender implements IAuthEmailSender {
  constructor(
    private readonly plan: AuthEmailDeliveryPlan,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  async send(message: AuthEmailMessage) {
    if (this.plan.status !== "READY" || !this.plan.from || !this.plan.api) {
      return { attempted: false };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.plan.timeoutMs);

    try {
      const res = await this.fetcher(this.plan.api.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.plan.api.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: this.plan.from,
          to: [message.to],
          subject: message.subject,
          text: message.text
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        throw new Error(`Auth email API delivery failed with ${res.status}`);
      }

      const receipt = (await res.json().catch(() => ({}))) as { id?: unknown; messageId?: unknown };
      const messageId = [receipt.messageId, receipt.id].find((id): id is string => typeof id === "string") ?? randomUUID();

      return { attempted: true, messageId };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export interface IAuthSmtpTransport {
  sendMail(mail: AuthEmailMessage & { from: string; smtp: NonNullable<AuthEmailDeliveryPlan["smtp"]>; timeoutMs: number }): Promise<{ messageId: string }>;
}

export class SmtpAuthEmailSender implements IAuthEmailSender {
  constructor(
    private readonly plan: AuthEmailDeliveryPlan,
    private readonly transport: IAuthSmtpTransport = new NodeAuthSmtpTransport()
  ) {}

  async send(message: AuthEmailMessage) {
    if (this.plan.status !== "READY" || !this.plan.from || !this.plan.smtp) {
      return { attempted: false };
    }

    const delivery = await this.transport.sendMail({
      ...message,
      from: this.plan.from,
      smtp: this.plan.smtp,
      timeoutMs: this.plan.timeoutMs
    });

    return { attempted: true, messageId: delivery.messageId };
  }
}

class NodeAuthSmtpTransport implements IAuthSmtpTransport {
  async sendMail(mail: AuthEmailMessage & { from: string; smtp: NonNullable<AuthEmailDeliveryPlan["smtp"]>; timeoutMs: number }) {
    const messageId = `<${randomUUID()}@levelupx.local>`;
    const client = await SmtpClient.connect({
      host: mail.smtp.host,
      port: mail.smtp.port,
      secure: mail.smtp.secure,
      timeoutMs: mail.timeoutMs
    });

    try {
      await client.expect([220]);
      await client.command("EHLO levelupx.local", [250]);
      if (!mail.smtp.secure && client.lastResponse.includes("STARTTLS")) {
        await client.command("STARTTLS", [220]);
        await client.upgradeToTls(mail.smtp.host);
        await client.command("EHLO levelupx.local", [250]);
      }
      await client.command(`AUTH PLAIN ${Buffer.from(`\0${mail.smtp.username}\0${mail.smtp.password}`).toString("base64")}`, [235]);
      await client.command(`MAIL FROM:<${mail.from}>`, [250]);
      await client.command(`RCPT TO:<${mail.to}>`, [250, 251]);
      await client.command("DATA", [354]);
      await client.writeData(buildTextMessage(mail, messageId));
      await client.expect([250]);
      await client.command("QUIT", [221]);
      return { messageId };
    } finally {
      client.close();
    }
  }
}

function resolveProvider(provider: string | undefined): AuthEmailDeliveryPlan["provider"] {
  if (provider === "local-outbox") return "LOCAL_OUTBOX";
  if (provider === "api") return "API";
  return "SMTP";
}

function resolveApi(env: NodeJS.ProcessEnv) {
  const endpoint = env.AUTH_EMAIL_API_ENDPOINT?.trim() || env.WEEKLY_REPORT_API_ENDPOINT?.trim();
  const apiKey = env.AUTH_EMAIL_API_KEY?.trim() || env.WEEKLY_REPORT_API_KEY?.trim();
  return endpoint && apiKey ? { endpoint, apiKey } : undefined;
}

function resolveSmtp(env: NodeJS.ProcessEnv) {
  const host = env.AUTH_EMAIL_SMTP_HOST?.trim() || env.WEEKLY_REPORT_SMTP_HOST?.trim();
  const port = readPositiveInt(env.AUTH_EMAIL_SMTP_PORT) ?? readPositiveInt(env.WEEKLY_REPORT_SMTP_PORT) ?? 587;
  const username = env.AUTH_EMAIL_SMTP_USERNAME?.trim() || env.WEEKLY_REPORT_SMTP_USERNAME?.trim();
  const password = env.AUTH_EMAIL_SMTP_PASSWORD || env.WEEKLY_REPORT_SMTP_PASSWORD;
  return host && username && password
    ? { host, port, username, password, secure: env.AUTH_EMAIL_SMTP_SECURE === "true" || env.WEEKLY_REPORT_SMTP_SECURE === "true" || port === 465 }
    : undefined;
}

function readPositiveInt(raw: string | undefined) {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

class SmtpClient {
  lastResponse = "";
  private buffer = "";
  private pending: { resolve: (reply: string) => void; reject: (reason: unknown) => void; timer: NodeJS.Timeout } | null = null;

  private constructor(private socket: net.Socket | tls.TLSSocket, private readonly timeoutMs: number) {
    this.listen(this.socket);
    this.socket.on("close", () => this.failPending(new Error("SMTP connection closed")));
  }

  static connect(server: { host: string; port: number; secure: boolean; timeoutMs: number }) {
    return new Promise<SmtpClient>((resolve, reject) => {
      const socket = server.secure ? tls.connect({ host: server.host, port: server.port, servername: server.host }) : net.connect({ host: server.host, port: server.port });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("SMTP connection timed out"));
      }, server.timeoutMs);
      socket.once("connect", () => {
        clearTimeout(timer);
        resolve(new SmtpClient(socket, server.timeoutMs));
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

  async expect(codes: number[]) {
    const reply = await this.readResponse();
    this.lastResponse = reply;
    const code = Number(reply.slice(0, 3));
    if (!codes.includes(code)) throw new Error(`Unexpected SMTP response ${reply}`);
    return reply;
  }

  upgradeToTls(host: string) {
    return new Promise<void>((resolve, reject) => {
      const secureSocket = tls.connect({ socket: this.socket, servername: host }, () => {
        this.socket = secureSocket;
        this.listen(this.socket);
        resolve();
      });
      secureSocket.once("error", reject);
    });
  }

  close() {
    this.socket.destroy();
  }

  private listen(socket: net.Socket | tls.TLSSocket) {
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => this.onData(chunk.toString()));
    socket.on("error", (error) => this.failPending(error));
  }

  private readResponse() {
    return new Promise<string>((resolve, reject) => {
      const reply = this.extractResponse();
      if (reply) return resolve(reply);
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new Error("SMTP response timed out"));
      }, this.timeoutMs);
      this.pending = { resolve, reject, timer };
    });
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    if (!this.pending) return;
    const reply = this.extractResponse();
    if (!reply) return;
    const pending = this.pending;
    this.pending = null;
    clearTimeout(pending.timer);
    pending.resolve(reply);
  }

  private failPending(error: unknown) {
    if (!this.pending) return;
    const pending = this.pending;
    this.pending = null;
    clearTimeout(pending.timer);
    pending.reject(error);
  }

  private extractResponse() {
    const lines = this.buffer.replaceAll("\r\n", "\n").split("\n");
    const end = lines.findIndex((line) => /^\d{3} /.test(line));
    if (end === -1) return null;
    const reply = lines.slice(0, end + 1);
    this.buffer = lines.slice(end + 1).join("\n");
    return reply.join("\n");
  }
}

function buildTextMessage(mail: AuthEmailMessage & { from: string }, messageId: string) {
  return [
    `From: ${mail.from}`,
    `To: ${mail.to}`,
    `Subject: ${mail.subject}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    mail.text
  ].join("\r\n");
}
