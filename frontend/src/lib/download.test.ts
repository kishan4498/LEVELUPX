import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadBlob } from "./download";

describe("downloadBlob", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("downloads the supplied blob with the requested filename", () => {
    const blob = new Blob(["quest data"], { type: "text/plain" });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:levelupx-export");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    downloadBlob(blob, "quests.csv");

    expect(createObjectUrl).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:levelupx-export");
    expect(document.querySelector('a[download="quests.csv"]')).toBeNull();
  });

  it("releases the object URL when the browser rejects the click", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:failed-export");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("download blocked");
    });

    expect(() => downloadBlob(new Blob(), "blocked.csv")).toThrow("download blocked");
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:failed-export");
    expect(document.querySelector('a[download="blocked.csv"]')).toBeNull();
  });
});
