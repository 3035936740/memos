import { render as renderBase, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import About from "@/pages/About";

const mockInstance = {
  profile: {
    version: "1.2.0 (based on Memos 0.34.1)",
    commit: "0123456789abcdef0123456789abcdef01234567",
    instanceUrl: "",
    demo: false,
    admin: undefined as { username: string; displayName: string } | undefined,
  },
  generalSetting: {} as { customProfile?: { title: string; description: string; logoUrl: string } },
};

vi.mock("@/contexts/InstanceContext", () => ({
  useInstance: () => mockInstance,
}));

vi.mock("@/utils/i18n", () => ({
  useTranslate: () => (key: string) => key,
}));

const REPOSITORY = "https://github.com/3035936740/memos-plus";

// The odd pages at the bottom are router links.
const render = (ui: ReactElement) => renderBase(<MemoryRouter>{ui}</MemoryRouter>);

describe("<About>", () => {
  beforeEach(() => {
    mockInstance.profile = {
      version: "1.2.0 (based on Memos 0.34.1)",
      commit: "0123456789abcdef0123456789abcdef01234567",
      instanceUrl: "https://notes.example.com",
      demo: false,
      admin: { username: "steven", displayName: "Steven" },
    };
    mockInstance.generalSetting = {};
  });

  it("shows the Memos Plus version apart from the Memos version it is based on", () => {
    render(<About />);

    expect(screen.getByRole("heading", { name: "Memos Plus" })).toBeInTheDocument();
    expect(screen.getByText("1.2.0")).toBeInTheDocument();
    expect(screen.getByText("about.channel-stable")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "about.release-notes" })).toHaveAttribute("href", `${REPOSITORY}/releases/tag/v1.2.0`);
    expect(screen.getByRole("link", { name: "Memos 0.34.1" })).toHaveAttribute(
      "href",
      "https://github.com/usememos/memos/releases/tag/v0.34.1",
    );
    expect(screen.getByRole("link", { name: "0123456" })).toHaveAttribute(
      "href",
      `${REPOSITORY}/commit/0123456789abcdef0123456789abcdef01234567`,
    );
    expect(screen.getByRole("link", { name: "MIT" })).toHaveAttribute("href", `${REPOSITORY}/blob/main/LICENSE`);
  });

  it("marks source builds as development builds without release links", () => {
    mockInstance.profile.version = "1.0.0-dev (based on Memos 0.34.x-dev)";
    mockInstance.profile.commit = "unknown";

    render(<About />);

    expect(screen.getByText("1.0.0-dev")).toBeInTheDocument();
    expect(screen.getByText("about.channel-dev")).toBeInTheDocument();
    expect(screen.getByText("about.dev-build-note")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "about.release-notes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Memos 0\.34/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/unknown/)).not.toBeInTheDocument();
  });

  it("links to the demo site, docs, both repositories, API docs and Web Clipper", () => {
    render(<About />);

    expect(screen.getByRole("link", { name: /about\.demo-site/ })).toHaveAttribute("href", "https://memos.bing.tomato-universe.tech/");
    expect(screen.getByRole("link", { name: /about\.documents/ })).toHaveAttribute("href", `${REPOSITORY}#readme`);
    expect(screen.getByRole("link", { name: /about\.github-repository/ })).toHaveAttribute("href", REPOSITORY);
    expect(screen.getByRole("link", { name: /about\.upstream-project/ })).toHaveAttribute("href", "https://github.com/usememos/memos");
    expect(screen.getByRole("link", { name: /about\.api-docs/ })).toHaveAttribute("href", "https://usememos.com/docs/api");
    expect(screen.getByRole("link", { name: /about\.web-clipper/ })).toHaveAttribute("href", "https://github.com/usememos/web-clipper");
  });

  it("does not surface the instance URL or administrator", () => {
    render(<About />);

    expect(screen.queryByText("https://notes.example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("Steven")).not.toBeInTheDocument();
  });

  it("shows the demo badge on demo instances", () => {
    mockInstance.profile.demo = true;

    render(<About />);

    expect(screen.getByText("about.demo")).toBeInTheDocument();
  });

  it("uses custom branding and still credits Memos Plus", () => {
    mockInstance.generalSetting = {
      customProfile: { title: "Team Notes", description: "Our shared scratchpad.", logoUrl: "/custom-logo.png" },
    };

    render(<About />);

    expect(screen.getByRole("heading", { name: "Team Notes" })).toBeInTheDocument();
    expect(screen.getByText("Our shared scratchpad.")).toBeInTheDocument();
    expect(screen.getByText("Memos Plus")).toBeInTheDocument();
  });

  it("hides a faint link to each odd page at the bottom", () => {
    render(<About />);

    expect(screen.getByRole("link", { name: "oddities.void.name" })).toHaveAttribute("href", "/void");
    expect(screen.getByRole("link", { name: "oddities.teapot.name" })).toHaveAttribute("href", "/418");
    expect(screen.getByRole("link", { name: "oddities.museum.name" })).toHaveAttribute("href", "/museum");
    expect(screen.getByRole("link", { name: "oddities.time.name" })).toHaveAttribute("href", "/time-machine");
  });

  it("renders as a page without nested mobile padding", () => {
    const { container } = render(<About />);

    const contentWrapper = container.querySelector("section > div");
    expect(contentWrapper).toHaveClass("w-full");
    expect(contentWrapper).not.toHaveClass("px-4");
  });
});
