import { useStore } from '../../state/store';

interface LooperToolbarProps {
  instrumentId: string;
  color: string;
  sensitivity: number;
  onSensitivityChange: (v: number) => void;
}

export function LooperToolbar({ instrumentId, color, sensitivity, onSensitivityChange }: LooperToolbarProps) {
  const editor = useStore((s) => s.looperEditors[instrumentId]);
  const looperCut = useStore((s) => s.looperCut);
  const looperCopy = useStore((s) => s.looperCopy);
  const looperPaste = useStore((s) => s.looperPaste);
  const looperTrim = useStore((s) => s.looperTrim);
  const looperDelete = useStore((s) => s.looperDelete);
  const looperUndo = useStore((s) => s.looperUndo);
  const redetectTransients = useStore((s) => s.redetectTransients);

  const hasSelection = editor?.selectionStart != null && editor?.selectionEnd != null;
  const hasClipboard = !!editor?.clipboard;
  const hasUndo = (editor?.undoStack.length ?? 0) > 0;

  const btnClass = (enabled: boolean) =>
    `px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider rounded transition-colors ${
      enabled
        ? 'text-text-primary hover:bg-white/10 cursor-pointer'
        : 'text-text-secondary/30 cursor-default'
    }`;

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border/50 shrink-0 bg-bg-secondary">
      <button className={btnClass(hasSelection)} disabled={!hasSelection}
        onClick={() => hasSelection && looperCut(instrumentId)} title="Cut (Ctrl+X)">
        Cut
      </button>
      <button className={btnClass(hasSelection)} disabled={!hasSelection}
        onClick={() => hasSelection && looperCopy(instrumentId)} title="Copy (Ctrl+C)">
        Copy
      </button>
      <button className={btnClass(hasClipboard)} disabled={!hasClipboard}
        onClick={() => hasClipboard && looperPaste(instrumentId)} title="Paste (Ctrl+V)">
        Paste
      </button>
      <button className={btnClass(hasSelection)} disabled={!hasSelection}
        onClick={() => hasSelection && looperTrim(instrumentId)} title="Trim to selection">
        Trim
      </button>
      <button className={btnClass(hasSelection)} disabled={!hasSelection}
        onClick={() => hasSelection && looperDelete(instrumentId)} title="Delete (Del)">
        Delete
      </button>

      <div className="w-px h-4 bg-border/40 mx-1" />

      <button className={btnClass(hasUndo)} disabled={!hasUndo}
        onClick={() => hasUndo && looperUndo(instrumentId)} title="Undo (Ctrl+Z)">
        Undo
      </button>

      <div className="w-px h-4 bg-border/40 mx-1" />

      {/* Sensitivity slider */}
      <span className="text-[9px] text-text-secondary/60 uppercase tracking-wider ml-1">Sens</span>
      <input
        type="range"
        min={0} max={1} step={0.05}
        value={sensitivity}
        onChange={(e) => onSensitivityChange(parseFloat(e.target.value))}
        onMouseUp={() => redetectTransients(instrumentId, sensitivity)}
        className="inst-slider w-16 h-4"
        style={{ '--slider-color': color } as React.CSSProperties}
      />
      <span className="text-[9px] text-text-secondary/50 font-mono w-6">{(sensitivity * 100).toFixed(0)}%</span>
    </div>
  );
}
