import { create } from "@bufbuild/protobuf";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useView, ViewProvider } from "@/contexts/ViewContext";
import { StylePackSchema } from "@/types/proto/api/v1/instance_service_pb";
import { postLookOf } from "@/utils/post-look";
import { applyStylePackStylesheet, isStylePackId, stylePackBase, stylePackLabel } from "@/utils/style-packs";

const pack = (id: string, reactsLike = "") =>
  create(StylePackSchema, {
    id,
    name: { en: "Sunset paper", "zh-Hans": "夕阳信纸" },
    reactsLike,
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
