import type { InstrumentScene } from '../../types/scene';
import { MiniOrb } from '../shared/MiniOrb';

interface LiveSceneCardProps {
  scene: InstrumentScene;
  isActive: boolean;
  isQueued: boolean;
  countdown: number;
  barsElapsed: number;
  onLaunch: () => void;
  onStop: () => void;
  /** Stack mode — multiple scenes can be active simultaneously */
  isStack?: boolean;
  /** In stack mode: this active scene is queued to stop */
  willStop?: boolean;
}

export function LiveSceneCard({
  scene,
  isActive,
  isQueued,
  countdown,
  barsElapsed,
  onLaunch,
  onStop,
  isStack = false,
  willStop = false,
}: LiveSceneCardProps) {
  const borderColor = isActive
    ? scene.color
    : isQueued
      ? scene.color
      : `${scene.color}40`;

  // In stack mode: clicking an active scene queues it to stop (via launchScene toggle)
  // In queue mode: clicking an active scene clears the queue
  const handleClick = () => {
    if (isStack && isActive) {
      onLaunch(); // toggles — queues to stop
    } else if (!isActive) {
      onLaunch();
    } else {
      onStop();
    }
  };

  // Determine button label and style
  let buttonLabel: string;
  let buttonQueued = false;
  if (isActive && willStop) {
    buttonLabel = '\u25A0';
    buttonQueued = true;
  } else if (isActive) {
    buttonLabel = '\u25A0';
  } else if (isQueued) {
    buttonLabel = '\u25CF';
    buttonQueued = true;
  } else {
    buttonLabel = '\u25B6';
  }

  return (
    <div
      className="flex flex-col rounded-lg overflow-hidden flex-shrink-0 transition-all"
      style={{
        width: 160,
        minHeight: 180,
        border: `2px solid ${borderColor}`,
        background: isActive
          ? `${scene.color}18`
          : `${scene.color}08`,
        boxShadow: isActive ? `0 0 12px ${scene.color}30` : 'none',
        animation: (isQueued && !isActive) || willStop
          ? 'live-queue-blink 0.6s ease-in-out infinite alternate'
          : undefined,
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-1.5 flex items-center justify-between"
        style={{ background: `${scene.color}30` }}
      >
        <span className="text-[11px] font-semibold truncate" style={{ color: scene.color }}>
          {scene.name}
        </span>
        {isActive && !willStop && (
          <span className="text-[9px] font-mono opacity-70" style={{ color: scene.color }}>
            Bar {barsElapsed + 1}
          </span>
        )}
        {willStop && (
          <span className="text-[9px] font-mono animate-pulse text-red-400">
            stop in {countdown}...
          </span>
        )}
        {isQueued && !isActive && (
          <span className="text-[9px] font-mono animate-pulse" style={{ color: scene.color }}>
            in {countdown}...
          </span>
        )}
      </div>

      {/* Mini orbs grid */}
      <div className="flex flex-wrap gap-1 p-2 flex-1 items-start content-start">
        {scene.instrumentIds.map((instId) => (
          <MiniOrb
            key={instId}
            instrumentId={instId}
            showMuteOverlay={isActive}
            size={40}
          />
        ))}
        {scene.instrumentIds.length === 0 && (
          <span className="text-[9px] text-text-secondary/40 italic">No instruments</span>
        )}
      </div>

      {/* Launch / Stop button */}
      <div className="px-2 pb-2 pt-1">
        <button
          onClick={(e) => { e.stopPropagation(); handleClick(); }}
          className="w-full py-1.5 rounded text-[11px] font-semibold tracking-wide transition-colors cursor-pointer hover:brightness-125"
          style={{
            background: isActive
              ? (willStop ? 'rgba(239, 68, 68, 0.15)' : `${scene.color}25`)
              : (buttonQueued ? `${scene.color}35` : `${scene.color}15`),
            color: isActive
              ? (willStop ? '#ef4444' : scene.color)
              : (buttonQueued ? scene.color : `${scene.color}cc`),
            border: `1px solid ${willStop ? 'rgba(239, 68, 68, 0.3)' : `${scene.color}40`}`,
          }}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
