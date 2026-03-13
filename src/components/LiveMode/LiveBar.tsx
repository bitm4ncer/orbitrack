import { useStore } from '../../state/store';
import { LiveSceneCard } from './LiveSceneCard';
import { toggleTransport } from '../../audio/transport';
import { initAudio } from '../../audio/engine';
import { loadSamples } from '../../audio/sampler';

const QUANTIZE_OPTIONS = [1, 2, 4, 8] as const;

let _audioReady = false;
async function ensureAudio() {
  if (_audioReady) return;
  await initAudio();
  await loadSamples();
  _audioReady = true;
}

export function LiveBar() {
  const scenes = useStore((s) => s.scenes);
  const liveLaunchMode = useStore((s) => s.liveLaunchMode);
  const liveActiveSceneId = useStore((s) => s.liveActiveSceneId);
  const liveActiveSceneIds = useStore((s) => s.liveActiveSceneIds);
  const liveQueuedSceneId = useStore((s) => s.liveQueuedSceneId);
  const liveQueuedToggles = useStore((s) => s.liveQueuedToggles);
  const liveLaunchQuantize = useStore((s) => s.liveLaunchQuantize);
  const liveBarCountdown = useStore((s) => s.liveBarCountdown);
  const liveBarsElapsed = useStore((s) => s.liveBarsElapsed);
  const isPlaying = useStore((s) => s.isPlaying);
  const launchScene = useStore((s) => s.launchScene);
  const stopLiveScene = useStore((s) => s.stopLiveScene);
  const setLiveLaunchQuantize = useStore((s) => s.setLiveLaunchQuantize);
  const setLiveLaunchMode = useStore((s) => s.setLiveLaunchMode);

  const isStack = liveLaunchMode === 'stack';

  const handleLaunch = async (sceneId: string) => {
    await ensureAudio();
    if (!isPlaying) {
      // Set scene BEFORE starting transport so first tick filters correctly
      useStore.getState().launchScene(sceneId);
      toggleTransport();
    } else {
      launchScene(sceneId);
    }
  };

  const handleStop = () => {
    stopLiveScene();
  };

  // Status info
  const activeScenes = isStack
    ? scenes.filter((s) => liveActiveSceneIds.includes(s.id))
    : scenes.filter((s) => s.id === liveActiveSceneId);
  const queuedScene = !isStack ? scenes.find((s) => s.id === liveQueuedSceneId) : null;
  const hasAnyActive = activeScenes.length > 0;
  const hasAnyQueued = isStack ? liveQueuedToggles.length > 0 : !!liveQueuedSceneId;

  return (
    <div className="bg-bg-primary border-t border-border">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50">
        {/* Mode selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-text-secondary uppercase tracking-wide">Mode</span>
          <div className="flex rounded overflow-hidden border border-border/50">
            <button
              onClick={() => setLiveLaunchMode('queue')}
              className={`px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
                !isStack
                  ? 'bg-accent/20 text-accent'
                  : 'bg-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              QUEUE
            </button>
            <button
              onClick={() => setLiveLaunchMode('stack')}
              className={`px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
                isStack
                  ? 'bg-[#e5c07b]/20 text-[#e5c07b]'
                  : 'bg-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              STACK
            </button>
          </div>
        </div>

        <div className="w-px h-4 bg-border/30" />

        {/* Quantize */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-text-secondary uppercase tracking-wide">Quantize</span>
          <select
            value={liveLaunchQuantize}
            onChange={(e) => setLiveLaunchQuantize(Number(e.target.value) as 1 | 2 | 4 | 8)}
            className="text-[10px] bg-transparent border border-border/50 rounded px-1.5 py-0.5 text-text-primary outline-none cursor-pointer"
          >
            {QUANTIZE_OPTIONS.map((n) => (
              <option key={n} value={n} style={{ background: '#0e0e18' }}>
                {n} bar{n > 1 ? 's' : ''}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleStop}
          disabled={!hasAnyActive}
          className="px-2.5 py-1 text-[10px] font-semibold rounded border border-red-500/30 text-red-400
            hover:bg-red-500/10 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
        >
          STOP ALL
        </button>

        <div className="flex-1" />

        {/* Status display */}
        {activeScenes.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-secondary">
              {isStack ? 'Active:' : 'Playing:'}
            </span>
            {activeScenes.map((s, i) => (
              <span key={s.id}>
                {i > 0 && <span className="text-text-secondary/40 text-[10px]"> + </span>}
                <span className="text-[10px] font-semibold" style={{ color: s.color }}>
                  {s.name}
                </span>
              </span>
            ))}
            <span className="text-[10px] text-text-secondary font-mono">
              Bar {liveBarsElapsed + 1}
            </span>
          </div>
        )}

        {queuedScene && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-text-secondary">Next:</span>
            <span className="text-[10px] font-semibold animate-pulse" style={{ color: queuedScene.color }}>
              {queuedScene.name}
            </span>
            <span className="text-[10px] text-text-secondary font-mono">
              in {liveBarCountdown}
            </span>
          </div>
        )}

        {isStack && hasAnyQueued && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-text-secondary">Pending:</span>
            {liveQueuedToggles.map((id) => {
              const s = scenes.find((sc) => sc.id === id);
              if (!s) return null;
              const willStop = liveActiveSceneIds.includes(id);
              return (
                <span
                  key={id}
                  className="text-[10px] font-semibold animate-pulse"
                  style={{ color: s.color }}
                >
                  {willStop ? '−' : '+'}{s.name}
                </span>
              );
            })}
            <span className="text-[10px] text-text-secondary font-mono">
              in {liveBarCountdown}
            </span>
          </div>
        )}

        {!hasAnyActive && !hasAnyQueued && (
          <span className="text-[10px] text-text-secondary/50 italic">
            {scenes.length === 0 ? 'Create scenes to use Live Mode' : 'Click a scene to start'}
          </span>
        )}
      </div>

      {/* Scene cards */}
      <div className="flex gap-3 p-3 overflow-x-auto" style={{ minHeight: 200 }}>
        {scenes.map((scene) => (
          <LiveSceneCard
            key={scene.id}
            scene={scene}
            isActive={isStack
              ? liveActiveSceneIds.includes(scene.id)
              : scene.id === liveActiveSceneId}
            isQueued={isStack
              ? liveQueuedToggles.includes(scene.id)
              : scene.id === liveQueuedSceneId}
            countdown={isStack
              ? (liveQueuedToggles.includes(scene.id) ? liveBarCountdown : 0)
              : (scene.id === liveQueuedSceneId ? liveBarCountdown : 0)}
            barsElapsed={isStack
              ? (liveActiveSceneIds.includes(scene.id) ? liveBarsElapsed : 0)
              : (scene.id === liveActiveSceneId ? liveBarsElapsed : 0)}
            onLaunch={() => handleLaunch(scene.id)}
            onStop={handleStop}
            isStack={isStack}
            willStop={isStack && liveActiveSceneIds.includes(scene.id) && liveQueuedToggles.includes(scene.id)}
          />
        ))}

        {scenes.length === 0 && (
          <div className="flex items-center justify-center flex-1 text-text-secondary/30 text-sm">
            No scenes — select instruments and press Ctrl+G to create a scene
          </div>
        )}
      </div>

      {/* CSS animation for queued blink */}
      <style>{`
        @keyframes live-queue-blink {
          from { opacity: 0.6; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
