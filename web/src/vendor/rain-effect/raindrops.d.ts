export interface RainDrop {
  x: number;
  y: number;
  r: number;
  momentum?: number;
}

export interface RainOptions {
  minR: number;
  maxR: number;
  maxDrops: number;
  rainChance: number;
  rainLimit: number;
  dropletsRate: number;
  dropletsSize: [number, number];
  maxDroplets: number;
  /** Milliseconds at full visibility before fading out. */
  dropletsLifetime: number;
  dropletsFadeDuration: number;
  raining: boolean;
  trailRate: number;
  trailScaleRange: [number, number];
  collisionRadius: number;
  dropletsCleaningRadiusMultiplier: number;
}

export default class Raindrops {
  constructor(
    width: number,
    height: number,
    scale: number,
    alpha: HTMLImageElement,
    color: HTMLImageElement,
    options?: Partial<RainOptions>,
  );
  canvas: HTMLCanvasElement;
  droplets: HTMLCanvasElement;
  dropletsCtx: CanvasRenderingContext2D;
  options: RainOptions;
  lastRender: number | null;
  timedDroplets: { drop: RainDrop; born: number }[];
  update(): void;
  updateDroplets(timeScale: number): void;
  clearDroplets(x: number, y: number, radius?: number): void;
  drawDroplet(x: number, y: number, radius: number, age?: number): void;
  drawDrop(context: CanvasRenderingContext2D, drop: RainDrop, alpha?: number): void;
  createDrop(drop: RainDrop): RainDrop | null;
  addDrop(drop: RainDrop | null): boolean;
}
