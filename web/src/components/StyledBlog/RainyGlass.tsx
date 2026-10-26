import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import dropAlphaUrl from "@/vendor/rain-effect/drop-alpha.png";
import dropColorUrl from "@/vendor/rain-effect/drop-color.png";
import Raindrops from "@/vendor/rain-effect/raindrops";
import { createRainRenderer } from "./rain-renderer";

const loadTexture = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Cannot load RainEffect water texture"));
    image.src = url;
  });

/** The actual Codrops RainEffect simulation and refraction shader, composed over the live article. */
const RainyGlass = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let frame = 0;
    let captureTimer = 0;
    let resizeTimer = 0;
    let lastFrame = 0;
    let capturing = false;
    let captureAgain = false;
    let backgroundReady = false;
    let waterReady = false;
    let captureVersion = 0;
    let captureScrollX = window.scrollX;
    let captureScrollY = window.scrollY;
    let viewportWidth = window.innerWidth;
    let viewportHeight = window.innerHeight;
    let simulation: Raindrops | undefined;
    let renderer: ReturnType<typeof createRainRenderer>;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    canvas.dataset.rainReady = "false";
    const reveal = () => {
      if (backgroundReady && waterReady && !disposed) canvas.dataset.rainReady = "true";
    };
    const dimensions = () => {
      // Bound total pixels on tall phones and large monitors as well as the width.
      const scale = Math.min(1, 1280 / window.innerWidth, Math.sqrt(750_000 / (window.innerWidth * window.innerHeight)));
      canvas.width = Math.round(window.innerWidth * scale);
      canvas.height = Math.round(window.innerHeight * scale);
      return scale;
    };
    let scale = dimensions();
    try {
      renderer = createRainRenderer(canvas, scale);
    } catch (error) {
      canvas.dataset.rainState = "shader-error";
      canvas.dataset.rainError = error instanceof Error ? error.message : String(error);
      return;
    }
    if (!renderer) {
      canvas.dataset.rainState = "webgl-unavailable";
      return;
    }
    canvas.dataset.rainState = "loading";
    const environment = document.createElement("canvas");
    environment.width = environment.height = 1;
    const updateEnvironment = () => {
      const context = environment.getContext("2d");
      if (!context) return;
      context.fillStyle = getComputedStyle(document.body).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      renderer?.environment(environment);
    };
    const onScroll = () => {
      renderer?.scroll((window.scrollX - captureScrollX) / viewportWidth, (window.scrollY - captureScrollY) / viewportHeight);
    };

    // A transparent water-only canvas leaves selection, links, scrolling and the editor interactive.
    // Captures stay local and only provide the colours that the upstream shader bends inside the drops.
    const captureBackground = async () => {
      if (disposed) return;
      if (capturing) {
        captureAgain = true;
        return;
      }
      capturing = true;
      const version = captureVersion;
      try {
        updateEnvironment();
        const { toCanvas } = await import("html-to-image");
        // Cache up to three screens once. Scrolling only changes a shader uniform.
        const captureHeight = Math.min(window.innerHeight * 3, Math.max(window.innerHeight, document.body.scrollHeight - window.scrollY));
        const startX = window.scrollX;
        const startY = window.scrollY;
        const viewport = await toCanvas(document.body, {
          width: window.innerWidth,
          height: captureHeight,
          pixelRatio: scale / Math.sqrt(captureHeight / window.innerHeight),
          skipFonts: true,
          filter: (node) => {
            if (!(node instanceof Element)) return true;
            if (node.matches("[data-rainy-glass], [data-reaction-canvas], [data-rain-performance], script, style")) return false;
            const rect = node.getBoundingClientRect();
            return (rect.width === 0 && rect.height === 0) || (rect.bottom >= 0 && rect.top <= captureHeight);
          },
          style: {
            transform: "translate(" + -startX + "px," + -startY + "px)",
            transformOrigin: "top left",
            width: document.body.scrollWidth + "px",
            height: document.body.scrollHeight + "px",
          },
        });
        if (!disposed && version === captureVersion) {
          captureScrollX = startX;
          captureScrollY = startY;
          renderer?.background(viewport, [1, captureHeight / viewportHeight]);
          onScroll();
          if (simulation && motion.matches) renderer?.draw(simulation.canvas);
          canvas.dataset.rainBackground = "viewport";
          backgroundReady = true;
          reveal();
        }
      } catch {
        // Remote images can prohibit canvas capture. Keep the same upstream water simulation with a local colour texture.
        if (!disposed && version === captureVersion) {
          renderer?.background(environment);
          if (simulation && motion.matches) renderer?.draw(simulation.canvas);
          canvas.dataset.rainBackground = "color";
          backgroundReady = true;
          reveal();
        }
      } finally {
        capturing = false;
        if (captureAgain && !disposed) {
          captureAgain = false;
          captureTimer = window.setTimeout(() => void captureBackground(), 400);
        }
      }
    };
    const scheduleCapture = () => {
      window.clearTimeout(captureTimer);
      captureVersion++;
      captureTimer = window.setTimeout(() => void captureBackground(), 500);
    };
    const tick = (time: number) => {
      frame = 0;
      if (disposed || document.hidden || !simulation) return;
      if (time - lastFrame < 32) {
        frame = window.requestAnimationFrame(tick);
        return;
      }
      lastFrame = time;
      simulation.options.raining = !motion.matches;
      simulation.update();
      renderer?.draw(simulation.canvas);
      waterReady = true;
      reveal();
      if (!motion.matches) frame = window.requestAnimationFrame(tick);
    };
    const resume = () => {
      if (disposed || document.hidden || !simulation || frame) return;
      simulation.lastRender = null;
      lastFrame = 0;
      frame = window.requestAnimationFrame(tick);
    };
    let images: [HTMLImageElement, HTMLImageElement] | undefined;
    const resetSimulation = () => {
      if (!images || disposed) return;
      waterReady = false;
      const initialDropletCount = 150 + Math.floor(Math.random() * 101);
      simulation = new Raindrops(canvas.width, canvas.height, scale, images[0], images[1], {
        minR: 8,
        maxR: 22,
        maxDrops: 90,
        rainChance: 0.12,
        rainLimit: 2,
        dropletsRate: 6,
        dropletsSize: [2.5, 4.5],
        maxDroplets: initialDropletCount,
        dropletsLifetime: 2500,
        dropletsFadeDuration: 750,
        trailRate: 1,
        trailScaleRange: [0.15, 0.28],
        collisionRadius: 0.45,
        dropletsCleaningRadiusMultiplier: 0.3,
      });
      for (let index = 0; index < initialDropletCount; index++) {
        simulation.drawDroplet(
          Math.random() * window.innerWidth,
          Math.random() * window.innerHeight,
          2.5 + Math.random() * 2,
          Math.random() * 2500,
        );
      }
      for (let index = 0; index < 12; index++) {
        simulation.addDrop(
          simulation.createDrop({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            r: 8 + Math.random() * 6,
            momentum: 0,
          }),
        );
      }
      resume();
    };
    const resize = () => {
      // Mobile browser toolbars can emit resize on every scroll; do not rebuild for that small height change.
      if (window.innerWidth === viewportWidth && Math.abs(window.innerHeight - viewportHeight) < 100) return;
      viewportWidth = window.innerWidth;
      viewportHeight = window.innerHeight;
      canvas.dataset.rainReady = "false";
      backgroundReady = false;
      captureVersion++;
      scale = dimensions();
      renderer?.resize(scale);
      resetSimulation();
      scheduleCapture();
    };
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resize, 200);
    };
    void Promise.all([loadTexture(dropAlphaUrl), loadTexture(dropColorUrl)]).then(
      (textures) => {
        if (disposed) return;
        images = textures;
        canvas.dataset.rainState = "running";
        resetSimulation();
        void captureBackground();
      },
      () => {
        // A failed optional effect must never prevent the article from opening.
      },
    );
    const themeObserver = new MutationObserver(scheduleCapture);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-style"] });
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    motion.addEventListener("change", resume);
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(captureTimer);
      window.clearTimeout(resizeTimer);
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      motion.removeEventListener("change", resume);
      renderer?.destroy();
    };
  }, []);

  return createPortal(
    <div data-rainy-glass="" aria-hidden className="pointer-events-none fixed inset-0 z-[55] overflow-hidden">
      <canvas
        ref={canvasRef}
        data-rain-ready="false"
        className="absolute inset-0 size-full opacity-0 transition-opacity duration-500 data-[rain-ready=true]:opacity-100 motion-reduce:transition-none"
      />
    </div>,
    document.body,
  );
};

export default RainyGlass;
