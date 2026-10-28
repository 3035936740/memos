import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultSelection,
  formatOfFile,
  getImportJob,
  type ImportPost,
  ImportRequestError,
  isFinishedImport,
  previewImport,
} from "@/utils/blog-import";

const post = (id: string, skipReason?: string) => ({ id, title: id, skipReason }) as ImportPost;

describe("blog import helpers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ticks every post the server did not mark to skip", () => {
    expect(defaultSelection([post("a"), post("b", "already imported"), post("c")])).toEqual(["a", "c"]);
  });

  it("knows when a job has ended and guesses formats like the server", () => {
    expect(isFinishedImport("running")).toBe(false);
    expect(isFinishedImport("completed")).toBe(true);
    expect(isFinishedImport(undefined)).toBe(false);
    expect(formatOfFile("export.XML")).toBe("wordpress");
    expect(formatOfFile("hexo-posts.zip")).toBe("markdown");
    expect(formatOfFile("notes.txt")).toBeUndefined();
  });

  it("turns Go's null lists into empty ones", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ id: "p1", source: "blog", format: "markdown", posts: [{ id: "a", tags: null, changes: null }] })),
    );
    const preview = await previewImport(new File(["x"], "posts.zip"), "blog", "markdown");
    expect(preview.posts[0].tags).toEqual([]);
    expect(preview.posts[0].changes).toEqual([]);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ id: "j1", state: "running", report: { entries: null, imported: 0 } })),
    );
    expect((await getImportJob("j1")).report?.entries).toEqual([]);
  });

  it("reports the server's own error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "an import is already running" }, { status: 409 })),
    );
    const error = await getImportJob("j1").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ImportRequestError);
    expect((error as ImportRequestError).message).toBe("an import is already running");
    expect((error as ImportRequestError).status).toBe(409);
  });
});
