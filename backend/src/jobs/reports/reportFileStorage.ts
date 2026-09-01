import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type ReportFileInput = {
  filename: string;
  body: string | Buffer;
};

export type StoredReportFile = {
  storageKey: string;
  sizeBytes: number;
};

export type ReadReportFile = {
  body: Buffer;
  sizeBytes: number;
};

export interface IReportFileStorage {
  store(report: ReportFileInput): Promise<StoredReportFile | null>;
  read(storageKey: string): Promise<ReadReportFile | null>;
}

export class LocalReportFileStorage implements IReportFileStorage {
  constructor(private readonly root = process.env.REPORT_STORAGE_DIR) {}

  async store(report: ReportFileInput): Promise<StoredReportFile | null> {
    if (!this.root) {
      return null;
    }

    const safeName = report.filename.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeName}`;
    const filePath = this.resolvePath(storageKey);

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, report.body);

    return {
      storageKey,
      sizeBytes: Buffer.byteLength(report.body)
    };
  }

  async read(storageKey: string): Promise<ReadReportFile | null> {
    if (!this.root) {
      return null;
    }

    const filePath = this.resolvePath(storageKey);

    try {
      const body = await readFile(filePath);

      return {
        body,
        sizeBytes: body.byteLength
      };
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError.code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  private resolvePath(storageKey: string) {
    const root = path.resolve(this.root!);
    const filePath = path.resolve(root, storageKey);

    if (!filePath.startsWith(`${root}${path.sep}`) && filePath !== root) {
      throw new Error("Report storage path escaped the configured root directory");
    }

    return filePath;
  }
}
