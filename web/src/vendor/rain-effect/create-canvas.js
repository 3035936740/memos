// Vendored from codrops/RainEffect (Lucas Bebber). See ATTRIBUTION.md for source and integration changes.
export default function createCanvas(width, height) {
  let canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
