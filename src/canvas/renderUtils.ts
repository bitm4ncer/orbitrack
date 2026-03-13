import type { useStore } from '../state/store';

type State = ReturnType<typeof useStore.getState>;

// Cache for track/live mode scene lookups — rebuilt only when refs change
let _cachedScenes: unknown = null;
let _cachedArrangement: unknown = null;
let _cachedTrackPos = -1;
let _cachedLiveRef: unknown = null;
let _activeSceneInstIds: Set<string> | null = null;
let _inAnySceneIds: Set<string> | null = null;

function getSceneSets(state: State): { active: Set<string> | null; inAny: Set<string> | null } {
  let activeSceneId: string | undefined;
  let activeSceneIds: string[] | undefined;

  if (state.trackMode && state.arrangement.length > 0) {
    const pos = state.trackPosition;
    const idx = Math.max(0, Math.min(pos, state.arrangement.length - 1));
    activeSceneId = state.arrangement[idx]?.sceneId;

    if (
      state.scenes !== _cachedScenes ||
      state.arrangement !== _cachedArrangement ||
      pos !== _cachedTrackPos
    ) {
      _cachedScenes = state.scenes;
      _cachedArrangement = state.arrangement;
      _cachedTrackPos = pos;
      _cachedLiveRef = null;
      _activeSceneInstIds = null;
    }
  } else if (state.liveMode) {
    if (state.liveLaunchMode === 'stack' && state.liveActiveSceneIds.length > 0) {
      activeSceneIds = state.liveActiveSceneIds;
    } else if (state.liveActiveSceneId) {
      activeSceneId = state.liveActiveSceneId;
    } else {
      return { active: null, inAny: null };
    }

    const liveRef = activeSceneIds ?? state.liveActiveSceneId;
    if (state.scenes !== _cachedScenes || liveRef !== _cachedLiveRef) {
      _cachedScenes = state.scenes;
      _cachedLiveRef = liveRef;
      _cachedArrangement = null;
      _cachedTrackPos = -1;
      _activeSceneInstIds = null;
    }
  } else {
    return { active: null, inAny: null };
  }

  if (!_activeSceneInstIds) {
    if (activeSceneIds) {
      // Stack mode: union of all active scenes
      const unionSet = new Set<string>();
      for (const sceneId of activeSceneIds) {
        const scene = state.scenes.find((s) => s.id === sceneId);
        if (scene) for (const id of scene.instrumentIds) unionSet.add(id);
      }
      _activeSceneInstIds = unionSet;
    } else {
      const activeScene = state.scenes.find((s) => s.id === activeSceneId);
      _activeSceneInstIds = activeScene ? new Set(activeScene.instrumentIds) : new Set();
    }

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
 * 2. Track/Live mode scene override — active scene unmutes its members,
 *    non-active scene members are muted regardless of manual toggle
 * 3. Individual instrument mute (only when NOT controlled by scenes)
 */
export function isInstrumentEffectivelyMuted(
  state: State,
  instrumentId: string,
  instMuted: boolean,
  instSolo: boolean,
): boolean {
  const anySolo = state.instruments.some((i) => i.solo);
  if (anySolo && !instSolo) return true;

  const { active, inAny } = getSceneSets(state);
  if (active && inAny) {
    const inScene = inAny.has(instrumentId);
    if (inScene) {
      // Scene membership controls muting:
      // - in the active scene → NOT muted (overrides manual mute)
      // - in a scene but not active → muted
      return !active.has(instrumentId);
    }
    // Not in any scene — fall through to normal mute logic
  }

  if (instMuted && !instSolo) return true;

  return false;
}
