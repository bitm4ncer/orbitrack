ORBEAT — ROADMAP
================================================================================

STATUS: v0.0.8 (dev)  |  MODEL: open core  |  LICENSE: MIT (planned)

VISION
------
An advanced groovebox in the browser.
Not a DAW. Not a toy. The eJay of 2026.
You start with a beat, not a blank page.

DECISIONS LOCKED
----------------
  Monetization  →  free forever to jam
                   audio export free but watermarked ("Made with Orbeat")
                   €35 one-time: removes watermark + unlocks private cloud saves
  Open source   →  yes. code on GitHub (MIT), hosted service at orbeat.app
  Accounts      →  v2. URL-as-save ships first, no backend in v1
  Mobile        →  desktop-first. iPad/mobile is a later milestone
  Arrangement   →  Scene chain (Song Mode), NOT a full DAW timeline
  Naming        →  "Groups" renamed to "Scenes"

================================================================================
v1 — SHIP IT                                              target: next milestone
================================================================================

CORE FEATURES
  [x] Orbit sequencer (polyrhythmic loops)
  [x] Orbit DSP chain (EQ → Chorus → Phaser → Filter → Dist → Reverb → Delay)
  [x] Custom SynthEngine (polyphonic wavetable)
  [x] Looper (sample editor with BPM detection)
  [x] Grid sequencer (MIDI notes per hit)
  [x] Master effects chain
  [x] IndexedDB autosave
  [x] Recording (wav/mp3)
  [x] Internet Archive sample browser

IN PROGRESS
  [ ] Scenes (rename Groups throughout codebase + UI)
  [ ] Group bus routing + effects (groupBus.ts — already in working tree)
  [ ] GroupHeader component

v1 ADDITIONS
  [ ] Song Mode
        - toggle button left of play button
        - activates timeline strip (200px height)
        - scenes stacked horizontally as blocks
        - drag + drop to reorder
        - bar length control per scene (resize handle, like MIDI notes)
        - copy / paste (Ctrl+C / Ctrl+V)
        - play in Song Mode runs the chain in order

  [ ] Shareable URL
        - "Share" button → encodes project state as base64 URL hash
        - orbeat.app/#[base64-encoded-OrbeatSet]
        - no backend, no account needed
        - works as a bookmark = free save
        - opens and hydrates on load

  [ ] Audio export
        - free: exports with "Made with Orbeat — orbeat.app" mixed into audio
        - paid: clean export (no watermark)
        - format: wav + mp3

  [ ] Landing page
        - designer-made, ships as separate route or orbeat.app/
        - embed: live demo in page, no install
        - one CTA: "Make a beat"

  [ ] Open source
        - MIT license
        - README with setup instructions
        - public GitHub repo

================================================================================
v2 — SOCIAL                                                         after launch
================================================================================

  [ ] User accounts (Supabase)
        - Google OAuth + GitHub OAuth
        - magic link fallback

  [ ] Cloud save
        - save sets to Supabase DB (JSON, same OrbeatSet format)
        - free: 3 private sets
        - paid: unlimited

  [ ] Public profiles
        - orbeat.app/@username
        - lists public sets with play count

  [ ] Shareable set URLs (server-side)
        - orbeat.app/set/[short-id]
        - replaces URL hash approach
        - enables play counts, forks

  [ ] Fork button
        - "Fork this set" copies to your account
        - THE growth mechanic

  [ ] Explore page
        - trending / recent public sets
        - no login required to browse or listen

  [ ] Payment
        - Gumroad or Stripe for €35 one-time purchase
        - license key system OR Supabase flag on user account
        - unlocks: clean export + unlimited private saves

================================================================================
v3 — GROW                                                          future
================================================================================

  [ ] Mobile responsive (iPad-first)
  [ ] iOS / Android via Capacitor (App Store)
  [ ] Improved algorithmic melody generation
        - key + scale aware
        - analyses existing pattern
        - suggests coherent next part
  [ ] LLM melody suggestions (Claude API, credit-based)
  [ ] MIDI I/O (Web MIDI API)
  [ ] Sample company white-label integrations
  [ ] Embeddable player (iframe, for sample label sites)

================================================================================
ARCHITECTURE NOTES (known debt, address before v2)
================================================================================

  - Decompose monolithic store.ts (~1700 lines) into Zustand slices
  - Extract AudioBuffer out of Zustand into a non-reactive registry
  - Add Vitest for unit tests (DSP logic, generators, serializer)
  - Replace module-level audio singletons with AudioEngine class
  - Add React Router (needed for /set/:id, /@user routes in v2)
  - Fix orbitIndex leaking (add free-list pool)

================================================================================
