import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RainyGlass from "@/components/StyledBlog/RainyGlass";

const mocks = vi.hoisted(() => ({
  capture: vi.fn<() => Promise<HTMLCanvasElement>>(),
  renderer: { background: vi.fn(), environment: vi.fn(), scroll: vi.fn(), resize: vi.fn(), draw: vi.fn(), destroy: vi.fn() },
}));

vi.mock("html-to-image", () => ({ toCanvas: mocks.capture }));
vi.mock("@/components/StyledBlog/rain-renderer", () => ({ createRainRenderer: () => mocks.renderer }));
vi.mock("@/vendor/rain-effect/raindrops", () => ({
  default: class {
    canvas = document.createElement("canvas");
    dropletsCtx = { globalCompositeOperation: "", fillStyle: "", fillRect: () => {} };
    options = { raining: true };
    lastRender: number | null = null;
    update() {}
    drawDroplet() {}
    createDrop(drop: unknown) {
      return drop;
    }
    addDrop() {}
  },
}));

describe("glass rain startup", () => {
  let frames: Map<number, FrameRequestCallback>;
  let sequence: number;
  let finishCapture: (image: HTMLCanvasElement) => void;

  beforeEach(() => {
    frames = new Map();
    sequence = 0;
    mocks.capture.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishCapture = resolve;
        }),
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++sequence, callback);
      return sequence;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps seeded droplets hidden until the viewport texture and the first water frame are both ready", async () => {
    const view = render(<RainyGlass />);
    const canvas = document.querySelector<HTMLCanvasElement>("[data-rainy-glass] canvas")!;
    expect(canvas.dataset.rainReady).toBe("false");
    await waitFor(() => expect(mocks.capture).toHaveBeenCalledOnce());

    act(() => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(100));
    });
    expect(mocks.renderer.draw).toHaveBeenCalled();
    expect(canvas.dataset.rainReady).toBe("false");

    await act(async () => finishCapture(document.createElement("canvas")));
    expect(mocks.renderer.background).toHaveBeenCalledOnce();
    expect(canvas.dataset.rainReady).toBe("true");

    view.unmount();
    expect(mocks.renderer.destroy).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
  });
});
