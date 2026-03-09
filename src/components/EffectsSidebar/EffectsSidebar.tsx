import { useStore } from '../../state/store';
import { EffectBlock } from './EffectBlock';
import { AddEffectMenu } from './AddEffectMenu';
import { VUMeter } from './VUMeter';
import { PortDot } from '../CableEditor/PortDot';
import { MASTER_IN_PORT_ID } from '../CableEditor/PortContext';

export function EffectsSidebar() {
  const effects = useStore((s) => s.effects);
  const masterVolume = useStore((s) => s.masterVolume);
  const setMasterVolume = useStore((s) => s.setMasterVolume);

  return (
    <div className="flex flex-col h-full w-[280px] bg-bg-secondary border-l border-border shrink-0 select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
          FX Chain
        </span>
        <AddEffectMenu />
      </div>

      {/* Effect blocks list */}
      <div className="flex-1 overflow-y-auto min-h-0 py-1">
        {effects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
            <span className="text-[28px] opacity-20">≡</span>
            <span className="text-[10px] text-text-secondary/60">
              No effects yet.
              <br />
              Click <strong>+</strong> to add one.
            </span>
          </div>
        ) : (
          effects.map((effect) => (
            <EffectBlock key={effect.id} effect={effect} />
          ))
        )}
      </div>

      {/* Master section */}
      <div className="border-t border-border shrink-0 px-3 py-2">
        <div className="relative flex items-center gap-2">
          {/* Master In port */}
          <div className="absolute -left-5 top-1/2 -translate-y-1/2">
            <PortDot portId={MASTER_IN_PORT_ID} label="Master In" />
          </div>

          <span className="text-[9px] font-semibold text-text-secondary uppercase tracking-wider w-10 shrink-0">
            Master
          </span>

          {/* Volume slider */}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={masterVolume}
            onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
            className="flex-1 h-0.5 accent-accent cursor-pointer"
          />

          <span className="text-[9px] text-text-secondary w-8 text-right font-mono shrink-0">
            {Math.round(masterVolume * 100)}%
          </span>

          {/* VU Meter */}
          <VUMeter />
        </div>
      </div>
    </div>
  );
}
