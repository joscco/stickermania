import type {ShapeCuttingVariantData} from "./game.js";

export const DEFAULT_SHAPE_POLYGON = [
  {x: 50, y: 50},
  {x: 50, y: 200},
  {x: 200, y: 200},
  {x: 200, y: 50},
];

export const SHAPE_CUTTING_VARIANTS: ShapeCuttingVariantData[] = [
  {
    id: "shape-cutting-gem-2",
    title: "Teile die Form in 2 gleiche Teile",
    firstRoundSeconds: 45,
    backgroundSvg: "sticker-shapes-diamond-filled",
    polygon: DEFAULT_SHAPE_POLYGON,
    targetParts: 2,
  },
  {
    id: "shape-cutting-blob-3",
    title: "Teile die Form in 3 gleiche Teile",
    firstRoundSeconds: 55,
    backgroundSvg: "sticker-shapes-wobble-filled",
    polygon: [
      {x: 70, y: 92},
      {x: 226, y: 58},
      {x: 318, y: 132},
      {x: 292, y: 312},
      {x: 204, y: 412},
      {x: 62, y: 362},
      {x: 38, y: 214},
    ],
    targetParts: 3,
  },
];
