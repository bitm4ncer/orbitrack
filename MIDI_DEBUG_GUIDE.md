# MIDI Debugging Guide

## Steps to diagnose MIDI issue

### 1. Open Browser Console
- Press **F12** to open Developer Tools
- Click the **Console** tab
- Keep it open while testing

### 2. Enable MIDI in Settings
- Click **Settings** button (bottom right)
- Go to **MIDI Control** tab
- Toggle **Enabled** checkbox to ON
- You should see a message like "✓ MIDI Ready"

### 3. Select Your MIDI Input Device
- In the dropdown under **Input Device**, select your keyboard
- Watch the console for: `[MIDI] Connected to input: <device-name>`
- If you see this, device connection is working

### 4. Play MIDI Keyboard and Check Console Messages

**Expected console output when pressing keys:**

```
[MIDI Input] Note On: {noteNumber: 60, velocity: 0.8, ...}
[MIDI Router] routeMidiNote called: {noteNumber: 60, velocity: 0.8}
[MIDI Router] Selected instrument: {inst: "Synth", type: "synth"}
[MIDI Router] Got engine, playing note: 60
```

**Diagnostic checklist:**

| Message appears? | Status | Next step |
|---|---|---|
| ❌ `[MIDI] Connected to input` | Device not found by WebMidi | Check: 1) Is device connected? 2) Try unplugging/plugging it back in |
| ✅ `[MIDI Input] Note On` | ✅ Device is sending notes | Advance to next check |
| ❌ `[MIDI Input] Note On` | Notes not reaching app | 1) Check device in OS settings, 2) Try another MIDI app to verify device works |
| ✅ `[MIDI Input] Note On` but ❌ `routeMidiNote called` | Routing broken | Check if any errors in console above these messages |
| ✅ `routeMidiNote called` but ❌ `Selected instrument` | No synth selected | Select a **Synth** instrument (not Sampler) from left sidebar |
| ✅ All messages appear but no sound | Synth not producing audio | Check: 1) Is synth volume >0? 2) Is orbit muted? 3) Try pressing synth keys on screen |

### 5. Check for Errors
- Look for any red error messages like:
  - `[MIDI] Failed to route note: ...`
  - `[MIDI] Failed to enable WebMidi: ...`
  - `[MIDI Input] Device not found`

### 6. Keyboard Polyphony Issue

**Expected behavior:** Hold multiple keys → synth plays highest note
**Current issue:** Synth gets stuck when releasing keys

**To test:**
1. Press key A (should play)
2. While holding A, press key B (should play B, not A)
3. Release A (should still play B)
4. Release B (should stop)

If synth plays both notes simultaneously or gets stuck, it's the held-notes tracking issue.

## Common Issues & Solutions

### Issue: MIDI enabled but device dropdown is empty
- **Cause:** WebMidi initialization failed (usually browser permission)
- **Solution:** Check browser console for `[MIDI] Failed to enable WebMidi` error. Allow MIDI access when prompted.

### Issue: Device appears in dropdown but doesn't connect
- **Cause:** Device ID mismatch or device disconnected
- **Solution:** Unplug/replug device. If persists, clear MIDI settings: `localStorage.removeItem('orbeat_midi_settings')`

### Issue: Keyboard notes create high latency sound
- **Cause:** Web Audio Context not started
- **Solution:** Click anywhere on the page to start audio context, then try MIDI notes again

## Share Debug Output
When reporting the issue, copy the console output after pressing MIDI keys and include:
1. All messages starting with `[MIDI`
2. Any red error messages
3. The device name shown in "Connected to input"
