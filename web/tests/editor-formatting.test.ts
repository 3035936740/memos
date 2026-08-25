import { markdown } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { GFM } from "@lezer/markdown";
import { describe, expect, it } from "vitest";
import { createFormattingController } from "@/components/MemoEditor/Editor/formatting";

function setup(doc: string, from: number, to: number) {
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: [markdown({ extensions: [GFM] })], selection: EditorSelection.range(from, to) }),
  });
  return { view, f: createFormattingController(view, new Set()) };
}

describe("formatting controller", () => {
  it("wraps selection in bold and reports active", () => {
    const { view, f } = setup("hello world", 0, 5);
    f.run("bold");
    expect(view.state.doc.toString()).toBe("**hello** world");
    view.dispatch({ selection: { anchor: 3 } });
    expect(f.getActiveFormats().bold).toBe(true);
  });

  it("prefixes a heading and reports its level", () => {
    const { view, f } = setup("Title", 0, 0);
    f.run("heading1");
    expect(view.state.doc.toString()).toBe("# Title");
    view.dispatch({ selection: { anchor: 3 } });
    expect(f.getActiveFormats().headingLevel).toBe(1);
  });

  it("toggles a bullet list line", () => {
    const { view, f } = setup("item", 0, 0);
    f.run("bulletList");
    expect(view.state.doc.toString()).toBe("- item");
    f.run("bulletList");
    expect(view.state.doc.toString()).toBe("item");
  });

  it("unbolds when already bold", () => {
    const { view, f } = setup("**hello** world", 4, 4); // cursor inside bold
    f.run("bold");
    expect(view.state.doc.toString()).toBe("hello world");
  });

  it("unwraps italic when already italic", () => {
    const { view, f } = setup("*hi* there", 2, 2);
    f.run("italic");
    expect(view.state.doc.toString()).toBe("hi there");
  });

  it("unwraps inline code when already code", () => {
    const { view, f } = setup("`code` here", 3, 3);
    f.run("code");
    expect(view.state.doc.toString()).toBe("code here");
  });

  it("toggles strikethrough and reports it active", () => {
    const { view, f } = setup("obsolete text", 0, 8);

    f.run("strikethrough");

    expect(view.state.doc.toString()).toBe("~~obsolete~~ text");
    expect(f.getActiveFormats().strikethrough).toBe(true);

    f.run("strikethrough");
    expect(view.state.doc.toString()).toBe("obsolete text");
  });

  it("toggles a fenced code block and reports it active", () => {
    const { view, f } = setup("first\nsecond", 0, 12);

    f.run("codeBlock");

    expect(view.state.doc.toString()).toBe("```\nfirst\nsecond\n```");
    expect(f.getActiveFormats().codeBlock).toBe(true);

    f.run("codeBlock");
    expect(view.state.doc.toString()).toBe("first\nsecond");
  });

  it("aligns a Markdown block and can restore the default left alignment", () => {
    const { view, f } = setup("hello world", 3, 3);

    f.run("alignCenter");
    expect(view.state.doc.toString()).toBe(":::align center\nhello world\n:::");
    expect(f.getActiveFormats().alignment).toBe("center");

    f.run("alignRight");
    expect(view.state.doc.toString()).toContain(":::align right");
    expect(f.getActiveFormats().alignment).toBe("right");

    f.run("alignLeft");
    expect(view.state.doc.toString()).toBe("hello world");
    expect(f.getActiveFormats().alignment).toBe("left");
  });

  it("applies and removes a validated RGBA text color", () => {
    const { view, f } = setup("color me", 0, 5);

    f.run("textColor", { color: "255, 80, 40, 0.65" });
    expect(view.state.doc.toString()).toBe("[color=rgba(255, 80, 40, 0.65)]color[/color] me");
    expect(f.getActiveFormats().textColor).toBe("rgba(255, 80, 40, 0.65)");

    f.run("textColor", { color: "" });
    expect(view.state.doc.toString()).toBe("color me");
    expect(f.getActiveFormats().textColor).toBeNull();
  });

  it("applies and removes a validated custom font size", () => {
    const { view, f } = setup("large text", 0, 5);

    f.run("fontSize", { fontSize: "28" });
    expect(view.state.doc.toString()).toBe("[size=28px]large[/size] text");
    expect(f.getActiveFormats().fontSize).toBe("28px");

    f.run("fontSize", { fontSize: "" });
    expect(view.state.doc.toString()).toBe("large text");
    expect(f.getActiveFormats().fontSize).toBeNull();
  });

  it("toggles hidden text without colliding with Markdown links", () => {
    const { view, f } = setup("secret [link](https://example.com)", 0, 6);

    f.run("spoiler");
    expect(view.state.doc.toString()).toBe("||secret|| [link](https://example.com)");
    expect(f.getActiveFormats().spoiler).toBe(true);

    f.run("spoiler");
    expect(view.state.doc.toString()).toBe("secret [link](https://example.com)");
  });
});
