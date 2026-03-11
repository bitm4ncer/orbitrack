/** Settings popup with audio, MIDI, and app settings */

import { useState } from 'react';
import { useStore } from '../../state/store';
import { MidiSettingsPanel } from '../MidiSettings/MidiSettingsPanel';

interface SettingsSection {
  id: string;
  label: string;
  icon: string;
}

const SECTIONS: SettingsSection[] = [
  { id: 'midi', label: 'MIDI', icon: '🎹' },
  { id: 'audio', label: 'Audio', icon: '🔊' },
  { id: 'display', label: 'Display', icon: '⚙️' },
  { id: 'about', label: 'About', icon: 'ℹ️' },
];

export function SettingsPopup({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<string>('midi');
  const masterVolume = useStore((s) => s.masterVolume);
  const setMasterVolume = useStore((s) => s.setMasterVolume);

  return (
    <>
      {/* Dark overlay with blur */}
      <div
        className="fixed inset-0 z-40 backdrop-blur-sm bg-black/40"
        onClick={onClose}
      />

      {/* Settings popup */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="bg-bg-secondary border border-border rounded-lg shadow-2xl overflow-hidden w-full max-w-2xl max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-bg-tertiary/50">
            <h2 className="text-lg font-semibold text-text-primary">Settings</h2>
            <button
              onClick={onClose}
              className="w-6 h-6 rounded-full border border-border text-text-secondary hover:border-white/30 hover:text-text-primary transition-colors flex items-center justify-center text-sm"
              title="Close settings"
            >
              ✕
            </button>
          </div>

          {/* Tabs + Content */}
          <div className="flex flex-1 min-h-0">
            {/* Tab sidebar */}
            <div className="w-40 border-r border-border bg-bg-tertiary/30 flex flex-col">
              {SECTIONS.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveTab(section.id)}
                  className={`px-4 py-3 text-sm text-left transition-colors border-l-2 cursor-pointer ${
                    activeTab === section.id
                      ? 'border-l-accent bg-bg-tertiary text-text-primary font-medium'
                      : 'border-l-transparent text-text-secondary hover:bg-bg-tertiary/50'
                  }`}
                >
                  <span className="mr-2">{section.icon}</span>
                  {section.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'midi' && (
                <div className="p-6">
                  <h3 className="text-sm font-semibold text-text-primary mb-4">MIDI Configuration</h3>
                  <MidiSettingsPanel />
                </div>
              )}

              {activeTab === 'audio' && (
                <div className="p-6 space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary mb-4">Audio Output</h3>

                    {/* Master Volume */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-text-secondary">Master Volume</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={masterVolume}
                          onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                          className="flex-1 h-2 bg-bg-tertiary border border-border rounded cursor-pointer"
                          style={{ '--slider-color': '#94a3b8' } as React.CSSProperties}
                        />
                        <span className="text-xs font-mono text-text-secondary w-10 text-right">
                          {Math.round(masterVolume * 100)}%
                        </span>
                      </div>
                    </div>

                    {/* Soundcard Info */}
                    <div className="mt-6 p-3 bg-bg-tertiary/50 rounded border border-border/30">
                      <p className="text-xs text-text-secondary/70">
                        Audio context: <span className="font-mono text-accent">Web Audio API</span>
                      </p>
                      <p className="text-xs text-text-secondary/70 mt-1">
                        Soundcard selection is automatic via your browser audio output settings.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'display' && (
                <div className="p-6 space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary mb-4">Display Settings</h3>

                    <div className="space-y-4">
                      {/* Dark Mode (always on for now) */}
                      <div className="flex items-center justify-between p-3 bg-bg-tertiary/50 rounded border border-border/30">
                        <div>
                          <p className="text-xs font-medium text-text-primary">Dark Theme</p>
                          <p className="text-xs text-text-secondary/60 mt-0.5">Always enabled</p>
                        </div>
                        <span className="text-sm text-accent">●</span>
                      </div>

                      {/* Resolution Info */}
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-text-secondary">Canvas Resolution</label>
                        <div className="p-3 bg-bg-tertiary/50 rounded border border-border/30 text-xs text-text-secondary/70 font-mono">
                          <p>Canvas resolution automatically adapts to your screen DPI</p>
                          <p className="mt-1">Current: {window.devicePixelRatio.toFixed(2)}x</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'about' && (
                <div className="p-6 space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary mb-2">Orbeat</h3>
                    <p className="text-xs text-text-secondary/70">Polyrhythmic Web Sequencer</p>
                    <p className="text-xs text-text-secondary/50 mt-2">v0.1.0</p>
                  </div>

                  <div className="space-y-2 text-xs text-text-secondary/70 pt-4 border-t border-border/30">
                    <p className="font-mono">
                      Built with <span className="text-accent">React</span>, <span className="text-accent">Tone.js</span>, <span className="text-accent">Web Audio API</span>
                    </p>
                    <p className="mt-2">
                      Audio synthesis powered by <span className="text-accent">superdough</span>
                    </p>
                    <p className="mt-2">
                      State management with <span className="text-accent">Zustand</span>
                    </p>
                  </div>

                  <div className="pt-4 border-t border-border/30">
                    <p className="text-xs text-text-secondary/50">
                      🎵 Create, perform, and share polyrhythmic sequences in your browser
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
