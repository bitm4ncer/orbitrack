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
  { id: 'guide', label: 'Guide', icon: '🎵' },
  { id: 'midi', label: 'MIDI', icon: '🎹' },
  { id: 'audio', label: 'Audio', icon: '🔊' },
  { id: 'display', label: 'Display', icon: '⚙️' },
  { id: 'help', label: 'Help', icon: '❓' },
  { id: 'about', label: 'About', icon: 'ℹ️' },
];

export function SettingsPopup({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<string>('guide');
  const masterVolume = useStore((s) => s.masterVolume);
  const setMasterVolume = useStore((s) => s.setMasterVolume);

  return (
    <>
      <div
        className="fixed inset-0 z-40 backdrop-blur-sm bg-black/40"
        onClick={onClose}
      />

      <div
        className="fixed bottom-0 left-0 right-0 z-50 flex items-end justify-center p-4 animate-[slideUp_0.3s_ease-out]"
        onClick={onClose}
      >
        <div
          className="bg-bg-secondary border border-border rounded-t-lg shadow-2xl overflow-hidden w-full max-w-2xl max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
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

          <div className="flex flex-1 min-h-0">
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

            <div className="flex-1 overflow-y-auto">
              {activeTab === 'guide' && (
                <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                  {/* Polyrhythmic Concept */}
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary mb-3">Polyrhythmic Sequencing</h3>
                    <div className="space-y-2 text-xs text-text-secondary/70 leading-relaxed">
                      <p>
                        Orbeat creates complex rhythms by layering independent hit patterns across instruments. Each Orb (instrument) has its own hit count and step size, letting you build polyrhythms where patterns interloc k at different intervals.
                      </p>
                      <p>
                        For example: a bass with 4 hits per 16-step loop, drums with 3 hits per 16 steps, and a synth with 5 hits creates a naturally cycling pattern that resolves after 16 steps.
                      </p>
                    </div>
                  </div>

                  {/* Scroll Adjustments */}
                  <div className="border-t border-border/30 pt-4">
                    <h3 className="text-sm font-semibold text-text-primary mb-3">Scroll Adjustments</h3>
                    <div className="space-y-3 text-xs text-text-secondary/70 leading-relaxed">
                      <div>
                        <div className="text-accent/80 font-mono mb-1">Hit Count:</div>
                        <div>Scroll up/down anywhere on the piano roll to add/remove hits in the current instrument.</div>
                      </div>
                      <div>
                        <div className="text-accent/80 font-mono mb-1">Step Count:</div>
                        <div>Hold <span className="text-accent/80 font-mono">Ctrl</span> while scrolling to adjust the loop length (number of steps displayed).</div>
                      </div>
                      <div>
                        <div className="text-accent/80 font-mono mb-1">Volume:</div>
                        <div>Hold <span className="text-accent/80 font-mono">Alt</span> while scrolling to adjust the instrument's volume in real-time.</div>
                      </div>
                      <div>
                        <div className="text-accent/80 font-mono mb-1">Velocity:</div>
                        <div>Hover over a note block and scroll to adjust that note's velocity (1-127). Enable the <span className="text-accent/80 font-mono">VEL</span> button to see velocity bars below the grid.</div>
                      </div>
                    </div>
                  </div>

                  {/* MIDI Integration */}
                  <div className="border-t border-border/30 pt-4">
                    <h3 className="text-sm font-semibold text-text-primary mb-3">MIDI Input & Note Generation</h3>
                    <div className="space-y-2 text-xs text-text-secondary/70 leading-relaxed">
                      <p>
                        Connect a MIDI keyboard in the MIDI settings to play notes live. The piano roll automatically generates appropriate note numbers based on the selected instrument's voice and octave offset.
                      </p>
                      <p>
                        In the piano roll toolbar, use <span className="text-accent/80 font-mono">Base Oct</span> (0-8) to set the octave and <span className="text-accent/80 font-mono">Span</span> (1-4) to control the range of playable notes.
                      </p>
                      <p>
                        MIDI velocity from your keyboard is automatically captured and applied to each note, letting you perform with dynamic expression.
                      </p>
                    </div>
                  </div>
                </div>
              )}

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
                      <div className="flex items-center justify-between p-3 bg-bg-tertiary/50 rounded border border-border/30">
                        <div>
                          <p className="text-xs font-medium text-text-primary">Dark Theme</p>
                          <p className="text-xs text-text-secondary/60 mt-0.5">Always enabled</p>
                        </div>
                        <span className="text-sm text-accent">●</span>
                      </div>

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

              {activeTab === 'help' && (
                <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                  {/* General Shortcuts */}
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary mb-3">General Shortcuts</h3>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-accent/80 font-mono">Space</span><span>Play / Stop</span></div>
                      <div className="flex justify-between"><span className="text-accent/80 font-mono">Click ring</span><span>Add hit</span></div>
                      <div className="flex justify-between"><span className="text-accent/80 font-mono">Double-click hit</span><span>Remove hit</span></div>
                      <div className="flex justify-between"><span className="text-accent/80 font-mono">Drag hit</span><span>Reposition hit</span></div>
                      <div className="flex justify-between"><span className="text-accent/80 font-mono">Scroll</span><span>Adjust hit count</span></div>
                      <div className="flex justify-between"><span className="text-accent/80 font-mono">Ctrl + Scroll</span><span>Adjust step count</span></div>
                      <div className="flex justify-between"><span className="text-accent/80 font-mono">Alt + Scroll</span><span>Adjust volume</span></div>
                      <div className="flex justify-between"><span className="text-accent/80 font-mono">S button</span><span>Solo instrument</span></div>
                      <div className="flex justify-between"><span className="text-accent/80 font-mono">M button</span><span>Mute instrument</span></div>
                      <div className="flex justify-between"><span className="text-accent/80 font-mono">Shift + Click</span><span>Select multiple Orbs</span></div>
                      <div className="flex justify-between"><span className="text-accent/80 font-mono">Ctrl + G</span><span>Group Orbs to Scene</span></div>
                      <div className="flex justify-between"><span className="text-accent/80 font-mono">Shift + Ctrl + G</span><span>Ungroup</span></div>
                    </div>
                  </div>

                  {/* Velocity Controls */}
                  <div className="border-t border-border/30 pt-4">
                    <h3 className="text-sm font-semibold text-text-primary mb-2">Velocity (Piano Roll)</h3>
                    <div className="space-y-2 text-xs text-text-secondary/70">
                      <div><span className="text-accent/80 font-mono">VEL button</span> — Toggle velocity lane below grid</div>
                      <div><span className="text-accent/80 font-mono">Drag bars</span> — Adjust velocity (1-127)</div>
                      <div><span className="text-accent/80 font-mono">Hover + Scroll</span> — Change velocity on note</div>
                      <div className="mt-2">Note opacity reflects velocity. Velocity affects audio gain in samplers.</div>
                    </div>
                  </div>

                  {/* Scenes & Track View */}
                  <div className="border-t border-border/30 pt-4">
                    <h3 className="text-sm font-semibold text-text-primary mb-2">Scenes & Track View</h3>
                    <div className="space-y-3 text-xs text-text-secondary/70 leading-relaxed">
                      <div>
                        <div className="text-accent/80 font-mono mb-1">Creating Scenes:</div>
                        <div>Select one or more Orbs (Shift+Click), then press <span className="text-accent/80 font-mono">Ctrl+G</span> to group them into a Scene.</div>
                      </div>

                      <div>
                        <div className="text-accent/80 font-mono mb-1">Track View:</div>
                        <div>Click the <span className="text-accent/80 font-mono">TRACK</span> button in the bottom right to enter Track Mode. Drag scene blocks to arrange the order and length of each scene.</div>
                      </div>

                      <div>
                        <div className="text-accent/80 font-mono mb-1">Scene Controls:</div>
                        <div>Click to select, drag to reorder. Use the colored label to rename scenes.</div>
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
