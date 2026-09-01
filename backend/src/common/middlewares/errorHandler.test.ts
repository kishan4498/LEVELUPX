import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { AppError } from "../errors/AppError.js";
import { errorHandler } from "./errorHandler.js";

describe("errorHandler", () => {
  it("returns expected domain errors without changing their public outcome", async () => {
    const app = express();
    app.get("/quest", () => {
      throw new AppError("Only in-progress quests can be completed", 409, "QUEST_NOT_COMPLETABLE");
    });
    app.use(errorHandler);

    const conflictRes = await request(app).get("/quest").expect(409);

    expect(conflictRes.body).toEqual({
      success: false,
      error: {
        code: "QUEST_NOT_COMPLETABLE",
        message: "Only in-progress quests can be completed"
      }
    });
  });

  it("does not expose unexpected error details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = express();
    app.get("/quest", () => {
      throw new Error("duplicate key value violates QuestCompletion_questId_key");
    });
    app.use(errorHandler);

    const hiddenErrorRes = await request(app).get("/quest").expect(500);

    expect(hiddenErrorRes.body).toEqual({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong"
      }
    });
    expect(JSON.stringify(hiddenErrorRes.body)).not.toContain("QuestCompletion");
  });
});
