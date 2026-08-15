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
  wobblePhase: number;
  wobbleSpeed: number;
  wobbleAmount: number;
  color: [number, number, number];
}

type ParticleTheme = "cosmic-dark" | "twilight-dark";

const PARTICLE_THEMES: ParticleTheme[] = ["cosmic-dark", "twilight-dark"];
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
    let activeTheme: ParticleTheme | undefined;

    const createParticles = (theme: ParticleTheme) => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const mobile = width < 640;
      const firefly = theme === "twilight-dark";
      const calculatedCount = Math.round((width * height) / (firefly ? (mobile ? 26000 : 38000) : mobile ? 18000 : 22000));
      const count = firefly
        ? mobile
          ? Math.max(14, Math.min(calculatedCount, 24))
          : Math.max(22, Math.min(calculatedCount, 36))
        : mobile
          ? Math.max(24, Math.min(calculatedCount, 38))
          : Math.max(45, Math.min(calculatedCount, 75));
      const colors: Particle["color"][] = firefly
        ? [
            [255, 221, 116],
            [224, 255, 146],
            [255, 174, 92],
          ]
        : [
            [212, 219, 255],
            [180, 200, 255],
            [215, 188, 255],
          ];

      particles = Array.from({ length: count }, () => {
        const direction = Math.random() * Math.PI * 2;
        const speed = firefly ? 0.011 + Math.random() * 0.038 : 0.012 + Math.random() * 0.055;
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          radius: firefly ? 0.7 + Math.random() * 1.1 : 0.4 + Math.random() * 1.15,
          velocityX: Math.cos(direction) * speed,
          velocityY: Math.sin(direction) * speed - (firefly ? 0.004 : 0),
          alpha: firefly ? 0.18 + Math.random() * 0.5 : 0.16 + Math.random() * 0.46,
          phase: Math.random() * Math.PI * 2,
          pulseSpeed: firefly ? 0.02 + Math.random() * 0.04 : 0.012 + Math.random() * 0.027,
          pulseAmount: firefly ? 0.42 + Math.random() * 0.42 : 0.18 + Math.random() * 0.38,
          wobblePhase: Math.random() * Math.PI * 2,
          wobbleSpeed: firefly ? 0.008 + Math.random() * 0.018 : 0,
          wobbleAmount: firefly ? 0.004 + Math.random() * 0.014 : 0,
          color: colors[Math.floor(Math.random() * colors.length)],
        };
      });
    };

    const resizeCanvas = (theme: ParticleTheme) => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(window.innerWidth * pixelRatio);
      canvas.height = Math.floor(window.innerHeight * pixelRatio);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      createParticles(theme);
    };

    const draw = (timestamp: number) => {
      if (!activeTheme) return;
      animationFrame = requestAnimationFrame(draw);
      if (timestamp - previousFrame < FRAME_INTERVAL) return;

      const frameScale = previousFrame === 0 ? 1 : Math.min(timestamp - previousFrame, 66) / FRAME_INTERVAL;
      previousFrame = timestamp;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const firefly = activeTheme === "twilight-dark";
      context.clearRect(0, 0, width, height);

      for (const particle of particles) {
        particle.wobblePhase += particle.wobbleSpeed * frameScale;
        particle.x += (particle.velocityX + Math.sin(particle.wobblePhase) * particle.wobbleAmount) * frameScale;
        particle.y += (particle.velocityY + Math.cos(particle.wobblePhase * 0.83) * particle.wobbleAmount) * frameScale;
        particle.phase += particle.pulseSpeed * frameScale;

        if (particle.x < -3) particle.x = width + 3;
        if (particle.x > width + 3) particle.x = -3;
        if (particle.y < -3) particle.y = height + 3;
        if (particle.y > height + 3) particle.y = -3;

        const pulse = Math.sin(particle.phase) * 0.72 + Math.sin(particle.phase * 0.47 + 1.7) * 0.28;
        const alpha = Math.max(0.06, Math.min(particle.alpha * (1 + pulse * particle.pulseAmount), 0.82));
        const radius = Math.max(0.35, particle.radius * (1 + pulse * 0.12));
        const [red, green, blue] = particle.color;

        if ((firefly && alpha > 0.18) || (!firefly && particle.radius > 1.15 && alpha > 0.46)) {
          context.beginPath();
          context.arc(particle.x, particle.y, radius * (firefly ? 4.8 : 2.8), 0, Math.PI * 2);
          context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha * (firefly ? 0.13 : 0.08)})`;
          context.fill();
        }

        context.beginPath();
        context.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
        context.fill();
      }
    };

    const syncTheme = () => {
      const theme = document.documentElement.dataset.theme;
      const nextTheme = PARTICLE_THEMES.includes(theme as ParticleTheme) ? (theme as ParticleTheme) : undefined;
      if (nextTheme === activeTheme) return;
      activeTheme = nextTheme;
      canvas.hidden = !activeTheme;
      cancelAnimationFrame(animationFrame);
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (activeTheme && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        previousFrame = 0;
        resizeCanvas(activeTheme);
        animationFrame = requestAnimationFrame(draw);
      }
    };

    const handleResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (activeTheme) {
          previousFrame = 0;
          resizeCanvas(activeTheme);
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

  return <canvas ref={canvasRef} hidden aria-hidden="true" className="pointer-events-none fixed inset-0 size-full" style={{ zIndex: 0 }} />;
};

export default CosmicBackground;
