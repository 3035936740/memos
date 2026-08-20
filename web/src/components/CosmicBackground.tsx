import { useEffect, useRef } from "react";

type RGB = readonly [number, number, number];
type ParticleKind = "star" | "firefly" | "bubble" | "rain" | "dash" | "petal" | "dust" | "confetti";

interface ParticleThemeConfig {
  kind: ParticleKind;
  colors: readonly RGB[];
  density: number;
  desktopCount: readonly [number, number];
  mobileCount: readonly [number, number];
  radius: readonly [number, number];
  speed: readonly [number, number];
  alpha: readonly [number, number];
  pulse: readonly [number, number];
  driftY?: number;
  wobble?: number;
}

interface Particle {
  x: number;
  y: number;
  radius: number;
  length: number;
  velocityX: number;
  velocityY: number;
  alpha: number;
  phase: number;
  pulseSpeed: number;
  pulseAmount: number;
  wobblePhase: number;
  wobbleSpeed: number;
  wobbleAmount: number;
  rotation: number;
  spin: number;
  color: RGB;
}

const PARTICLE_THEME_CONFIGS = {
  "cosmic-dark": {
    kind: "star",
    colors: [
      [212, 219, 255],
      [180, 200, 255],
      [215, 188, 255],
    ],
    density: 22000,
    desktopCount: [45, 75],
    mobileCount: [24, 38],
    radius: [0.4, 1.55],
    speed: [0.012, 0.067],
    alpha: [0.16, 0.62],
    pulse: [0.18, 0.56],
  },
  "twilight-dark": {
    kind: "firefly",
    colors: [
      [255, 221, 116],
      [224, 255, 146],
      [255, 174, 92],
    ],
    density: 38000,
    desktopCount: [22, 36],
    mobileCount: [14, 24],
    radius: [0.7, 1.8],
    speed: [0.045, 0.105],
    alpha: [0.2, 0.68],
    pulse: [0.42, 0.84],
    driftY: -0.008,
    wobble: 0.024,
  },
  "aurora-dark": {
    kind: "dust",
    colors: [
      [112, 255, 210],
      [126, 191, 255],
      [206, 135, 255],
    ],
    density: 27000,
    desktopCount: [32, 56],
    mobileCount: [20, 34],
    radius: [0.45, 1.45],
    speed: [0.018, 0.066],
    alpha: [0.14, 0.5],
    pulse: [0.2, 0.52],
    wobble: 0.012,
  },
  "abyss-dark": {
    kind: "bubble",
    colors: [
      [84, 207, 255],
      [82, 142, 219],
      [113, 240, 222],
    ],
    density: 45000,
    desktopCount: [18, 32],
    mobileCount: [12, 22],
    radius: [0.9, 2.6],
    speed: [0.018, 0.052],
    alpha: [0.14, 0.42],
    pulse: [0.12, 0.34],
    driftY: -0.026,
    wobble: 0.016,
  },
  "neon-rain-dark": {
    kind: "rain",
    colors: [
      [52, 231, 255],
      [255, 72, 206],
      [132, 104, 255],
    ],
    density: 19000,
    desktopCount: [38, 65],
    mobileCount: [24, 40],
    radius: [0.5, 1.1],
    speed: [0.32, 0.68],
    alpha: [0.14, 0.46],
    pulse: [0.08, 0.22],
    driftY: 0.52,
  },
  "moonlit-forest-dark": {
    kind: "firefly",
    colors: [
      [217, 255, 141],
      [142, 239, 155],
      [244, 224, 123],
    ],
    density: 47000,
    desktopCount: [18, 30],
    mobileCount: [12, 20],
    radius: [0.75, 1.7],
    speed: [0.038, 0.09],
    alpha: [0.18, 0.62],
    pulse: [0.38, 0.78],
    driftY: -0.006,
    wobble: 0.026,
  },
  "retro-terminal-dark": {
    kind: "dash",
    colors: [
      [83, 255, 126],
      [169, 255, 181],
      [64, 204, 105],
    ],
    density: 35000,
    desktopCount: [22, 38],
    mobileCount: [14, 25],
    radius: [0.45, 0.9],
    speed: [0.045, 0.13],
    alpha: [0.14, 0.46],
    pulse: [0.1, 0.3],
    driftY: 0.035,
  },
  "ink-night-dark": {
    kind: "dust",
    colors: [
      [192, 203, 214],
      [124, 151, 176],
      [218, 223, 226],
    ],
    density: 52000,
    desktopCount: [15, 26],
    mobileCount: [9, 16],
    radius: [0.5, 1.8],
    speed: [0.012, 0.045],
    alpha: [0.1, 0.34],
    pulse: [0.08, 0.26],
    wobble: 0.008,
  },
  "sakura-night-dark": {
    kind: "petal",
    colors: [
      [255, 153, 196],
      [246, 193, 224],
      [196, 138, 222],
    ],
    density: 39000,
    desktopCount: [22, 36],
    mobileCount: [14, 24],
    radius: [0.8, 1.65],
    speed: [0.035, 0.095],
    alpha: [0.18, 0.52],
    pulse: [0.1, 0.28],
    driftY: 0.042,
    wobble: 0.025,
  },
  dawn: {
    kind: "dust",
    colors: [
      [245, 154, 112],
      [255, 198, 121],
      [241, 126, 145],
    ],
    density: 46000,
    desktopCount: [18, 30],
    mobileCount: [10, 18],
    radius: [0.5, 1.45],
    speed: [0.018, 0.052],
    alpha: [0.1, 0.32],
    pulse: [0.12, 0.34],
    driftY: -0.008,
  },
  "ocean-breeze": {
    kind: "bubble",
    colors: [
      [44, 175, 191],
      [91, 191, 224],
      [83, 203, 173],
    ],
    density: 50000,
    desktopCount: [16, 28],
    mobileCount: [10, 18],
    radius: [0.9, 2.35],
    speed: [0.018, 0.05],
    alpha: [0.1, 0.3],
    pulse: [0.1, 0.3],
    driftY: -0.02,
    wobble: 0.012,
  },
  matcha: {
    kind: "dust",
    colors: [
      [90, 143, 77],
      [134, 171, 85],
      [190, 158, 82],
    ],
    density: 52000,
    desktopCount: [15, 26],
    mobileCount: [9, 16],
    radius: [0.55, 1.55],
    speed: [0.016, 0.047],
    alpha: [0.09, 0.26],
    pulse: [0.08, 0.24],
    driftY: 0.006,
    wobble: 0.012,
  },
  lavender: {
    kind: "dust",
    colors: [
      [147, 112, 201],
      [190, 143, 218],
      [111, 145, 210],
    ],
    density: 48000,
    desktopCount: [17, 29],
    mobileCount: [10, 18],
    radius: [0.5, 1.5],
    speed: [0.016, 0.05],
    alpha: [0.09, 0.29],
    pulse: [0.12, 0.32],
    wobble: 0.01,
  },
  "sakura-day": {
    kind: "petal",
    colors: [
      [224, 111, 151],
      [244, 154, 184],
      [205, 124, 169],
    ],
    density: 45000,
    desktopCount: [18, 31],
    mobileCount: [11, 19],
    radius: [0.75, 1.5],
    speed: [0.03, 0.075],
    alpha: [0.13, 0.36],
    pulse: [0.08, 0.24],
    driftY: 0.035,
    wobble: 0.022,
  },
  "desert-sand": {
    kind: "dust",
    colors: [
      [171, 109, 57],
      [207, 148, 75],
      [137, 104, 72],
    ],
    density: 47000,
    desktopCount: [17, 30],
    mobileCount: [10, 18],
    radius: [0.45, 1.35],
    speed: [0.025, 0.07],
    alpha: [0.08, 0.25],
    pulse: [0.06, 0.2],
    wobble: 0.014,
  },
  porcelain: {
    kind: "bubble",
    colors: [
      [76, 135, 173],
      [113, 166, 188],
      [155, 183, 202],
    ],
    density: 65000,
    desktopCount: [12, 20],
    mobileCount: [7, 13],
    radius: [0.7, 1.8],
    speed: [0.012, 0.036],
    alpha: [0.06, 0.19],
    pulse: [0.06, 0.18],
    driftY: -0.012,
  },
  "retro-newspaper": {
    kind: "dust",
    colors: [
      [91, 75, 55],
      [128, 98, 62],
      [153, 126, 85],
    ],
    density: 70000,
    desktopCount: [10, 18],
    mobileCount: [6, 11],
    radius: [0.4, 1.15],
    speed: [0.009, 0.03],
    alpha: [0.05, 0.17],
    pulse: [0.04, 0.15],
  },
  "candy-pop": {
    kind: "confetti",
    colors: [
      [255, 100, 149],
      [74, 185, 226],
      [255, 186, 71],
      [135, 111, 225],
    ],
    density: 49000,
    desktopCount: [16, 28],
    mobileCount: [9, 17],
    radius: [0.7, 1.35],
    speed: [0.025, 0.07],
    alpha: [0.12, 0.34],
    pulse: [0.08, 0.22],
    driftY: 0.018,
    wobble: 0.014,
  },
} as const satisfies Record<string, ParticleThemeConfig>;

type ParticleTheme = keyof typeof PARTICLE_THEME_CONFIGS;

const FRAME_INTERVAL = 1000 / 30;

const randomBetween = (range: readonly [number, number]) => range[0] + Math.random() * (range[1] - range[0]);
const clamp = (value: number, range: readonly [number, number]) => Math.max(range[0], Math.min(value, range[1]));

const CosmicBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let particles: Particle[] = [];
    let animationFrame = 0;
    let resizeTimer = 0;
    let previousFrame = 0;
    let activeTheme: ParticleTheme | undefined;

    const createParticles = (theme: ParticleTheme) => {
      const config: ParticleThemeConfig = PARTICLE_THEME_CONFIGS[theme];
      const width = window.innerWidth;
      const height = window.innerHeight;
      const mobile = width < 640;
      const countRange = mobile ? config.mobileCount : config.desktopCount;
      const count = Math.round(clamp((width * height) / config.density, countRange));

      particles = Array.from({ length: count }, () => {
        const direction = Math.random() * Math.PI * 2;
        const speed = randomBetween(config.speed);
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          radius: randomBetween(config.radius),
          length: 3 + Math.random() * (config.kind === "rain" ? 9 : 3),
          velocityX: Math.cos(direction) * speed + (config.kind === "rain" ? -0.11 : 0),
          velocityY: Math.sin(direction) * speed + (config.driftY ?? 0),
          alpha: randomBetween(config.alpha),
          phase: Math.random() * Math.PI * 2,
          pulseSpeed: 0.012 + Math.random() * 0.035,
          pulseAmount: randomBetween(config.pulse),
          wobblePhase: Math.random() * Math.PI * 2,
          wobbleSpeed: config.wobble ? 0.008 + Math.random() * 0.018 : 0,
          wobbleAmount: config.wobble ? Math.random() * config.wobble : 0,
          rotation: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 0.012,
          color: config.colors[Math.floor(Math.random() * config.colors.length)],
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

    const drawParticle = (particle: Particle, config: ParticleThemeConfig, alpha: number, radius: number) => {
      const [red, green, blue] = particle.color;
      const color = `rgba(${red}, ${green}, ${blue}, ${alpha})`;

      if (config.kind === "bubble") {
        context.beginPath();
        context.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
        context.strokeStyle = color;
        context.lineWidth = Math.max(0.5, radius * 0.35);
        context.stroke();
        return;
      }

      if (config.kind === "rain") {
        context.beginPath();
        context.moveTo(particle.x, particle.y);
        context.lineTo(particle.x - particle.length * 0.28, particle.y + particle.length);
        context.strokeStyle = color;
        context.lineWidth = radius;
        context.stroke();
        return;
      }

      if (config.kind === "dash" || config.kind === "confetti") {
        context.save();
        context.translate(particle.x, particle.y);
        context.rotate(particle.rotation);
        context.fillStyle = color;
        context.fillRect(-particle.length / 2, -radius / 2, particle.length, radius);
        context.restore();
        return;
      }

      if (config.kind === "petal") {
        context.save();
        context.translate(particle.x, particle.y);
        context.rotate(particle.rotation);
        context.beginPath();
        context.ellipse(0, 0, radius * 1.65, radius * 0.72, 0, 0, Math.PI * 2);
        context.fillStyle = color;
        context.fill();
        context.restore();
        return;
      }

      if (config.kind === "firefly" && alpha > 0.2) {
        context.beginPath();
        context.arc(particle.x, particle.y, radius * 4.6, 0, Math.PI * 2);
        context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha * 0.12})`;
        context.fill();
      } else if (config.kind === "star" && particle.radius > 1.15 && alpha > 0.4) {
        context.beginPath();
        context.arc(particle.x, particle.y, radius * 2.8, 0, Math.PI * 2);
        context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha * 0.08})`;
        context.fill();
      }

      context.beginPath();
      context.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
    };

    const draw = (timestamp: number) => {
      if (!activeTheme || reducedMotion.matches) return;
      animationFrame = requestAnimationFrame(draw);
      if (timestamp - previousFrame < FRAME_INTERVAL) return;

      const frameScale = previousFrame === 0 ? 1 : Math.min(timestamp - previousFrame, 66) / FRAME_INTERVAL;
      previousFrame = timestamp;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const config = PARTICLE_THEME_CONFIGS[activeTheme];
      context.clearRect(0, 0, width, height);

      for (const particle of particles) {
        particle.wobblePhase += particle.wobbleSpeed * frameScale;
        particle.rotation += particle.spin * frameScale;
        particle.x += (particle.velocityX + Math.sin(particle.wobblePhase) * particle.wobbleAmount) * frameScale;
        particle.y += (particle.velocityY + Math.cos(particle.wobblePhase * 0.83) * particle.wobbleAmount) * frameScale;
        particle.phase += particle.pulseSpeed * frameScale;

        const margin = Math.max(4, particle.length);
        if (particle.x < -margin) particle.x = width + margin;
        if (particle.x > width + margin) particle.x = -margin;
        if (particle.y < -margin) particle.y = height + margin;
        if (particle.y > height + margin) particle.y = -margin;

        const pulse = Math.sin(particle.phase) * 0.72 + Math.sin(particle.phase * 0.47 + 1.7) * 0.28;
        const alpha = Math.max(0.035, Math.min(particle.alpha * (1 + pulse * particle.pulseAmount), 0.82));
        const radius = Math.max(0.3, particle.radius * (1 + pulse * 0.12));
        drawParticle(particle, config, alpha, radius);
      }
    };

    const restartAnimation = () => {
      cancelAnimationFrame(animationFrame);
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      canvas.hidden = !activeTheme || reducedMotion.matches;
      if (!activeTheme || reducedMotion.matches) return;

      previousFrame = 0;
      resizeCanvas(activeTheme);
      animationFrame = requestAnimationFrame(draw);
    };

    const syncTheme = () => {
      const theme = document.documentElement.dataset.theme;
      const nextTheme = theme && theme in PARTICLE_THEME_CONFIGS ? (theme as ParticleTheme) : undefined;
      if (nextTheme === activeTheme) return;
      activeTheme = nextTheme;
      restartAnimation();
    };

    const handleResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (activeTheme && !reducedMotion.matches) {
          previousFrame = 0;
          resizeCanvas(activeTheme);
        }
      }, 180);
    };

    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("resize", handleResize);
    reducedMotion.addEventListener("change", restartAnimation);
    syncTheme();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
      reducedMotion.removeEventListener("change", restartAnimation);
      window.clearTimeout(resizeTimer);
      cancelAnimationFrame(animationFrame);
    };
  }, []);

  return <canvas ref={canvasRef} hidden aria-hidden="true" className="pointer-events-none fixed inset-0 size-full" style={{ zIndex: 0 }} />;
};

export default CosmicBackground;
