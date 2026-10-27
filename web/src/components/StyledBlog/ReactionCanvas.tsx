import { useEffect, useRef } from "react";
import { decorativeCanvasScale } from "@/utils/animation-budget";
import type { ParticleKind } from "@/utils/style-reactions";
import candySvg from "@/vendor/twemoji/candy.svg?raw";

/** How a style draws particles: the same petal is a pixel sprite, an asterisk, an ink stroke, a glossy bead... */
export type ParticleLook = "pixel" | "ascii" | "ink" | "gloss" | "neon" | "pastel" | "gold" | "plain";

/** Detail of a `memos:burst` window event: a one-off spray of particles, e.g. birthday confetti. */
export interface BurstDetail {
  kind: ParticleKind;
  x?: number;
  y?: number;
  count?: number;
}

export const BURST_EVENT = "memos:burst";

export const burst = (detail: BurstDetail) => window.dispatchEvent(new CustomEvent<BurstDetail>(BURST_EVENT, { detail }));

interface Props {
  /**
   * "back" holds the standing particles, drawn behind the page content so they show between and through the cards;
   * "front" holds only one-off bursts (confetti, explosions), which must be seen.
   */
  layer: "back" | "front";
  kinds: ParticleKind[];
  look: ParticleLook;
  /** Multiplies how many particles share the screen (mastery doubles it). */
  density: number;
  /** Music loudness, 0 to 1: particles speed up and swell with the beat. */
  getEnergy: () => number;
}

interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  age: number;
  life: number;
  phase: number;
  color: string;
  opacity: number;
  glyph: string;
  /** Bursts fade out instead of wrapping around. */
  oneOff: boolean;
}

/** Particles of each kind kept on screen at density 1. */
const POPULATION: Record<ParticleKind, number> = {
  petal: 22,
  bubble: 14,
  rain: 48,
  star: 40,
  comet: 1,
  ember: 22,
  leaf: 16,
  ink: 12,
  confetti: 18,
  candy: 16,
  snow: 40,
  lantern: 7,
  // Kept few and faint: bats are a seasonal accent, not the show. Each visit picks 3 to 7 (see batCount).
  bat: 3,
  code: 30,
  fish: 6,
  invader: 7,
  firefly: 18,
};

const BASE_COLORS: Record<ParticleKind, string[]> = {
  petal: ["#f7a8c4", "#fbc6d7", "#f28cb1"],
  bubble: ["#ffffff"],
  rain: ["#9fd4ff", "#c4e4ff"],
  star: ["#fff6c8", "#ffffff"],
  comet: ["#ffffff"],
  ember: ["#ffb054", "#ff7b3a", "#ffd27a"],
  leaf: ["#7cc46a", "#a5d86a", "#5aa860"],
  ink: ["#1d1d1b"],
  confetti: ["#ff6b9a", "#ffd23f", "#4fd1ff", "#8a5cff", "#5be08c"],
  candy: ["#ff6b9a", "#ffd23f", "#4fd1ff", "#8a5cff", "#5be08c"],
  snow: ["#ffffff", "#eef6ff"],
  lantern: ["#ff5a3c", "#ff7a3c"],
  bat: ["#2a2233"],
  code: ["#3cff8a", "#9dffc2"],
  fish: ["#ffb347", "#5ad1ff", "#ff7a9a"],
  invader: ["#7cff6b", "#ff6bd5", "#6bd8ff"],
  firefly: ["#e6ff7a", "#fff3a0"],
};

const LOOK_COLORS: Partial<Record<ParticleLook, string[]>> = {
  neon: ["#ff4fd8", "#2fc8ff", "#ffe66b", "#8a5cff"],
  pastel: ["#f7b0d8", "#b9a2f5", "#7fd0f5", "#ffffff"],
  gold: ["#ffd76a", "#f5b942", "#fff1b8"],
};

const ASCII: Record<ParticleKind, string> = {
  petal: "*",
  bubble: "o",
  rain: "|",
  star: ".",
  comet: "-",
  ember: "^",
  leaf: "~",
  ink: "•",
  confetti: "+",
  candy: "+",
  snow: "*",
  lantern: "(=)",
  bat: "v",
  code: "0",
  fish: "><>",
  invader: "Ψ",
  firefly: "·",
};

const CODE_GLYPHS = "アイウエオカキクケコサシスセソ0123456789";

/** Pixel sprites, one string per row; "X" is a lit pixel. */
const SPRITES: Partial<Record<ParticleKind, string[]>> = {
  petal: [".XX.", "XXXX", ".XX.", "..X."],
  bubble: [".XX.", "X..X", "X..X", ".XX."],
  rain: ["X", "X", "X"],
  star: [".X.", "XXX", ".X."],
  comet: ["XXX...", "..XXX.", "....XX"],
  ember: ["XX", "XX"],
  leaf: ["..XX", ".XXX", "XXX.", "X..."],
  ink: [".X.", "XXX", ".X."],
  confetti: ["XX"],
  candy: ["XX"],
  snow: ["X.X", ".X.", "X.X"],
  lantern: [".XXX.", "XXXXX", "XXXXX", "XXXXX", ".XXX.", "..X.."],
  bat: ["X.....X", "XX.X.XX", "XXXXXXX", ".X...X."],
  fish: ["..XX..X", ".XXXXXX", "XXXX.XX", ".XXXXXX", "..XX..X"],
  invader: ["..X.....X..", "...X...X...", "..XXXXXXX..", ".XX.XXX.XX.", "XXXXXXXXXXX", "X.XXXXXXX.X", "X.X.....X.X", "...XX.XX..."],
  firefly: ["X"],
};

const pick = <T,>(values: T[]) => values[Math.floor(Math.random() * values.length)];
const random = (min: number, max: number) => min + Math.random() * (max - min);

const isDarkTheme = () => document.documentElement.dataset.theme?.endsWith("-dark") ?? false;

/** Dark-ink kinds drawn light on a dark theme, so they stay visible. */
const DARK_THEME_COLORS: Partial<Record<ParticleKind, string>> = {
  bat: "#cfc6e6",
  ink: "#e9e4d8",
};

const colorFor = (kind: ParticleKind, look: ParticleLook) => {
  const darkColor = isDarkTheme() ? DARK_THEME_COLORS[kind] : undefined;
  if (darkColor) return darkColor;
  const lookColors = LOOK_COLORS[look];
  if (lookColors && kind !== "code" && kind !== "ink") return pick(lookColors);
  return pick(BASE_COLORS[kind]);
};

/** A new particle of `kind`; `scatter` spreads it over the whole screen (first fill) instead of its entry edge. */
const spawn = (kind: ParticleKind, look: ParticleLook, width: number, height: number, scatter: boolean): Particle => {
  const particle: Particle = {
    kind,
    x: random(0, width),
    y: scatter ? random(0, height) : -20,
    vx: 0,
    vy: 0,
    size: random(4, 8),
    rotation: random(0, Math.PI * 2),
    spin: random(-0.02, 0.02),
    age: 0,
    life: Number.POSITIVE_INFINITY,
    phase: random(0, Math.PI * 2),
    color: colorFor(kind, look),
    opacity: 1,
    glyph: kind === "code" ? pick([...CODE_GLYPHS]) : ASCII[kind],
    oneOff: false,
  };
  switch (kind) {
    case "petal":
    case "leaf":
      particle.vx = random(-0.3, 0.4);
      particle.vy = random(0.4, 0.9);
      break;
    case "snow":
      particle.vy = random(0.3, 0.8);
      particle.size = random(2, 5);
      break;
    case "rain":
      particle.vx = -0.8;
      particle.vy = random(7, 11);
      particle.size = random(8, 14);
      break;
    case "confetti":
    case "candy":
    case "ink":
      particle.vy = random(0.6, 1.2);
      if (kind === "candy" && look !== "pixel" && look !== "ascii") {
        particle.size = random(6, 9);
        particle.opacity = random(0.6, 0.85);
      }
      break;
    case "bubble":
    case "ember":
    case "lantern":
      particle.y = scatter ? random(0, height) : height + 20;
      particle.vy = kind === "lantern" ? random(-0.35, -0.2) : random(-0.9, -0.4);
      particle.size = kind === "lantern" ? random(9, 13) : kind === "ember" ? random(2, 4) : random(5, 12);
      break;
    case "star":
      particle.y = random(0, height * 0.75);
      particle.size = random(1.5, 3.5);
      break;
    case "firefly":
      particle.y = random(height * 0.3, height);
      particle.vx = random(-0.3, 0.3);
      particle.vy = random(-0.3, 0.3);
      particle.size = random(2, 3.5);
      break;
    case "comet":
      particle.x = random(width * 0.3, width);
      particle.y = random(0, height * 0.3);
      particle.vx = -random(6, 9);
      particle.vy = random(2, 3.5);
      particle.size = random(40, 70);
      particle.life = 140;
      if (look !== "pixel" && look !== "ascii") {
        const angle = random(Math.PI / 6, Math.PI / 4);
        const speed = random(9, 13);
        particle.vx = -Math.cos(angle) * speed;
        particle.vy = Math.sin(angle) * speed;
        particle.size = random(110, 170);
      }
      break;
    case "bat":
    case "fish":
    case "invader": {
      const fromLeft = Math.random() < 0.5;
      particle.x = scatter ? random(0, width) : fromLeft ? -40 : width + 40;
      particle.y = random(height * 0.1, height * 0.9);
      particle.vx = (fromLeft ? 1 : -1) * (kind === "invader" ? random(0.6, 1.3) : random(0.4, 0.9));
      particle.size = kind === "invader" ? 3 : kind === "bat" ? random(7, 10) : random(12, 18);
      if ((kind === "fish" && look === "gloss") || (kind === "bat" && look !== "pixel" && look !== "ascii")) {
        particle.rotation = 0;
        particle.spin = 0;
        if (kind === "fish") particle.size = random(18, 24);
      }
      break;
    }
    case "code":
      particle.vy = random(2, 4.5);
      particle.size = random(12, 16);
      break;
  }
  return particle;
};

const isOffscreen = (particle: Particle, width: number, height: number) =>
  particle.y > height + 60 || particle.y < -80 || particle.x < -120 || particle.x > width + 120;

const drawSprite = (context: CanvasRenderingContext2D, sprite: string[], unit: number) => {
  const offsetX = (sprite[0].length * unit) / 2;
  const offsetY = (sprite.length * unit) / 2;
  sprite.forEach((row, rowIndex) => {
    for (let column = 0; column < row.length; column++) {
      if (row[column] === "X") context.fillRect(column * unit - offsetX, rowIndex * unit - offsetY, unit, unit);
    }
  });
};

/** Vector outlines shared by the ink, gloss, neon, pastel, gold and plain looks. */
const tracePath = (context: CanvasRenderingContext2D, particle: Particle) => {
  const { kind, size } = particle;
  context.beginPath();
  switch (kind) {
    case "petal":
      context.moveTo(0, size * 0.85);
      context.bezierCurveTo(-size * 0.95, size * 0.35, -size * 0.9, -size * 0.7, 0, -size);
      context.bezierCurveTo(size * 0.55, -size * 0.55, size * 0.85, size * 0.25, 0, size * 0.85);
      context.closePath();
      break;
    case "leaf":
      context.moveTo(-size * 1.15, size * 0.15);
      context.bezierCurveTo(-size * 0.5, -size * 0.85, size * 0.65, -size * 0.65, size * 1.15, 0);
      context.bezierCurveTo(size * 0.35, size * 0.75, -size * 0.55, size * 0.65, -size * 1.15, size * 0.15);
      context.closePath();
      context.moveTo(-size, size * 0.13);
      context.quadraticCurveTo(0, 0, size * 1.05, 0);
      break;
    case "rain":
      context.moveTo(0, 0);
      context.lineTo(-size * 0.12, size);
      break;
    case "comet":
      context.moveTo(0, 0);
      context.lineTo(size, -size * 0.35);
      break;
    case "snow":
      for (let arm = 0; arm < 3; arm++) {
        const angle = (arm * Math.PI) / 3;
        context.moveTo(Math.cos(angle) * size, Math.sin(angle) * size);
        context.lineTo(-Math.cos(angle) * size, -Math.sin(angle) * size);
      }
      break;
    case "star":
      for (let point = 0; point < 8; point++) {
        const radius = point % 2 === 0 ? size * 2 : size * 0.6;
        const angle = (point * Math.PI) / 4;
        context.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
      context.closePath();
      break;
    case "confetti":
      context.rect(-size * 0.6, -size * 0.25, size * 1.2, size * 0.5);
      break;
    case "lantern":
      context.ellipse(0, 0, size * 0.8, size, 0, 0, Math.PI * 2);
      context.moveTo(0, size);
      context.lineTo(0, size * 1.6);
      break;
    case "bat": {
      const flap = Math.sin(particle.age * 0.22 + particle.phase) * 0.65;
      for (const side of [-1, 1]) {
        context.save();
        context.translate(side * size * 0.16, -size * 0.1);
        context.rotate(side * flap);
        context.scale(side, 1);
        // The whole membrane, including the scalloped lower edge, rotates about its shoulder.
        context.moveTo(0, 0);
        context.bezierCurveTo(size * 0.55, -size * 0.7, size * 1.3, -size * 0.8, size * 1.7, -size * 0.28);
        context.quadraticCurveTo(size * 1.35, size * 0.12, size * 1.08, size * 0.5);
        context.quadraticCurveTo(size * 0.78, size * 0.2, size * 0.5, size * 0.55);
        context.quadraticCurveTo(size * 0.23, size * 0.3, 0, size * 0.32);
        context.closePath();
        context.restore();
      }
      context.moveTo(-size * 0.28, size * 0.2);
      context.lineTo(-size * 0.22, -size * 0.56);
      context.lineTo(0, -size * 0.32);
      context.lineTo(size * 0.22, -size * 0.56);
      context.lineTo(size * 0.28, size * 0.2);
      context.quadraticCurveTo(0, size * 0.72, -size * 0.28, size * 0.2);
      context.closePath();
      break;
    }
    case "fish": {
      const direction = particle.vx >= 0 ? 1 : -1;
      context.ellipse(0, 0, size, size * 0.5, 0, 0, Math.PI * 2);
      context.moveTo(-direction * size * 0.9, 0);
      context.lineTo(-direction * size * 1.6, -size * 0.45);
      context.lineTo(-direction * size * 1.6, size * 0.45);
      context.closePath();
      break;
    }
    default:
      context.arc(0, 0, Math.max(1, size), 0, Math.PI * 2);
  }
};

const drawGlossFish = (context: CanvasRenderingContext2D, particle: Particle) => {
  const { size, age, phase } = particle;
  const direction = particle.vx >= 0 ? 1 : -1;
  const stroke = "rgba(23,77,103,0.38)";
  const beat = Math.sin(age * 0.15 + phase);
  context.scale(direction * size, size);
  context.rotate(beat * 0.025);
  context.lineWidth = 0.035;
  context.lineJoin = "round";
  context.strokeStyle = stroke;

  // Like the articulated aquarium references: the tail pivots at its joint, independently of the body.
  context.save();
  context.translate(-0.8, 0);
  context.rotate(beat * 0.32);
  context.scale(0.86 + Math.cos(age * 0.15 + phase) * 0.14, 1);
  const fin = context.createLinearGradient(-0.9, -0.7, 0, 0.5);
  fin.addColorStop(0, "rgba(246,252,255,0.78)");
  fin.addColorStop(0.45, particle.color);
  fin.addColorStop(1, "rgba(255,255,255,0.3)");
  context.fillStyle = fin;
  context.beginPath();
  context.moveTo(0.1, 0);
  context.bezierCurveTo(-0.25, -0.12, -0.64, -0.72, -0.97, -0.64);
  context.bezierCurveTo(-0.82, -0.4, -0.86, -0.15, -0.65, 0);
  context.bezierCurveTo(-0.86, 0.15, -0.82, 0.4, -0.97, 0.64);
  context.bezierCurveTo(-0.64, 0.72, -0.25, 0.12, 0.1, 0);
  context.fill();
  context.stroke();
  context.strokeStyle = "rgba(255,255,255,0.45)";
  context.lineWidth = 0.025;
  for (const spread of [-0.43, -0.22, 0.22, 0.43]) {
    context.beginPath();
    context.moveTo(0, 0);
    context.quadraticCurveTo(-0.4, spread * 0.4, -0.84, spread);
    context.stroke();
  }
  context.restore();

  context.fillStyle = fin;
  context.strokeStyle = stroke;
  context.beginPath();
  context.moveTo(-0.56, -0.29);
  context.bezierCurveTo(-0.5, -0.85, -0.04, -1, 0.38, -0.42);
  context.closePath();
  context.fill();
  context.stroke();
  context.beginPath();
  context.moveTo(-0.35, 0.3);
  context.quadraticCurveTo(-0.3, 0.85, 0.2, 0.43);
  context.fill();

  const body = context.createLinearGradient(0, -0.6, 0.1, 0.65);
  body.addColorStop(0, "#f6fbff");
  body.addColorStop(0.24, particle.color);
  body.addColorStop(0.62, particle.color);
  body.addColorStop(1, "#fff2d9");
  context.fillStyle = body;
  context.beginPath();
  context.moveTo(-0.85, 0);
  context.bezierCurveTo(-0.4, -0.04, -0.6, -0.6, 0.08, -0.56);
  context.bezierCurveTo(0.63, -0.56, 0.7, -0.18, 0.96, -0.03);
  context.quadraticCurveTo(1.06, 0.04, 0.94, 0.12);
  context.bezierCurveTo(0.59, 0.62, -0.04, 0.67, -0.48, 0.27);
  context.quadraticCurveTo(-0.65, 0.04, -0.85, 0);
  context.fill();
  context.stroke();

  // Gill and translucent pectoral fin stay legible at the small background size.
  context.strokeStyle = "rgba(91,77,58,0.28)";
  context.beginPath();
  context.moveTo(0.45, -0.28);
  context.quadraticCurveTo(0.26, -0.02, 0.47, 0.28);
  context.stroke();
  context.save();
  context.translate(0.21, 0.1);
  context.rotate(-0.2 + Math.sin(age * 0.2 + phase) * 0.25);
  context.fillStyle = fin;
  context.beginPath();
  context.moveTo(0, 0);
  context.bezierCurveTo(-0.15, 0.02, -0.38, 0.14, -0.36, 0.42);
  context.quadraticCurveTo(-0.03, 0.35, 0, 0);
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();
  context.fillStyle = "rgba(255,255,255,0.54)";
  context.beginPath();
  context.ellipse(-0.08, -0.32, 0.36, 0.085, -0.12, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#fff8ec";
  context.beginPath();
  context.arc(0.66, -0.14, 0.125, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#17243a";
  context.beginPath();
  context.arc(0.69, -0.14, 0.078, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(0.71, -0.17, 0.024, 0, Math.PI * 2);
  context.fill();
};

const drawBotanicalParticle = (context: CanvasRenderingContext2D, particle: Particle) => {
  tracePath(context, particle);
  context.fillStyle = particle.color;
  context.fill();
  if (particle.kind === "leaf") {
    const { size } = particle;
    context.strokeStyle = "rgba(42,86,45,0.42)";
    context.lineWidth = 0.8;
    context.beginPath();
    context.moveTo(-size, size * 0.13);
    context.quadraticCurveTo(0, 0, size * 1.05, 0);
    for (const [position, spread] of [
      [-0.62, 0.24],
      [-0.22, 0.38],
      [0.2, 0.34],
      [0.56, 0.19],
    ]) {
      const y = size * (0.06 - position * 0.05);
      for (const side of [-1, 1]) {
        context.moveTo(size * position, y);
        context.quadraticCurveTo(
          size * (position + 0.1),
          y + side * size * spread * 0.6,
          size * (position + 0.26),
          y + side * size * spread,
        );
      }
    }
    context.stroke();
  }
};

/** A crisp, hollow circle with a narrow glow outside its rim; aero keeps its glass treatment. */
const drawGlowingRing = (context: CanvasRenderingContext2D, particle: Particle, dark: boolean) => {
  const radius = particle.size;
  const lineWidth = 1;
  const glowStart = radius + lineWidth / 2;
  const outer = glowStart + Math.max(1.5, Math.min(3, radius * 0.25));
  const color = dark ? "240,236,226" : "28,27,24";
  const opacity = 0.12 + (particle.phase / (Math.PI * 2)) * 0.23;
  const glow = context.createRadialGradient(0, 0, glowStart, 0, 0, outer);
  glow.addColorStop(0, `rgba(${color},${opacity * 0.4})`);
  glow.addColorStop(0.45, `rgba(${color},${opacity * 0.12})`);
  glow.addColorStop(1, `rgba(${color},0)`);
  context.fillStyle = glow;
  context.beginPath();
  context.arc(0, 0, outer, 0, Math.PI * 2);
  context.moveTo(glowStart, 0);
  context.arc(0, 0, glowStart, 0, Math.PI * 2, true);
  context.fill("evenodd");
  context.strokeStyle = `rgba(${color},${opacity})`;
  context.lineWidth = lineWidth;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.stroke();
};

const CANDY_PALETTES = [
  ["#ee7593", "#c84f73"],
  ["#f1b44c", "#cf8c31"],
  ["#6fc99f", "#419c7a"],
  ["#77b9ec", "#4b8fc2"],
  ["#aa91e3", "#8267ba"],
];
const candySprites: (HTMLCanvasElement | undefined)[] = [];
let candyLoading = false;

const drawWrappedCandy = (context: CanvasRenderingContext2D, particle: Particle) => {
  if (!candyLoading) {
    candyLoading = true;
    CANDY_PALETTES.forEach(([body, fold], index) => {
      const image = new Image();
      image.onload = () => {
        // Twemoji artwork (CC BY 4.0), recolored and cached once per palette, never filtered per frame.
        const sprite = document.createElement("canvas");
        sprite.width = sprite.height = 96;
        const brush = sprite.getContext("2d");
        if (!brush) return;
        brush.drawImage(image, 0, 0, 96, 96);
        candySprites[index] = sprite;
      };
      const recolored = candySvg.replaceAll("#DD2E44", body).replaceAll("#BE1931", fold);
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(recolored)}`;
    });
  }
  const sprite = candySprites[Math.floor((particle.phase / (Math.PI * 2)) * CANDY_PALETTES.length)];
  if (!sprite) return;
  const side = particle.size * 3;
  context.drawImage(sprite, -side / 2, -side / 2, side, side);
};

const drawComet = (context: CanvasRenderingContext2D, particle: Particle) => {
  const { size, vx, vy, age, life } = particle;
  const length = Math.min(size, age * Math.hypot(vx, vy) * 0.9);
  if (length < 1) return;
  // Head and tail share the velocity's coordinate frame, like the straight trails in Magic UI / Starrysky.
  context.rotate(Math.atan2(vy, vx));
  context.globalAlpha *= Math.min(1, age / 10, (life - age) / 25);
  const tail = context.createLinearGradient(-length, 0, 0, 0);
  tail.addColorStop(0, "rgba(112,162,255,0)");
  tail.addColorStop(0.55, "rgba(145,196,255,0.24)");
  tail.addColorStop(0.9, "rgba(205,232,255,0.85)");
  tail.addColorStop(1, "#ffffff");
  context.fillStyle = tail;
  context.shadowBlur = 8;
  context.shadowColor = "#8ac7ff";
  context.beginPath();
  context.moveTo(-length, 0);
  context.lineTo(-7, -1.6);
  context.quadraticCurveTo(3, -2, 3, 0);
  context.quadraticCurveTo(3, 2, -7, 1.6);
  context.closePath();
  context.fill();
  context.shadowBlur = 0;
  const halo = context.createRadialGradient(0, 0, 0, 0, 0, 9);
  halo.addColorStop(0, "rgba(255,255,255,0.95)");
  halo.addColorStop(0.2, "rgba(200,230,255,0.65)");
  halo.addColorStop(1, "rgba(112,172,255,0)");
  context.fillStyle = halo;
  context.beginPath();
  context.arc(0, 0, 9, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.ellipse(0, 0, 2.4, 1.45, 0, 0, Math.PI * 2);
  context.fill();
};

/** Particle speeds are written per frame at 60 frames a second. */
const BASE_FRAME_MS = 1000 / 60;
const MIN_FRAME_MS = 1000 / 30;

const LINE_KINDS: ParticleKind[] = ["rain", "comet", "snow"];
const SWAYING_KINDS: ParticleKind[] = ["petal", "leaf", "snow"];
const BOBBING_KINDS: ParticleKind[] = ["fish", "invader", "bat"];
/** Seasonal extras drawn faint so they stay in the background. */
const FAINT_KINDS: ParticleKind[] = ["bat"];
const TWINKLING_KINDS: ParticleKind[] = ["star", "firefly"];
const UPRIGHT_KINDS: ParticleKind[] = ["rain", "comet", "code"];

const hitsInvader = (particle: Particle, x: number, y: number) =>
  particle.kind === "invader" && !particle.oneOff && Math.abs(particle.x - x) < 20 && Math.abs(particle.y - y) < 16;

const drawParticle = (context: CanvasRenderingContext2D, particle: Particle, look: ParticleLook, dark: boolean) => {
  const { kind } = particle;
  const batPalette = LOOK_COLORS[look] ?? BASE_COLORS.bat;
  const color =
    kind === "bat" && look !== "pixel" && look !== "ascii"
      ? dark
        ? DARK_THEME_COLORS.bat!
        : batPalette[Math.floor((particle.phase / (Math.PI * 2)) * batPalette.length)]
      : particle.color;
  context.fillStyle = color;
  context.strokeStyle = color;

  // Text glyphs: the developer look, the code rain anywhere.
  if (look === "ascii" || kind === "code") {
    context.font = `${Math.round(kind === "code" ? particle.size : 14)}px ui-monospace, Consolas, monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    if (kind === "code" && Math.random() < 0.05) particle.glyph = pick([...CODE_GLYPHS]);
    context.fillText(particle.glyph, 0, 0);
    return;
  }

  const sprite = SPRITES[kind];
  if (sprite && (look === "pixel" || kind === "invader")) {
    drawSprite(context, sprite, kind === "invader" ? particle.size : 4);
    return;
  }

  if ((kind === "bubble" || kind === "ember") && look !== "gloss") {
    drawGlowingRing(context, particle, dark);
    return;
  }

  if (kind === "fish" && look === "gloss") {
    drawGlossFish(context, particle);
    return;
  }
  if (kind === "candy") {
    drawWrappedCandy(context, particle);
    return;
  }
  if (kind === "petal" || kind === "leaf") {
    drawBotanicalParticle(context, particle);
    return;
  }
  if (kind === "comet") {
    drawComet(context, particle);
    return;
  }

  tracePath(context, particle);
  const isLine = LINE_KINDS.includes(kind);
  switch (look) {
    case "ink":
      context.lineWidth = 1.4;
      context.strokeStyle = kind === "ink" ? particle.color : dark ? "rgba(240, 236, 226, 0.8)" : "rgba(28, 27, 24, 0.75)";
      if (kind === "ink") context.fill();
      context.stroke();
      break;
    case "gloss": {
      if (isLine) {
        context.lineWidth = 2;
        context.stroke();
        break;
      }
      const radius = Math.max(2, particle.size);
      const gradient = context.createRadialGradient(-radius * 0.35, -radius * 0.4, 0, 0, 0, radius * 1.4);
      gradient.addColorStop(0, "rgba(255, 255, 255, 0.95)");
      gradient.addColorStop(0.45, particle.color);
      gradient.addColorStop(1, "rgba(255, 255, 255, 0.15)");
      context.fillStyle = gradient;
      context.fill();
      context.lineWidth = 1;
      context.strokeStyle = "rgba(255, 255, 255, 0.85)";
      context.stroke();
      break;
    }
    case "neon":
    case "gold":
      context.shadowBlur = 10;
      context.shadowColor = particle.color;
      context.lineWidth = 2;
      if (isLine) context.stroke();
      else context.fill();
      break;
    case "pastel":
      context.lineWidth = isLine ? 2 : 1.5;
      if (!isLine) {
        context.fill();
        context.strokeStyle = dark ? "#e8e0ff" : "#111111";
      }
      context.stroke();
      break;
    default:
      context.lineWidth = 1.5;
      if (isLine) context.stroke();
      else context.fill();
  }
};

/**
 * Layering, set inline so it never depends on a generated utility class: the back layer sits under all page content
 * (the cards and panels cover it), the front layer above the content and the pixel boss but under the banner.
 */
const BACK_Z = -1;
const FRONT_Z = 56;

/** Clicks on these hit the page, not the space invaders drifting behind it. */
const INTERACTIVE = "a, button, input, textarea, select, [role='button'], [data-sb-card], [data-sb-widget], [data-memo-view]";

/**
 * Full-window particle layer for style reactions, festivals and bursts (pointer-events: none). Pauses while the tab is
 * hidden. When reduced motion is asked for, standing particles still appear (the reaction stays visible) but stand
 * still and redraw only when their settings or viewport change; bursts are skipped.
 */
const ReactionCanvas = ({ layer, kinds, look, density, getEnergy }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef({ kinds, look, density, getEnergy });
  const wakeRef = useRef<() => void>(() => {});

  useEffect(() => {
    settingsRef.current = { kinds, look, density, getEnergy };
    wakeRef.current();
  }, [density, getEnergy, kinds, look]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let still = motion.matches;

    let width = 0;
    let height = 0;
    let frame = 0;
    let particles: Particle[] = [];
    const seeded = new Set<ParticleKind>();
    let lastTime = 0;
    let resizeTimer = 0;
    const livingCounts = new Map<ParticleKind, number>();
    // A different flock each visit, and mastery never doubles it.
    const batCount = 3 + Math.floor(Math.random() * 5);
    let candyCount = 8 + Math.floor(Math.random() * 9);
    let nextCandyChange = 0;
    const targetFor = (kind: ParticleKind, density: number) => {
      if (kind === "bat") return batCount;
      const { look } = settingsRef.current;
      const population = kind === "candy" && look !== "pixel" && look !== "ascii" ? candyCount : POPULATION[kind];
      return Math.round(population * density);
    };

    const resize = () => {
      const ratio = decorativeCanvasScale(window.innerWidth, window.innerHeight);
      width = window.innerWidth;
      height = window.innerHeight;
      const active = settingsRef.current.kinds.length > 0 || particles.length > 0;
      canvas.width = active ? Math.round(width * ratio) : 1;
      canvas.height = active ? Math.round(height * ratio) : 1;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const tick = (time: number) => {
      frame = 0;
      if (document.hidden) return;
      // Capped at 30 frames a second, and every step scaled by the time that really passed, so particles move
      // at the same pace on a 60 Hz and a 144 Hz screen.
      if (!still && lastTime && time - lastTime < MIN_FRAME_MS - 1) {
        frame = window.requestAnimationFrame(tick);
        return;
      }
      const step = lastTime ? Math.min(3, Math.max(0.25, (time - lastTime) / BASE_FRAME_MS)) : 1;
      lastTime = time;
      const { kinds: activeKinds, look: activeLook, density: activeDensity, getEnergy: energyOf } = settingsRef.current;
      const energy = energyOf();
      const dark = isDarkTheme();
      const speed = (1 + energy * 1.6) * step;
      if (time >= nextCandyChange) {
        candyCount = 8 + Math.floor(Math.random() * 9);
        nextCandyChange = time + random(4000, 8000);
      }

      // Keep each active kind at its population; first appearance fills the screen at once.
      livingCounts.clear();
      for (const particle of particles) {
        if (!particle.oneOff) livingCounts.set(particle.kind, (livingCounts.get(particle.kind) ?? 0) + 1);
      }
      for (const kind of activeKinds) {
        // A comet is nothing but motion.
        if (still && kind === "comet") continue;
        const target = targetFor(kind, activeDensity);
        const living = livingCounts.get(kind) ?? 0;
        const scatter = !seeded.has(kind);
        const cometDue = Math.random() < 0.004 * step ? 1 : 0;
        const batchSize = kind === "comet" ? cometDue : kind === "candy" ? 1 + Math.floor(Math.random() * 3) : 2;
        const missing = scatter ? target - living : Math.min(target - living, batchSize);
        for (let index = 0; index < missing; index++) particles.push(spawn(kind, activeLook, width, height, scatter));
        seeded.add(kind);
      }
      for (const kind of seeded) if (!activeKinds.includes(kind)) seeded.delete(kind);

      context.clearRect(0, 0, width, height);
      let alive = 0;
      for (let index = 0; index < particles.length; index++) {
        const particle = particles[index];
        particle.age += still ? 1 : step;
        const stillActive = particle.oneOff || activeKinds.includes(particle.kind);
        if (!stillActive || particle.age > particle.life) continue;
        const sway = SWAYING_KINDS.includes(particle.kind) ? Math.sin(particle.age * 0.03 + particle.phase) * 0.6 : 0;
        const bob = BOBBING_KINDS.includes(particle.kind) ? Math.sin(particle.age * 0.05 + particle.phase) * 0.6 : 0;
        if (particle.kind === "firefly") {
          particle.vx += random(-0.04, 0.04) * step;
          particle.vy += random(-0.04, 0.04) * step;
          particle.vx = Math.max(-0.5, Math.min(0.5, particle.vx));
          particle.vy = Math.max(-0.5, Math.min(0.5, particle.vy));
        }
        if (particle.oneOff) particle.vy += 0.12 * step;
        if (!still) {
          particle.x += (particle.vx + sway) * speed;
          particle.y += (particle.vy + bob) * speed;
          particle.rotation += particle.spin * speed;
        }
        if (!particle.oneOff && isOffscreen(particle, width, height)) continue;

        const glow = Math.abs(Math.sin(particle.age * 0.03 + particle.phase));
        const twinkle = TWINKLING_KINDS.includes(particle.kind) && !still ? 0.45 + 0.55 * glow : 1;
        const fade = particle.oneOff ? Math.max(0, 1 - particle.age / particle.life) : 1;
        context.save();
        context.globalAlpha = Math.min(1, twinkle * fade) * particle.opacity * (FAINT_KINDS.includes(particle.kind) ? 0.55 : 1);
        context.translate(particle.x, particle.y);
        if (!UPRIGHT_KINDS.includes(particle.kind)) context.rotate(particle.rotation);
        const swell = 1 + energy * 0.5;
        if (swell !== 1) context.scale(swell, swell);
        drawParticle(context, particle, activeLook, dark);
        context.restore();
        particles[alive++] = particle;
      }
      particles.length = alive;

      // Reduced-motion particles stay visible without a timer waking an idle canvas.
      if (!still && (activeKinds.length > 0 || particles.length > 0) && !document.hidden) frame = window.requestAnimationFrame(tick);
      else if (activeKinds.length === 0 && particles.length === 0 && canvas.width > 1) resize();
    };

    const start = () => {
      if (frame || document.hidden) return;
      if (settingsRef.current.kinds.length === 0 && particles.length === 0) {
        if (canvas.width > 1) resize();
        return;
      }
      if (canvas.width <= 1) resize();
      // After a pause the clock restarts, so particles do not leap ahead.
      lastTime = 0;
      frame = window.requestAnimationFrame(tick);
    };

    const onBurst = (event: Event) => {
      if (still || layer !== "front") return;
      const { kind, x, y, count = 40 } = (event as CustomEvent<BurstDetail>).detail;
      for (let index = 0; index < count; index++) {
        const particle = spawn(kind, settingsRef.current.look, width, height, true);
        particle.x = x ?? width / 2;
        particle.y = y ?? height / 3;
        particle.vx = random(-5, 5);
        particle.vy = random(-8, -2);
        particle.spin = random(-0.2, 0.2);
        particle.life = 110;
        particle.oneOff = true;
        particles.push(particle);
      }
      start();
    };

    // Space invaders burst when clicked; the click still reaches whatever is underneath.
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(INTERACTIVE)) return;
      const hit = particles.find((particle) => hitsInvader(particle, event.clientX, event.clientY));
      if (!hit) return;
      particles = particles.filter((particle) => particle !== hit);
      burst({ kind: "confetti", x: hit.x, y: hit.y, count: 18 });
    };

    const onVisibility = () => {
      if (document.hidden) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      } else start();
    };
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (width === window.innerWidth && Math.abs(height - window.innerHeight) < 100) return;
        resize();
        start();
      }, 150);
    };
    const onMotionChange = () => {
      still = motion.matches;
      window.cancelAnimationFrame(frame);
      frame = 0;
      start();
    };

    wakeRef.current = start;
    resize();
    start();
    window.addEventListener("resize", onResize);
    motion.addEventListener("change", onMotionChange);
    window.addEventListener(BURST_EVENT, onBurst);
    window.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      wakeRef.current = () => {};
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      motion.removeEventListener("change", onMotionChange);
      window.removeEventListener(BURST_EVENT, onBurst);
      window.removeEventListener("pointerdown", onPointerDown, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={1}
      height={1}
      data-reaction-canvas={layer}
      aria-hidden
      className="pointer-events-none fixed inset-0 size-full"
      style={{ zIndex: layer === "back" ? BACK_Z : FRONT_Z }}
    />
  );
};

export default ReactionCanvas;
