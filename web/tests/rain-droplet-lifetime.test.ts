import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Raindrops from "@/vendor/rain-effect/raindrops";

vi.mock("@/vendor/rain-effect/create-canvas.js", () => ({
  default: (width: number, height: number) => ({
    width,
    height,
    getContext: () => ({
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      clearRect() {},
      drawImage() {},
      fillRect() {},
      beginPath() {},
      arc() {},
      fill() {},
    }),
  }),
}));

const createRain = (rate = 0) => {
  const image = document.createElement("img");
  return new Raindrops(1024, 768, 1, image, image, {
    maxDroplets: 200,
    dropletsLifetime: 2500,
    dropletsFadeDuration: 750,
    dropletsRate: rate,
  });
};

describe("glass bead lifetime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("appears immediately, stays for 2.5 seconds, fades out, then releases its slot", () => {
    const rain = createRain();
    const paint = vi.spyOn(rain, "drawDrop").mockImplementation(() => {});
    rain.drawDroplet(30, 40, 3);

    rain.updateDroplets(1);
    expect(paint.mock.lastCall?.[2]).toBe(1);
    vi.setSystemTime(2500);
    rain.updateDroplets(1);
    expect(paint.mock.lastCall?.[2]).toBe(1);
    vi.setSystemTime(2875);
    rain.updateDroplets(1);
    expect(paint.mock.lastCall?.[2]).toBe(0.5);

    paint.mockClear();
    vi.setSystemTime(3250);
    rain.updateDroplets(1);
    expect(paint).not.toHaveBeenCalled();
    expect(rain.timedDroplets).toHaveLength(0);
  });

  it("keeps the population bounded during prolonged continuous rain", () => {
    const rain = createRain(6);
    vi.spyOn(rain, "drawDrop").mockImplementation(() => {});
    for (let index = 0; index < 200; index++) rain.drawDroplet(index, index, 3);
    const original = new Set(rain.timedDroplets);

    for (let frame = 1; frame <= 1200; frame++) {
      vi.setSystemTime(frame * 100);
      rain.updateDroplets(3.3);
      expect(rain.timedDroplets.length).toBeLessThanOrEqual(200);
    }
    expect(rain.timedDroplets.length).toBeGreaterThan(0);
    expect(rain.timedDroplets.every((bead) => !original.has(bead) && Date.now() - bead.born < 3250)).toBe(true);
  });

  it("does not redraw a bead after a larger moving drop has swept it away", () => {
    const rain = createRain();
    rain.drawDroplet(50, 50, 3);
    rain.drawDroplet(150, 150, 3);
    rain.clearDroplets(50, 50, 15);
    expect(rain.timedDroplets).toHaveLength(1);
    rain.updateDroplets(1);
    expect(rain.timedDroplets).toHaveLength(1);
    expect(rain.timedDroplets[0].drop.x).toBe(150);
  });
});
