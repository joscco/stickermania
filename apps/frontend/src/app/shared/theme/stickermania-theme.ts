export const STICKERMANIA_COLORS = {
  ink: "#111827",
  inkHard: "#111111",
  white: "#ffffff",
  paper: "#fff8dd",
  cream: "#f8f1dc",
  board: "#f5f0df",
  yellow: "#ffcf24",
  yellowSoft: "#ffe36d",
  orange: "#ff7a18",
  orangeBright: "#f97316",
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  pink: "#ec4899",
} as const;

export const STICKERMANIA_PAINT_COLORS = [
  STICKERMANIA_COLORS.ink,
  STICKERMANIA_COLORS.white,
  STICKERMANIA_COLORS.yellow,
  STICKERMANIA_COLORS.red,
  STICKERMANIA_COLORS.blue,
  STICKERMANIA_COLORS.green,
  STICKERMANIA_COLORS.orangeBright,
  STICKERMANIA_COLORS.pink,
] as const;
