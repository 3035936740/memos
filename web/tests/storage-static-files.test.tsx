import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StorageStaticFiles from "@/components/Settings/StorageStaticFiles";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/auth-state", () => ({ getAccessToken: () => "token" }));
vi.mock("react-hot-toast", () => ({ default: { success: mocks.success, error: mocks.error } }));
vi.mock("@/utils/i18n", () => ({
  useTranslate: () => translate,
}));
const translate = (key: string, values?: { current?: number; total?: number; count?: number }) =>
  key === "memo.pagination-summary" ? `Page ${values?.current} of ${values?.total}` : values?.count ? `${key}:${values.count}` : key;

const files = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    path: `file-${index + 1}.txt`,
    url: `/storage/file-${index + 1}.txt`,
    sizeBytes: 12,
    modTime: "",
  }));
const response = (data: unknown) => ({ ok: true, json: async () => data });

describe("storage static files", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.fetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows 20 files per page and jumps directly to page 56 with compact pagination", async () => {
    mocks.fetch.mockResolvedValue(response({ files: files(1980) }));
    render(<StorageStaticFiles />);
    await screen.findByRole("link", { name: "/storage/file-1.txt" });
    expect(screen.getAllByRole("link")).toHaveLength(20);
    expect(screen.queryByRole("link", { name: "/storage/file-21.txt" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 99 of 99" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Page 50 of 99" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "56" } });
    fireEvent.click(screen.getByRole("button", { name: "memo.pagination-go" }));
    expect(screen.getByRole("link", { name: "/storage/file-1101.txt" })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(20);
    fireEvent.click(screen.getByRole("button", { name: "memo.pagination-next" }));
    expect(screen.getByRole("link", { name: "/storage/file-1121.txt" })).toBeInTheDocument();
  });

  it("returns to the previous page when the last file on the last page is deleted", async () => {
    mocks.fetch
      .mockResolvedValueOnce(response({ files: files(21) }))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response({ files: files(20) }));
    render(<StorageStaticFiles />);
    fireEvent.click(await screen.findByRole("button", { name: "Page 2 of 2" }));
    fireEvent.click(screen.getByRole("button", { name: "common.delete" }));
    await screen.findByRole("link", { name: "/storage/file-1.txt" });
    expect(screen.getAllByRole("link")).toHaveLength(20);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("uploads all selected files to the target directory and retries only failures", async () => {
    const uploaded: string[] = [];
    let fail = true;
    mocks.fetch.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method !== "POST") return response({ files: [] });
      const form = init.body as FormData;
      expect(form.get("path")).toBe("5/path1");
      const file = form.get("file") as File;
      uploaded.push(file.name);
      if (file.name === "b.txt" && fail) return { ok: false, text: async () => "Upload failed" };
      return response({ path: file.name });
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<StorageStaticFiles />);
    await screen.findByText("setting.storage.static-files-empty");
    fireEvent.change(screen.getByPlaceholderText("5/path1"), { target: { value: "5/path1" } });
    const input = screen.getByLabelText("setting.storage.static-files-choose", { selector: "input" });
    expect(input).toHaveAttribute("multiple");
    fireEvent.change(input, { target: { files: [new File(["a"], "a.txt"), new File(["b"], "b.txt"), new File(["c"], "c.txt")] } });
    fireEvent.click(screen.getByRole("button", { name: "setting.storage.static-files-upload" }));
    expect(screen.getByPlaceholderText("5/path1")).toBeDisabled();
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("setting.storage.static-files-batch-failed:1"));
    expect(uploaded).toEqual(["a.txt", "b.txt", "c.txt"]);
    expect(mocks.success).toHaveBeenCalledWith("setting.storage.static-files-batch-uploaded:2");
    await waitFor(() => expect(screen.getByRole("button", { name: "setting.storage.static-files-upload" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "b.txt" })).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "setting.storage.static-files-upload" }));
    await waitFor(() => expect(uploaded).toEqual(["a.txt", "b.txt", "c.txt", "b.txt"]));
    await waitFor(() => expect(screen.getByRole("button", { name: "setting.storage.static-files-upload" })).toBeDisabled());
  });
});
