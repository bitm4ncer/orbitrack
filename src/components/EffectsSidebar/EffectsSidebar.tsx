import { useStore } from '../../state/store';
import { EffectBlock } from './EffectBlock';
import { AddEffectMenu } from './AddEffectMenu';
import { VUMeter } from './VUMeter';

export function EffectsSidebar() {
  const selectedId = useStore((s) => s.selectedInstrumentId);
  const instruments = useStore((s) => s.instruments);
  const instrumentEffects = useStore((s) => s.instrumentEffects);
  const masterVolume = useStore((s) => s.masterVolume);
  const setMasterVolume = useStore((s) => s.setMasterVolume);

  const selectedInstrument = instruments.find((i) => i.id === selectedId);
  const effects = selectedId ? (instrumentEffects[selectedId] ?? []) : [];

  return (
    <div className="flex flex-col h-full w-[280px] bg-bg-secondary border-l border-border shrink-0 select-none">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0 min-w-0">
        {selectedInstrument && (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: selectedInstrument.color }}
          />
        )}
        <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider truncate">
          {selectedInstrument ? `${selectedInstrument.name} FX` : 'FX Chain'}
        </span>
      </div>

      {/* Effect blocks list — scroll container must NOT include the dropdown */}
      <div className="flex-1 overflow-y-auto min-h-0 py-1">
        {!selectedId ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
            <span className="text-[28px] opacity-20">≡</span>
            <span className="text-[10px] text-text-secondary/60">
              Select a layer to see<br />its effect chain.
            </span>
          </div>
        ) : effects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
            <span className="text-[28px] opacity-20">≡</span>
            <span className="text-[10px] text-text-secondary/60">No effects yet.</span>
          </div>
        ) : (
          effects.map((effect) => (
            <EffectBlock key={effect.id} effect={effect} instrumentId={selectedId} />
          ))
        )}
      </div>

      {/* Add Effect button — outside scroll container so dropdown is not clipped */}
      {selectedId && (
        <div className="px-3 py-2 border-t border-border/30">
          <AddEffectMenu instrumentId={selectedId} />
        </div>
      )}

      {/* Master section */}
      <div className="border-t border-border shrink-0 mx-3 my-3 rounded" style={{ border: '1px solid #94a3b8', padding: 14 }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] text-text-primary flex-1">Master</span>
          <VUMeter />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-text-secondary w-6">vol</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={masterVolume}
            onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
            className="inst-slider flex-1 h-1"
            style={{ '--slider-color': '#94a3b8' } as React.CSSProperties}
          />
          <span className="text-[9px] text-text-secondary w-8 text-right font-mono shrink-0">
            {Math.round(masterVolume * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}
