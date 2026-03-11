interface Props {
  genOpen: boolean;
  onToggleGen: () => void;
}

/**
 * GEN button for the piano roll toolbar.
 * Toggles the GenSidebar visibility.
 */
export function GenerateButton({ genOpen, onToggleGen }: Props) {
  return (
    <button
      onClick={onToggleGen}
      className={`text-[9px] px-2 py-0.5 rounded border transition-colors font-medium
        ${genOpen
          ? 'bg-accent/20 text-accent border-accent/40'
          : 'text-text-secondary/60 hover:text-text-secondary hover:bg-white/5 border-border/50'}`}
      title="Toggle generation sidebar"
    >
      GEN
    </button>
  );
}
