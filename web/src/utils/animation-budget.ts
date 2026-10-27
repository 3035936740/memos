/** Decorative layers do not need retina-sized full-screen backing stores. */
export const decorativeCanvasScale = (width: number, height: number): number => {
  const mobile = width < 768;
  const pixels = Math.max(1, width * height);
  return Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.5, Math.sqrt((mobile ? 750_000 : 2_000_000) / pixels));
};
