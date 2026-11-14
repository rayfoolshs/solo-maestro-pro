# Solo Maestro Pro — Build Plan (Sections 1 & 2)

Architecture rule:
Keep all music theory, chart schema/parsing, and note/tuning math in pure TypeScript (`src/theory/`, `src/chart/`, `src/arrange/`) with zero React or Web Audio imports. Existing 103 unit tests + new tests must pass (`npm test`) and `npm run build` must succeed after every milestone.

---

## Milestone 1: Local Key-Centre & Modulation Detection
**Goal:** Replace single-key-per-chart analysis with segmented local key centres (e.g., *Blue Bossa*: `Cm` → `D♭maj` in bars 9–12 → `Cm`), with manual override support.

### 1.1 Pure Theory (`src/theory/`)
- Add a `KeySpan` model:
  - `{ id, startSlot, endSlot, tonic, mode ('major' | 'minor'), confidence, source ('auto' | 'pinned') }`
- Implement a windowed modulation detector (`detectLocalKeySpans(chordTimeline, globalKey)`):
  1. Score candidate keys (24 keys) per chord event using diatonic fit, functional root motion (`V7 → I/i`, `ii → V → I`, `iiø → V7 → i`), and harmonic rhythm weight.
  2. Run dynamic programming across the timeline with a **modulation penalty** (so passing secondary dominants like `V7/ii` stay inside the parent key, while real 2–4+ bar centres like `E♭m7 → A♭7 → D♭maj7` trigger a clean key shift).
  3. Merge user-pinned `KeySpan` overrides before running scale suggestions.
- Update chord-scale ranking & borrowed-note detection to evaluate each chord against its **active local `KeySpan`** rather than only the global chart key.

### 1.2 Chart Persistence (`src/chart/`)
- Extend `.gsm.json` schema with optional `keySpans?: KeySpan[]` (backward-compatible: older `.gsm.json` files without `keySpans` default to auto-detection).
- Ensure transposition updates both global key and any pinned `KeySpan`s.

### 1.3 UI (`src/ui/Leadsheet`, `src/ui/Header`)
- Render subtle key-centre bracket badges above `Leadsheet` bars where the local key changes (e.g., `[D♭ major]`), distinct from the global key indicator in `Header`.
- Add click/context-menu action on any bar in `Leadsheet` to **Pin Local Key here** / **Clear Local Key**.

### 1.4 Tests & Verification
- Unit tests:
  - *Blue Bossa* detects `C minor` (bars 1–8), `D♭ major` (bars 9–12), `C minor` (bars 13–16).
  - *Autumn Leaves* stays unified in one relative major/minor centre without noisy bar-by-bar flipping.
  - *All The Things You Are* (or multi-centre progression) transitions cleanly across distant centres.
  - Pinned `KeySpan` survives chart save/export/re-import and transposition.

---

## Milestone 2: Guide-Tone (3rds & 7ths) & "Next Chord" Target Overlay
**Goal:** Train horizontal voice-leading across barlines on the 24-fret neck.

### 2.1 Pure Theory (`src/theory/`)
- Add `analyzeVoiceLeading(currentChord, nextChord)`:
  - Identify `currentChord`’s **3rd** and **7th** (or 6th on `6` / `6/9` chords; `4th` on `sus4`).
  - Identify `nextChord`’s guide tones (3rd & 7th) and compute the nearest pitch-class resolution paths from `currentChord` (`0`, `±1`, `±2` semitones).
  - Return categorized pitch-class sets: `guideTones`, `resolutionTargets`, and `leadingPairs` (e.g., `F → E` for `G7 → Cmaj7`).

### 2.2 UI (`src/ui/Fretboard`)
- Add fretboard overlay toggle: `Off` | `Guide Tones (3rd/7th)` | `Target Next Chord`.
- Visual encoding (distinct from existing ringed tonic, teal chord tones, sand scale tones, dashed tensions):
  - **Guide Tones:** High-contrast badge/halo on 3rds and 7ths (`3` / `7` micro-label when degree mode is active).
  - **Target Next Chord (Lookahead):** During playback (or when hovering/selecting a bar), ghosted outline rings appear on the fretboard showing the **nearest guide tones of the next chord**—intensifying slightly on beats 3–4 before the change.

### 2.3 Tests & Verification
- Unit tests for `analyzeVoiceLeading`: `Dm7 → G7 → Cmaj7` (`F→F`, `C→B`; `B→B`, `F→E`), `iiø–V7–i`, and `6/9` / `sus4` edge cases.

---

## Milestone 3: Guitar Systems (CAGED / 3NPS / Shells), Tunings & Audition
**Goal:** Make the fretboard match how guitarists physically organize the neck and train their ear.

### 3.1 Tunings, Capo & Left-Handed Support (`src/theory/`, `src/ui/Fretboard`)
- Replace fixed standard-tuning open-string MIDI offsets with a `TuningProfile`:
  - Presets: `Standard (E-A-D-G-B-E)`, `Drop D`, `DADGAD`, `Open G`, `7-String (B-E-A-D-G-B-E)`, `4-String Bass (E-A-D-G)`.
  - Optional `capo` (`0–12`) adjusting playable fret range and open-string pitches.
  - Optional **Left-Handed Flip** (mirrors fret direction 24→0) in Fretboard controls.

### 3.2 Neck Shape Overlays (`src/theory/`, `src/ui/Fretboard`)
- Add shape filter selector alongside existing 8 fret position windows:
  - **CAGED Shapes (`C`, `A`, `G`, `E`, `D`):** Anchor shapes dynamically from the active chord/key root on strings 6/5/4.
  - **3-Notes-Per-String (3NPS):** Generate playable 3-note-per-string scale patterns across all 6 strings from the active scale.
  - **Shell Voicings:** Compute playable 3-note `R–3–7` and `R–7–3` chord grips (root on string 6 or string 5) and highlight them as compact chord boxes on the fretboard.

### 3.3 Click-to-Audition & Scale Preview (`src/audio/`, `src/ui/Fretboard`, `src/ui/Leadsheet`)
- Clicking any fret cell triggers a short plucked Jazz Guitar note (GM program 26/27 via `spessasynth_lib` or built-in synth fallback).
- Add a **"Hear Scale / Arp"** button on the active chord inspector/bar: plays ascending + descending 1-octave scale (or 1–3–5–7 arpeggio) synced cleanly without disrupting saved chart state.

### 3.4 Tests & Verification
- Unit tests verifying MIDI note calculation for Drop D, 7-string, 4-string bass, and capo offsets.
- Unit tests verifying every 3NPS string receives exactly 3 scale tones and shell voicings contain valid `R`, `3`, `7` within a ≤4-fret span.

---

## Milestone 4: Phone & Tablet "Music Stand" Layout
**Goal:** Make the app genuinely usable on a phone/tablet sitting on a music stand beside an amp.

### 4.1 Responsive Breakpoints & Stand Mode (`src/ui/`)
- Add responsive layout breakpoints (`< 768px` phone, `768–1024px` tablet) + an explicit **Stand Mode** toggle in `Header`.
- **Stand Mode layout:**
  - Sticky top transport bar with oversized Play/Pause, Tempo `-/+`, A–B Loop toggle, and Bar/Beat counter.
  - Large, high-contrast `Leadsheet` grid (2 or 4 bars per row on phone) that **auto-scrolls smoothly** to keep the active playback bar centered.
  - Compact single-window `Fretboard` strip docked below (auto-follows selected position window or active CAGED box, with pinch/swipe or quick button to switch windows).
  - Secondary panels (`Mixer`, `Keyboard`, `MidiBar`, modals) collapse into clean bottom sheets / tabs on small screens.
- Ensure touch targets ≥ 44×44px and prevent accidental chord editing while Stand Mode is locked (`Play Lock` toggle).

### 4.2 Verification
- Manual viewport testing at `390×844` (phone), `768×1024` (iPad portrait), and desktop `1440×900` across playback, A–B loop selection, and print view (ensure A4 landscape print CSS remains untouched).

---

## Milestone 5: Melody Entry & Rhythm Notation
**Goal:** Turn chord-only charts into complete leadsheets using the bundled Bravura SMuFL glyphs.

### 5.1 Chart & Arrangement Data Model (`src/chart/`, `src/arrange/`)
- Extend bar/beat model cleanly (backward-compatible with existing chord-only `.gsm.json` charts):
  - **Split-bar chords & rhythmic hits:** Allow beat/subdivision offsets (`beat: 1 | 1.5 | 2 | ...`) and optional rhythmic markers (`push`, `kick`, `stop`, `slash`).
  - **Melody layer:** Optional `MelodyNote[]` per bar (`{ pitchMidi | null (rest), startBeat, durationBeats, tieToNext?, lyric? }`).
- Update `.mid` export and playback scheduler (`src/arrange/`, `src/audio/`) so:
  - Comping/bass obey rhythmic kicks/stops when present.
  - Optional muted/toggleable **Lead Melody** track plays in `Mixer` and exports as an extra track in Format-1 `.mid`.

### 5.2 Editor & Engraving UI (`src/ui/Leadsheet`)
- Toggle per-chart or per-view: `Chords Only` | `Chords + Rhythm Slashes` | `Lead Sheet (Stave + Chords)`.
- Render treble stave using **Bravura** SMuFL glyphs (clef, key signature, time signature, rhythmic slashes, beams/stems/rests, ties).
- Simple melody entry workflow: click beat grid or record live via `Web MIDI` step-entry / `Keyboard` view.

### 5.3 Tests & Verification
- Unit tests for rhythmic subdivision quantization, tie/rest serialization in `.gsm.json`, and `.mid` export track integrity.

---

## Milestone 6: Live Microphone Pitch Detection → Fretboard
**Goal:** Light up the fretboard in real time from an acoustic or electric guitar via microphone/audio interface (mirroring Web MIDI for Keyboard).

### 6.1 Audio Pitch Pipeline (`src/audio/`)
- Add opt-in `MicPitchTracker` using Web Audio `getUserMedia` (with echoCancellation/noiseSuppression disabled for musical instruments) + `AudioWorklet` (fallback `AnalyserNode`) running **YIN autocorrelation**.
- Apply onset/clarity confidence threshold + light hysteresis/median smoothing so fret LEDs don't flicker on string harmonics or fret buzz.
- Support calibration offset (`A4 = 440Hz` default) and optional **live tuner readout** (`note + cents`).

### 6.2 Fretboard Live Highlighting (`src/ui/Fretboard`)
- Add a **Mic Input** toggle in `MidiBar` / `Fretboard` header (explicitly permission-gated; zero mic prompts until clicked).
- Highlight pitch-class matches (or exact octave positions when in a selected fret window) on `Fretboard` in real time, colour-coded against the active chord/scale:
  - **Chord tone** / **Guide tone** / **Scale tension** / **Outside note**.
- Zero impact on playback audio timing (runs off separate input `AudioContext` node / worklet).

### 6.3 Verification
- Unit tests on the pure-TS YIN pitch estimator using synthesized sine/plucked-harmonic test buffers (verify E2 `82.41Hz` through E5 `659.25Hz` within ±10 cents and silence rejection).