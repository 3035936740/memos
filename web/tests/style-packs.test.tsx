import { create } from "@bufbuild/protobuf";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useView, ViewProvider } from "@/contexts/ViewContext";
import { StylePackSchema } from "@/types/proto/api/v1/instance_service_pb";
import { postLookOf } from "@/utils/post-look";
import { applyStylePackStylesheet, isStylePackId, stylePackBase, stylePackLabel, stylePackScheme } from "@/utils/style-packs";
import { loadTheme } from "@/utils/theme";

const pack = (id: string, reactsLike = "", colorScheme = "") =>
  create(StylePackSchema, {
    id,
    name: { en: "Sunset paper", "zh-Hans": "夕阳信纸" },
    reactsLike,
    colorScheme,
    cssUrl: `/style-packs/${id}/1.css`,
    enabled: true,
  });

describe("style pack helpers", () => {
  afterEach(() => applyStylePackStylesheet(undefined));

  it("accepts the ids the server accepts and nothing built in", () => {
    expect(isStylePackId("sunset-paper")).toBe(true);
    expect(isStylePackId("ab")).toBe(false);
    expect(isStylePackId("glass")).toBe(false);
    expect(isStylePackId("memos-thing")).toBe(false);
    expect(isStylePackId("Sunset")).toBe(false);
  });

  it("borrows a built-in style's behaviour, or the default one", () => {
    expect(stylePackBase(pack("sunset-paper", "handdrawn"))).toBe("handdrawn");
    expect(stylePackBase(pack("sunset-paper", "not-a-style"))).toBe("default");
    expect(stylePackBase(undefined)).toBe("default");
  });

  it("reads the one scheme a pack is drawn for", () => {
    expect(stylePackScheme(pack("sunset-paper", "", "dark"))).toBe("dark");
    expect(stylePackScheme(pack("sunset-paper", "", "light"))).toBe("light");
    expect(stylePackScheme(pack("sunset-paper"))).toBeUndefined();
    expect(stylePackScheme(undefined)).toBeUndefined();
  });

  it("names a pack in the reader's language", () => {
    expect(stylePackLabel(pack("sunset-paper"), "zh-Hans")).toBe("夕阳信纸");
    expect(stylePackLabel(pack("sunset-paper"), "zh-Hant")).toBe("Sunset paper");
    expect(stylePackLabel({ id: "bare", name: {} }, "en")).toBe("bare");
  });

  it("keeps one pack stylesheet on the page", () => {
    applyStylePackStylesheet("/style-packs/a/1.css");
    applyStylePackStylesheet("/style-packs/b/2.css");
    const links = document.querySelectorAll("link#memos-style-pack");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/style-packs/b/2.css");
    applyStylePackStylesheet(undefined);
    expect(document.getElementById("memos-style-pack")).toBeNull();
  });

  it("lets a post's #style/ tag name an enabled pack", () => {
    expect(postLookOf(["style/sunset-paper"], ["sunset-paper"])).toEqual({ stylePack: "sunset-paper" });
    expect(postLookOf(["style/sunset-paper"], [])).toEqual({});
    expect(postLookOf(["style/glass"], ["glass"]).style).toBe("glass");
  });
});

describe("ViewContext with style packs", () => {
  let view: ReturnType<typeof useView>;
  const Probe = () => {
    view = useView();
    return null;
  };

  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.style;
    delete document.documentElement.dataset.stylePack;
  });

  const mount = () => render(<Probe />, { wrapper: ViewProvider });

  it("wears a pack on <html> while reactions follow the style it borrows", () => {
    mount();
    act(() => view.setStylePacks([pack("sunset-paper", "pixel")]));
    act(() => view.setStylePack("sunset-paper"));

    expect(document.documentElement.dataset.style).toBe("sunset-paper");
    expect(view.styleId).toBe("sunset-paper");
    expect(view.blogStyle).toBe("pixel");
    expect(view.stylePack?.id).toBe("sunset-paper");

    act(() => view.setBlogStyle("glass"));
    expect(view.styleId).toBe("glass");
    expect(view.stylePack).toBeUndefined();
  });

  it("borrows reactions but not scenery, and marks <html> while a pack shows", () => {
    mount();
    act(() => view.setStylePacks([pack("sunset-paper", "vaporwave")]));
    act(() => view.setStylePack("sunset-paper"));
    expect(view.blogStyle).toBe("vaporwave");
    expect(view.sceneStyle).toBe("default");
    expect(document.documentElement.dataset.stylePack).toBe("");

    act(() => view.setBlogStyle("vaporwave"));
    expect(view.sceneStyle).toBe("vaporwave");
    expect(document.documentElement.dataset.stylePack).toBeUndefined();
  });

  it("shows a dark-only pack in a dark theme and gives the visitor's theme back", () => {
    loadTheme("paper", { persist: false });
    mount();
    act(() => view.setStylePacks([pack("night-ink", "", "dark")]));
    act(() => view.setStylePack("night-ink"));
    expect(document.documentElement.dataset.theme).toBe("default-dark");

    act(() => view.setBlogStyle("glass"));
    expect(document.documentElement.dataset.theme).toBe("paper");
  });

  it("previews a pack in this tab only, in Blog 2, without saving anything", () => {
    localStorage.setItem("memos-view-setting", JSON.stringify({ feedLayout: "memo" }));
    mount();
    act(() => view.startPackPreview({ pack: pack("night-ink", "pixel"), expiresAt: new Date(Date.now() + 60_000) }));
    expect(view.feedLayout).toBe("blog2");
    expect(view.styleId).toBe("night-ink");
    expect(view.blogStyle).toBe("pixel");
    expect(view.sceneStyle).toBe("default");
    expect(document.documentElement.dataset.style).toBe("night-ink");
    expect(JSON.parse(localStorage.getItem("memos-view-setting") ?? "{}").feedLayout).toBe("memo");

    act(() => view.endPackPreview());
    expect(view.feedLayout).toBe("memo");
    expect(document.documentElement.dataset.style).toBeUndefined();
  });

  it("ends a preview when a style is picked by hand", () => {
    mount();
    act(() => view.startPackPreview({ pack: pack("night-ink") }));
    act(() => view.setBlogStyle("glass"));
    expect(view.packPreview).toBeUndefined();
    expect(view.styleId).toBe("glass");
  });

  it("keeps a saved pack until the list arrives, then falls back if it is gone", () => {
    localStorage.setItem("memos-view-setting", JSON.stringify({ feedLayout: "blog2", blogStyle: "glass", stylePack: "old-pack" }));
    mount();
    expect(document.documentElement.dataset.style).toBe("old-pack");

    act(() => view.setStylePacks([pack("sunset-paper")]));
    expect(view.styleId).toBe("default");
    expect(JSON.parse(localStorage.getItem("memos-view-setting") ?? "{}").stylePack).toBeUndefined();
  });

  it("shows a post's pack and gives the visitor's style back afterwards", () => {
    mount();
    act(() => view.setStylePacks([pack("sunset-paper")]));
    act(() => view.setPostLook({ stylePack: "sunset-paper" }));
    expect(view.styleId).toBe("sunset-paper");

    act(() => view.setPostLook(undefined));
    expect(view.styleId).toBe("default");
  });
});
