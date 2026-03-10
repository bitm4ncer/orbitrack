import { useRef, useState } from 'react';
import { GeneratePanel } from './GeneratePanel';

interface Props {
  instrumentId: string;
  instrumentType: 'synth' | 'sampler';
}

/**
 * GEN button + gear icon for the piano roll toolbar.
 * The gear opens the GeneratePanel popup.
 */
export function GenerateButton({ instrumentId, instrumentType }: Props) {
  const [panelOpen, setPanelOpen] = useState(false);
  const gearRef = useRef<HTMLButtonElement>(null);

  const handleToggle = () => {
    setPanelOpen((prev) => !prev);
  };

  return (
    <>
      <button
        ref={gearRef}
        onClick={handleToggle}
        className={`text-[9px] px-2 py-0.5 rounded transition-colors font-medium
          ${panelOpen
            ? 'bg-accent/20 text-accent'
            : 'text-text-secondary/60 hover:text-text-secondary hover:bg-white/5 border border-border/50'}`}
        title="Generate pattern"
      >
        GEN
      </button>

      {panelOpen && gearRef.current && (
        <GeneratePanel
          instrumentId={instrumentId}
          instrumentType={instrumentType}
          anchorRect={gearRef.current.getBoundingClientRect()}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </>
  );
}
