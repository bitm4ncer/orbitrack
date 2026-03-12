import type { useStore } from '../state/store';

type State = ReturnType<typeof useStore.getState>;

// Cache for track-mode scene lookups — rebuilt only when refs change
let _cachedScenes: unknown = null;
let _cachedArrangement: unknown = null;
let _cachedTrackPos = -1;
let _activeSceneInstIds: Set<string> | null = null;
let _inAnySceneIds: Set<string> | null = null;

function getTrackSceneSets(state: State): { active: Set<string> | null; inAny: Set<string> | null } {
  if (!state.trackMode || state.arrangement.length === 0) {
    return { active: null, inAny: null };
  }

  const pos = state.trackPosition;
  if (
    state.scenes !== _cachedScenes ||
    state.arrangement !== _cachedArrangement ||
    pos !== _cachedTrackPos
  ) {
    _cachedScenes = state.scenes;
    _cachedArrangement = state.arrangement;
    _cachedTrackPos = pos;

    const idx = Math.max(0, Math.min(pos, state.arrangement.length - 1));
    const activeSceneId = state.arrangement[idx]?.sceneId;
    const activeScene = state.scenes.find((s) => s.id === activeSceneId);
    _activeSceneInstIds = activeScene ? new Set(activeScene.instrumentIds) : new Set();

    const anySet = new Set<string>();
    for (const s of state.scenes) {
      for (const id of s.instrumentIds) anySet.add(id);
    }
    _inAnySceneIds = anySet;
  }

  return { active: _activeSceneInstIds, inAny: _inAnySceneIds };
}

/**
 * Determines if an instrument is effectively muted, considering:
 * 1. Solo logic (global)
 * 2. Track mode scene override — active scene unmutes its members,
 *    non-active scene members are muted regardless of manual toggle
 * 3. Individual instrument mute (only when NOT controlled by track scenes)
 */
export function isInstrumentEffectivelyMuted(
  state: State,
  instrumentId: string,
  instMuted: boolean,
  instSolo: boolean,
): boolean {
  const anySolo = state.instruments.some((i) => i.solo);
  if (anySolo && !instSolo) return true;

  const { active, inAny } = getTrackSceneSets(state);
  if (active && inAny) {
    const inScene = inAny.has(instrumentId);
    if (inScene) {
      // In track mode, scene membership controls muting:
      // - in the active scene → NOT muted (overrides manual mute)
      // - in a scene but not active → muted
      return !active.has(instrumentId);
    }
    // Not in any scene — fall through to normal mute logic
  }

  if (instMuted && !instSolo) return true;

  return false;
}
