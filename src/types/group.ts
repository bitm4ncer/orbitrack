export interface InstrumentGroup {
  id: string;
  name: string;
  color: string;                 // from GROUP_COLORS palette
  instrumentIds: string[];       // ordered member instrument IDs
  muted: boolean;
  solo: boolean;
  volume: number;                // dB, group bus gain
  collapsed: boolean;            // layers panel collapse state
  // Future arrangement view fields:
  barLength?: number;
  outputs?: { id: string; bars: number }[];
  inputGroupId?: string | null;
}

// Dedicated group color palette (distinct from instrument PASTEL_COLORS)
export const GROUP_COLORS = [
  '#FF6B6B', // red
  '#4ECDC4', // teal
  '#FFE66D', // yellow
  '#A8E6CF', // mint
  '#DDA0DD', // plum
  '#87CEEB', // sky blue
  '#FFA07A', // salmon
  '#98D8C8', // seafoam
];
