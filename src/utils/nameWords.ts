/**
 * Word pools for the project name generator.
 * Three slots: [Adjective] [Noun] "of" [Noun]
 * Inspired by rave culture, sci-fi, synth-wave, and absurd electronica.
 */

export const ADJECTIVES = [
  // Rave / club
  'Acid', 'Analog', 'Astral', 'Bass', 'Blissed', 'Bouncy', 'Broken',
  'Brutal', 'Cosmic', 'Cranked', 'Crushed', 'Crystal', 'Cyber', 'Dark',
  'Deep', 'Detuned', 'Digital', 'Dirty', 'Distorted', 'Drifting', 'Droning',
  'Dubby', 'Electric', 'Ethereal', 'Evil', 'Feral', 'Filthy', 'Flanged',
  'Flickering', 'Floating', 'Forbidden', 'Fractal', 'Frozen', 'Fugitive',
  'Funky', 'Fuzzy', 'Galactic', 'Gaseous', 'Glitched', 'Granular', 'Gritty',
  'Groovy', 'Haunted', 'Hollow', 'Holographic', 'Humid', 'Hyper', 'Infinite',
  'Interstellar', 'Inverted', 'Iridescent', 'Kinetic', 'Lazy', 'Liquid',
  'Lo-Fi', 'Lonely', 'Lucid', 'Lunar', 'Magnetic', 'Mangled', 'Mechanical',
  'Melted', 'Metallic', 'Midnight', 'Modular', 'Molten', 'Mono', 'Morphed',
  'Muffled', 'Neon', 'Neural', 'Nocturnal', 'Nuclear', 'Oblique', 'Obscure',
  'Orbital', 'Overdriven', 'Oxidized', 'Parallel', 'Phantom', 'Phased',
  'Pixelated', 'Plastic', 'Pulsing', 'Quantum', 'Radioactive', 'Raw',
  'Recursive', 'Refracted', 'Reversed', 'Ritual', 'Robotic', 'Rotary',
  'Rusty', 'Sacred', 'Saturated', 'Scattered', 'Shadowy', 'Shimmer',
  'Sidechain', 'Silent', 'Slippery', 'Smeared', 'Solar', 'Sonic', 'Spectral',
  'Spiraling', 'Static', 'Stereo', 'Sticky', 'Strobing', 'Subatomic',
  'Sunken', 'Synthetic', 'Tape', 'Temporal', 'Textured', 'Thick', 'Toxic',
  'Tribal', 'Twisted', 'Unfiltered', 'Unstable', 'Vapor', 'Velvet',
  'Vibrating', 'Vintage', 'Void', 'Volatile', 'Warped', 'Washed', 'Wet',
  'Wicked', 'Wobbling', 'Xenomorphic', 'Zero-G',
];

export const NOUNS = [
  // Synths / gear
  'Algorithm', 'Arpeggio', 'Automaton', 'Bassline', 'Beacon', 'Beat',
  'Bitstream', 'Blackhole', 'Blaster', 'Broadcast', 'Buffer', 'Bunker',
  'Cathedral', 'Channel', 'Cipher', 'Circuit', 'Cluster', 'Coil',
  'Continuum', 'Controller', 'Cosmos', 'Crossfade', 'Crypt', 'Current',
  'Cyborg', 'Daemon', 'Database', 'Datastream', 'Decibel', 'Decoder',
  'Dimension', 'Drone', 'Dropzone', 'Echo', 'Eclipse', 'Engine',
  'Entropy', 'Envelope', 'Equalizer', 'Feedback', 'Filter', 'Firmware',
  'Flux', 'Fog', 'Frequency', 'Fugue', 'Function', 'Furnace',
  'Generator', 'Ghost', 'Glitch', 'Grid', 'Groove', 'Habitat',
  'Harmonic', 'Haze', 'Helix', 'Hexagon', 'Horizon', 'Hyperspace',
  'Impulse', 'Index', 'Interface', 'Ion', 'Kernel', 'Kickdrum',
  'Labyrinth', 'Laser', 'Lattice', 'Layer', 'Loop', 'Machine',
  'Mainframe', 'Manifold', 'Matrix', 'Membrane', 'Metronome', 'Mirage',
  'Module', 'Monolith', 'Nebula', 'Network', 'Neuron', 'Noise',
  'Nucleus', 'Octave', 'Operator', 'Oracle', 'Orbit', 'Oscillator',
  'Paradox', 'Particle', 'Patchbay', 'Pattern', 'Phase', 'Photon',
  'Pipeline', 'Pixel', 'Plasm', 'Portal', 'Prism', 'Processor',
  'Protocol', 'Pulse', 'Quasar', 'Reactor', 'Realm', 'Resonance',
  'Reverb', 'Rift', 'Ritual', 'Robot', 'Sample', 'Scanner',
  'Sequence', 'Server', 'Shadow', 'Signal', 'Simulator', 'Siren',
  'Socket', 'Solstice', 'Spectrum', 'Splice', 'Stack', 'Storm',
  'Strobe', 'Subwoofer', 'Surge', 'Synapse', 'Synthesizer', 'System',
  'Tape', 'Tensor', 'Terminal', 'Theorem', 'Threshold', 'Tonearm',
  'Transmitter', 'Tunnel', 'Turbine', 'Vaporwave', 'Vector', 'Vertex',
  'Void', 'Voltage', 'Vortex', 'Warp', 'Waveform', 'Wavelength',
  'Zone',
];

/** Optional "of ___" tail nouns — more abstract/mystical */
export const TAIL_NOUNS = [
  'Afterhours', 'Amnesia', 'Antimatter', 'Bass', 'Chaos', 'Chrome',
  'Club', 'Consciousness', 'Darkness', 'Dawn', 'Decay', 'Delirium',
  'Desire', 'Destiny', 'Distortion', 'Doom', 'Dreams', 'Dub',
  'Dust', 'Dystopia', 'Ecstasy', 'Ether', 'Everything', 'Feedback',
  'Fire', 'Freeform', 'Frequencies', 'Funk', 'Future', 'Gabber',
  'Ghosts', 'Gravity', 'Hardcore', 'Haze', 'Illusion', 'Infinity',
  'Jungle', 'Light', 'Machines', 'Madness', 'Mercury', 'Midnight',
  'Mirrors', 'Modulation', 'Neon', 'Night', 'Noise', 'Nothing',
  'Oblivion', 'Overdrive', 'Oxide', 'Paradise', 'Particles',
  'Perception', 'Plasma', 'Pleasure', 'Polyphony', 'Pressure',
  'Prophecy', 'Reality', 'Resonance', 'Reverb', 'Rhythm', 'Science',
  'Shadow', 'Silence', 'Sleep', 'Smoke', 'Sorrow', 'Space',
  'Speed', 'Static', 'Steel', 'Subculture', 'Subsonic', 'Synthesis',
  'Techno', 'Thought', 'Thunder', 'Time', 'Trance', 'Twilight',
  'Underground', 'Velvet', 'Venus', 'Voltage', 'Waveforms', 'Zen',
];
