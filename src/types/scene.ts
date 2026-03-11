export interface InstrumentScene {
  id: string;
  name: string;
  color: string;                 // from SCENE_COLORS palette
  instrumentIds: string[];       // ordered member instrument IDs
  muted: boolean;
  solo: boolean;
  volume: number;                // dB, scene bus gain
  collapsed: boolean;            // layers panel collapse state
  // Future arrangement view fields:
  barLength?: number;
  outputs?: { id: string; bars: number }[];
  inputSceneId?: string | null;
}

// Dedicated scene color palette (distinct from instrument PASTEL_COLORS)
export const SCENE_COLORS = [
  '#FF6B6B', // red
  '#4ECDC4', // teal
  '#FFE66D', // yellow
  '#A8E6CF', // mint
  '#DDA0DD', // plum
  '#87CEEB', // sky blue
  '#FFA07A', // salmon
  '#98D8C8', // seafoam
];
