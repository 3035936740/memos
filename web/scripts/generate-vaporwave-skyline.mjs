// Building-local light bounds adapted from Cyotek SkylineGenerator (MIT).
// Copyright (c) 2015 Cyotek Ltd.; docs/licenses/skyline-generator-MIT.txt.
// The layered composition, architecture and palm geometry are Memos additions.
// All geometry is generated at development time, never in the animation loop.
import { writeFileSync } from "node:fs";

let seed = 0x198508;
const random = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 0x100000000;
};
const n = (v) => Math.round(v * 10) / 10;
const rect = (x, y, w, h) => `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h-${n(w)}Z`;
const polygon = (points) => `M${points.map(([x, y]) => `${n(x)} ${n(y)}`).join("L")}Z`;
const layers = [];

function building(layer, x, baseline, width, height, kind, density) {
  const y = baseline - height;
  const side = Math.max(4, width * 0.18);
  const front = width - side;
  let crown;
  if (kind === 0) {
    // Sloping glass roof, with a narrow side face.
    crown = [
      [x, baseline],
      [x, y + 22],
      [x + front, y],
      [x + width, y + 9],
      [x + width, baseline],
    ];
  } else if (kind === 1) {
    // Art Deco setbacks, no repeated stair-step roof.
    crown = [
      [x, baseline],
      [x, y + 32],
      [x + width * 0.16, y + 32],
      [x + width * 0.16, y + 12],
      [x + width * 0.33, y + 12],
      [x + width * 0.42, y - 9],
      [x + width * 0.58, y - 9],
      [x + width * 0.67, y + 12],
      [x + width * 0.84, y + 12],
      [x + width * 0.84, y + 32],
      [x + width, y + 32],
      [x + width, baseline],
    ];
  } else if (kind === 2) {
    // Chamfered office tower and a slender aerial.
    crown = [
      [x, baseline],
      [x, y + 9],
      [x + 9, y],
      [x + width - 9, y],
      [x + width, y + 9],
      [x + width, baseline],
    ];
    layer.facades += rect(x + width * 0.58, y - 28, 1.2, 28);
  } else if (kind === 3) {
    // Tapered landmark with a needle crown.
    crown = [
      [x, baseline],
      [x + width * 0.08, y + 63],
      [x + width * 0.28, y + 44],
      [x + width * 0.42, y + 44],
      [x + width * 0.49, y - 22],
      [x + width * 0.53, y - 22],
      [x + width * 0.6, y + 44],
      [x + width * 0.74, y + 44],
      [x + width * 0.93, y + 63],
      [x + width, baseline],
    ];
  } else {
    crown = [
      [x, baseline],
      [x, y + 14],
      [x + width * 0.23, y + 14],
      [x + width * 0.23, y],
      [x + width * 0.77, y],
      [x + width * 0.77, y + 14],
      [x + width, y + 14],
      [x + width, baseline],
    ];
  }
  layer.facades += polygon(crown);
  layer.sides += polygon([
    [x + front, y + 34],
    [x + width, y + 43],
    [x + width, baseline],
    [x + front, baseline],
  ]);
  layer.edges += rect(x + 2, y + 45, 0.8, height - 45);
  // Fine horizontal light strips, with occasional paired panes and dark floors.
  // Windows start below every crown and end above the street; no masks or tiles.
  const spacing = width > 40 ? 8 : 6;
  for (let row = y + 66; row < baseline - 8; row += 7.5) {
    const floorDensity = random() < 0.16 ? density * 0.15 : density;
    for (let column = x + 5; column + 4 < x + front - 3; column += spacing) {
      if (random() > floorDensity) continue;
      const length = Math.min(3 + random() * 9, x + front - 3 - column);
      const target = random() > 0.28 ? "lights" : "coolLights";
      layer[target] += rect(column, row + random() * 0.9, length, 1 + random() * 0.7);
    }
  }
}

// Independent skylines, overlapping in depth instead of alternating in one row.
for (const [depth, baseline, minWidth, maxWidth, minHeight, maxHeight, density] of [
  [0, 733, 18, 43, 85, 255, 0.12],
  [1, 747, 28, 57, 155, 380, 0.26],
  [2, 760, 34, 74, 215, 470, 0.43],
  [3, 773, 20, 49, 45, 167, 0.48],
]) {
  const layer = { facades: "", sides: "", edges: "", lights: "", coolLights: "" };
  let x = -30 - random() * 40;
  let index = 0;
  while (x < 1640) {
    const width = minWidth + random() * (maxWidth - minWidth);
    // A loose central cluster and taller flanks leave glimpses of the setting sun.
    const height = minHeight + random() * (maxHeight - minHeight);
    building(layer, x, baseline, width, height, (index + depth * 2) % 5, density);
    x += width * (depth === 3 ? 0.92 : 1.06) + random() * 12;
    index++;
  }
  layers.push(layer);
}

// Add four atmosphere-separated rear planes AFTER generating the existing
// foreground, preserving its geometry and its random sequence exactly.
const rearLayers = [];
for (const [depth, baseline, minHeight, maxHeight, density] of [
  [0, 695, 130, 285, 0],
  [1, 710, 190, 340, 0.035],
  [2, 724, 225, 420, 0.055],
  [3, 738, 145, 350, 0.075],
]) {
  const layer = { facades: "", sides: "", edges: "", lights: "", coolLights: "" };
  let x = -54 + depth * 17;
  let index = 0;
  while (x < 1640) {
    const width = 17 + random() * 41;
    const height = minHeight + random() * (maxHeight - minHeight);
    building(layer, x, baseline, width, height, (index + depth * 3) % 5, density);
    x += width * 0.94 + random() * 10;
    index++;
  }
  rearLayers.push(layer);
}
layers.unshift(...rearLayers);

// A full feathered crown: curved ribs carry small, drooping leaflets on BOTH
// sides. The silhouette is one static path reused by all four foreground trees.
let palm = "M272 900Q336 516 301 174L309 174Q362 530 298 900Z";
const crown = { x: 304, y: 180 };
function point(control, end, t) {
  const a = 1 - t;
  return { x: a * a * crown.x + 2 * a * t * control.x + t * t * end.x, y: a * a * crown.y + 2 * a * t * control.y + t * t * end.y };
}
for (const [cx, cy, ex, ey] of [
  [143, 75, 12, 270],
  [130, 108, 5, 360],
  [187, 79, 51, 164],
  [248, 65, 169, 91],
  [315, 66, 283, 60],
  [386, 63, 426, 118],
  [466, 72, 570, 216],
  [484, 122, 600, 314],
  [415, 169, 515, 419],
  [254, 184, 178, 417],
  [347, 177, 393, 345],
]) {
  const control = { x: cx, y: cy };
  const end = { x: ex, y: ey };
  palm += `M${crown.x} ${crown.y}Q${cx} ${cy} ${ex} ${ey}Q${cx} ${cy + 11} ${crown.x - 3} ${crown.y + 7}Z`;
  for (let t = 0.13; t < 0.98; t += 0.055) {
    const p = point(control, end, t);
    const dx = 2 * (1 - t) * (cx - crown.x) + 2 * t * (ex - cx);
    const dy = 2 * (1 - t) * (cy - crown.y) + 2 * t * (ey - cy);
    const length = Math.hypot(dx, dy);
    const tx = dx / length;
    const ty = dy / length;
    const leafLength = (18 + Math.sin(t * Math.PI) * 31) * (1 - t * 0.48);
    for (const sign of [-1, 1]) {
      const lx = -ty * sign * leafLength + tx * 10;
      const ly = tx * sign * leafLength + ty * 10 + 17;
      palm += `M${n(p.x)} ${n(p.y)}Q${n(p.x + lx * 0.64 - tx * 4)} ${n(p.y + ly * 0.5)} ${n(p.x + lx)} ${n(p.y + ly)}Q${n(p.x + lx * 0.42 + tx * 4)} ${n(p.y + ly * 0.5)} ${n(p.x + tx * 4)} ${n(p.y + ty * 4)}Z`;
    }
  }
}
palm += "M298 190a9 9 0 1 0 18 0a9 9 0 1 0-18 0ZM284 196a7 7 0 1 0 14 0a7 7 0 1 0-14 0Z";

const layerSource = layers
  .map(
    (layer) =>
      `  {\n${Object.entries(layer)
        .map(([key, path]) => (path.length > 100 ? `    ${key}:\n      ${JSON.stringify(path)},` : `    ${key}: ${JSON.stringify(path)},`))
        .join("\n")}\n  },`,
  )
  .join("\n");
const output = `// Generated by web/scripts/generate-vaporwave-skyline.mjs.\n// Building-local lighting derived from Cyotek SkylineGenerator (MIT).\nexport const VAPORWAVE_LAYERS = [\n${layerSource}\n] as const;\nexport const VAPORWAVE_PALM =\n  ${JSON.stringify(palm)};\n`;
writeFileSync(new URL("../src/components/StyledBlog/vaporwave-skyline.ts", import.meta.url), output);
