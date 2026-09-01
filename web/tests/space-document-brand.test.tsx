import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SpaceDocumentBrand from "@/components/SpaceDocumentBrand";

const state = vi.hoisted(() => ({
  selectedSpace: undefined as { title: string; avatarUrl?: string } | undefined,
}));

vi.mock("@/contexts/InstanceContext", () => ({
  useInstance: () => ({ generalSetting: { customProfile: { title: "Instance", logoUrl: "/instance.png" } } }),
}));

vi.mock("@/contexts/SpaceContext", () => ({
  useSpaceContext: () => ({ selectedSpace: state.selectedSpace }),
}));

describe("SpaceDocumentBrand", () => {
  afterEach(() => {
    document.querySelector("link[data-space-document-brand-test]")?.remove();
    document.title = "";
    state.selectedSpace = undefined;
  });

  it("switches the browser title and favicon between the active Space and instance", async () => {
    const icon = document.createElement("link");
    icon.rel = "icon";
    icon.dataset.spaceDocumentBrandTest = "true";
    document.head.appendChild(icon);
    state.selectedSpace = { title: "Product", avatarUrl: "/product.png" };
    const view = render(<SpaceDocumentBrand />);

    await waitFor(() => expect(document.title).toBe("Product"));
    expect(icon.getAttribute("href")).toBe("/product.png");

    state.selectedSpace = undefined;
    view.rerender(<SpaceDocumentBrand />);
    await waitFor(() => expect(document.title).toBe("Instance"));
    expect(icon.getAttribute("href")).toBe("/instance.png");
  });
});
