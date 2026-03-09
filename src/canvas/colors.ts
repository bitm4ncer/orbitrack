export const PASTEL_COLORS = [
  '#FFB3BA', // pink
  '#BAE1FF', // blue
  '#BAFFC9', // green
  '#FFFFBA', // yellow
  '#E8BAFF', // purple
  '#FFD9BA', // orange
  '#BAF2FF', // cyan
  '#FFB3E6', // magenta
  '#D4FFBA', // lime
  '#BAC8FF', // indigo
] as const;

export function getInstrumentColor(index: number): string {
  return PASTEL_COLORS[index % PASTEL_COLORS.length];
}
