import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEffectPresetStore } from '../../state/effectPresetStore';
import type { EffectPreset } from '../../types/storage';
import { EffectPresetSaveDialog } from './EffectPresetSaveDialog';

interface Props {
  effectType: string;
  params: Record<string, number>;
  color: string;
  anchorRect: DOMRect;
  onApply: (params: Record<string, number>) => void;
  onClose: () => void;
}

export function EffectPresetDropdown({ effectType, params, color, anchorRect, onApply, onClose }: Props) {
  const presets = useEffectPresetStore((s) => s.presets);
  const loadPresets = useEffectPresetStore((s) => s.loadPresets);
  const deletePreset = useEffectPresetStore((s) => s.deletePreset);
  const [showSave, setShowSave] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadPresets(); }, [loadPresets]);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Filter presets for this effect type
  const filtered = presets.filter((p) => p.effectType === effectType);
  const factory = filtered.filter((p) => p.source === 'factory');
  const user = filtered.filter((p) => p.source === 'user');

  // Group factory presets by last folder segment
  const factoryGroups = new Map<string, EffectPreset[]>();
  for (const p of factory) {
    const parts = p.folder.split('/');
    const group = parts[parts.length - 1] ?? 'Other';
    if (!factoryGroups.has(group)) factoryGroups.set(group, []);
    factoryGroups.get(group)!.push(p);
  }

  const top = anchorRect.bottom + 4;
  const left = Math.max(4, anchorRect.left - 80);

  return createPortal(
    <>
      <div
        ref={panelRef}
        className="fixed z-[9999] rounded-lg border border-border shadow-xl flex flex-col"
        style={{
          top, left,
          width: 200,
          maxHeight: 360,
          background: '#14141e',
        }}
      >
        {/* Header */}
        <div className="px-3 py-1.5 text-[9px] uppercase tracking-wider font-medium" style={{ color: `${color}aa` }}>
          Presets
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto px-1 pb-1" style={{ maxHeight: 280 }}>
          {/* Factory groups */}
          {[...factoryGroups.entries()].map(([group, items]) => (
            <div key={group}>
              <div className="text-[8px] text-text-secondary/50 uppercase tracking-wider px-2 pt-1.5 pb-0.5">
                {group}
              </div>
              {items.map((p) => (
                <PresetRow key={p.id} preset={p} color={color} onApply={onApply} onDelete={null} />
              ))}
            </div>
          ))}

          {/* User presets */}
          {user.length > 0 && (
            <div>
              <div className="text-[8px] text-text-secondary/50 uppercase tracking-wider px-2 pt-2 pb-0.5">
                User
              </div>
              {user.map((p) => (
                <PresetRow key={p.id} preset={p} color={color} onApply={onApply} onDelete={deletePreset} />
              ))}
            </div>
          )}

          {filtered.length === 0 && (
            <div className="text-[9px] text-text-secondary/40 text-center py-4">No presets</div>
          )}
        </div>

        {/* Save button */}
        <button
          onClick={() => setShowSave(true)}
          className="mx-2 mb-2 mt-1 py-1 rounded text-[9px] font-medium transition-colors"
          style={{
            background: `${color}18`,
            color,
            border: `1px solid ${color}40`,
          }}
        >
          Save Current...
        </button>
      </div>

      {showSave && (
        <EffectPresetSaveDialog
          effectType={effectType}
          params={params}
          color={color}
          onClose={() => setShowSave(false)}
          onSaved={() => { setShowSave(false); loadPresets(); }}
        />
      )}
    </>,
    document.body,
  );
}

function PresetRow({
  preset, color, onApply, onDelete,
}: {
  preset: EffectPreset;
  color: string;
  onApply: (params: Record<string, number>) => void;
  onDelete: ((id: string) => void) | null;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="flex items-center gap-1 px-2 py-1 rounded cursor-pointer transition-colors"
      style={{ background: hovered ? `${color}12` : 'transparent' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onApply(preset.params)}
    >
      <span className="flex-1 text-[10px] text-text-primary truncate">{preset.name}</span>
      {onDelete && hovered && (
        <button
          className="text-[9px] text-text-secondary/40 hover:text-red-400 shrink-0"
          onClick={(e) => { e.stopPropagation(); onDelete(preset.id); }}
          title="Delete"
        >
          ×
        </button>
      )}
    </div>
  );
}
