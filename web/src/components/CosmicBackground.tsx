import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  radius: number;
  velocityX: number;
  velocityY: number;
  alpha: number;
  phase: number;
  pulseSpeed: number;
  pulseAmount: number;
  color: [number, number, number];
}

const THEME_NAME = "cosmic-dark";
const FRAME_INTERVAL = 1000 / 30;

const CosmicBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !context) return;

    let particles: Particle[] = [];
    let animationFrame = 0;
    let resizeTimer = 0;
    let previousFrame = 0;
    let active = false;

    const createParticles = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const mobile = width < 640;
      const calculatedCount = Math.round((width * height) / (mobile ? 18000 : 22000));
      const count = mobile ? Math.max(24, Math.min(calculatedCount, 38)) : Math.max(45, Math.min(calculatedCount, 75));
      const colors: Particle["color"][] = [
        [212, 219, 255],
        [180, 200, 255],
        [215, 188, 255],
      ];

      particles = Array.from({ length: count }, () => {
        const direction = Math.random() * Math.PI * 2;
        const speed = 0.012 + Math.random() * 0.055;
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          radius: 0.4 + Math.random() * 1.15,
          velocityX: Math.cos(direction) * speed,
          velocityY: Math.sin(direction) * speed,
          alpha: 0.16 + Math.random() * 0.46,
          phase: Math.random() * Math.PI * 2,
          pulseSpeed: 0.012 + Math.random() * 0.027,
          pulseAmount: 0.18 + Math.random() * 0.38,
          color: colors[Math.floor(Math.random() * colors.length)],
        };
      });
    };

    const resizeCanvas = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(window.innerWidth * pixelRatio);
      canvas.height = Math.floor(window.innerHeight * pixelRatio);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      createParticles();
    };

    const draw = (timestamp: number) => {
      if (!active) return;
      animationFrame = requestAnimationFrame(draw);
      if (timestamp - previousFrame < FRAME_INTERVAL) return;

      const frameScale = previousFrame === 0 ? 1 : Math.min(timestamp - previousFrame, 66) / FRAME_INTERVAL;
      previousFrame = timestamp;
      const width = window.innerWidth;
      const height = window.innerHeight;
      context.clearRect(0, 0, width, height);

      for (const particle of particles) {
        particle.x += particle.velocityX * frameScale;
        particle.y += particle.velocityY * frameScale;
        particle.phase += particle.pulseSpeed * frameScale;

        if (particle.x < -3) particle.x = width + 3;
        if (particle.x > width + 3) particle.x = -3;
        if (particle.y < -3) particle.y = height + 3;
        if (particle.y > height + 3) particle.y = -3;

        const pulse = Math.sin(particle.phase) * 0.72 + Math.sin(particle.phase * 0.47 + 1.7) * 0.28;
        const alpha = Math.max(0.06, Math.min(particle.alpha * (1 + pulse * particle.pulseAmount), 0.82));
        const radius = Math.max(0.35, particle.radius * (1 + pulse * 0.12));
        const [red, green, blue] = particle.color;

        context.beginPath();
        context.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
        context.fill();

        if (particle.radius > 1.15 && alpha > 0.46) {
          context.beginPath();
          context.arc(particle.x, particle.y, radius * 2.8, 0, Math.PI * 2);
          context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha * 0.08})`;
          context.fill();
        }
      }
    };

    const syncTheme = () => {
      const nextActive = document.documentElement.dataset.theme === THEME_NAME;
      if (nextActive === active) return;
      active = nextActive;
      canvas.hidden = !active;
      cancelAnimationFrame(animationFrame);
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (active && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        previousFrame = 0;
        resizeCanvas();
        animationFrame = requestAnimationFrame(draw);
      }
    };

    const handleResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (active) {
          previousFrame = 0;
          resizeCanvas();
        }
      }, 180);
    };

    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("resize", handleResize);
    syncTheme();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
      window.clearTimeout(resizeTimer);
      cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      hidden
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 size-full"
      style={{ zIndex: 0 }}
    />
  );
};

export default CosmicBackground;
