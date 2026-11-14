# Solo Maestro Pro — Implementation Plan

Base: `guitar-solo-maestro` v0.10.0 (`src/theory/`, `src/chart/`, `src/arrange/`, `src/audio/`, `src/ui/`).
Rule: Keep all music theory, chart parsing, and arrangement logic in pure TypeScript (`src/theory/`, `src/chart/`, `src/arrange/`) with zero React/Web Audio dependencies, and keep `npm test` green at every phase.

> **Status (v0.11.0):** Phase 0 and the theory, fretboard, arrangement-realisation,
> lead-sheet and Music Stand work are shipped. Remaining: live microphone pitch detection,
> live MIDI melody step entry, true beam grouping, iReal Pro import/share links, and
> soundfont caching. See `CHANGELOG.md`.

---

## Phase 0: Rebrand & Deploy Config
- Update app title, manifest/HTML `<title>`, `Header`, `VersionModal`, and `.gsm.json` metadata/branding to **Solo Maestro Pro** (keep backward-compatible import for existing `.gsm.json` files).
- Update Vite `base` config to `/solo-maestro-pro/` for GitHub Pages deployment via `.github/workflows/deploy.yml`.

## Phase 1: Theory Engine & Local Key Centres (`src/theory/`, `src/chart/`, `src/ui/Leadsheet`)
1. **Local Modulation / Key-Centre Segmentation**
   - Build a segmented key-centre analyzer in `src/theory/` using windowed cadence detection (`ii–V–I`, `iiø–V7–i`, `V7–I`) + dynamic programming transition penalty so it detects genuine modulations (e.g. *Blue Bossa* bars 9–12 in D♭ major) without flip-flopping every bar.
   - Output spans `{ startBar, endBar, tonic, mode, confidence, isUserPinned }`.
   - Update scale ranking and borrowed-note flags to evaluate against the active local key centre (with an option to pin/override a bar's local key in `Leadsheet`).
   - Display subtle local key brackets/badges above `Leadsheet` bars where the key centre shifts.
2. **Harmonic Substitutions & Guide-Tone Targets**
   - Compute 3rd, 7th, and nearest voice-leading resolution targets to the *next* chord event (`resolveToNext`), plus optional improviser substitutions (tritone sub, backdoor dominant, diminished passing).
   - Add unit tests in `src/theory/` covering *Blue Bossa* (C minor → D♭ major → C minor), *Autumn Leaves*, and *All The Things You Are*.

## Phase 2: Guitar-Centric Fretboard & Tuning (`src/theory/`, `src/ui/Fretboard`)
1. **Tunings & Instrument Profiles**
   - Parameterize fretboard pitch mapping by tuning preset: Standard E, Drop D, DADGAD, Open G, 7-String (B-E-A-D-G-B-E), 4-String Bass (E-A-D-G), plus optional Capo offset.
2. **Overlay Modes in `Fretboard`**
   - Add toggleable overlays alongside existing position windows (`All`, `1–5` … `17–24`):
     - **Guide Tones (3rds & 7ths):** Distinct highlight for 3rds/7ths + ghosted outline of the *next* bar's nearest resolution targets during the second half of the current bar.
     - **CAGED / 3NPS Shapes:** Filter/highlight scale tones belonging to the active CAGED shape or 3-notes-per-string box.
     - **Shell Voicings:** Highlight playable `R–3–7` / `R–7–3` grips on string sets 6-4-3 and 5-4-3.
3. **Click-to-Audition & Scale Preview**
   - Clicking any fret note triggers a short plucked/jazz-guitar audition note via `src/audio/`.
   - Add a "Hear Scale / Arp" action per bar to audition the top-ranked scale or chord arpeggio over the current chord.

## Phase 3: Arrangement Realism, Imports & Shareable Links (`src/arrange/`, `src/chart/`, `src/ui/ChartsModal`)
1. **True Walking Bass (`src/arrange/`)**
   - Upgrade Jazz Swing / Jazz Ballad bass from roots + chromatic approaches to a 4-beat walking line: root on beat 1, chord tone/fifth on beat 3, diatonic/chromatic passing tones on beats 2 & 4 targeting the next bar's root within comfortable bass range.
2. **Chorus Dynamics & Guitar Comping**
   - Add optional multi-chorus arrangement variation (Chorus 1 sparser/brushes, Chorus 2+ fuller ride/comping) and an optional **Rhythm Guitar (Freddie Green / Acoustic)** comping voice in `Mixer`.
   - Support section labels (`[A]`, `[B]`, `[C]`, `Bridge`, `Tag`) in charts and `Leadsheet`.
3. **iReal Pro (`irealbook://` / HTML) Importer & Shareable URLs**
   - Add a pure-TS iReal Pro parser in `src/chart/` (deobfuscate/decode standard iReal chord strings, bars, repeats, and key/style metadata into internal `Chart` format) with unit tests.
   - Encode/decode chart + tempo + key + A–B loop into compressed URL hash (`#c=...`) so any custom chart can be shared as a single link.

## Phase 4: Practice Modes, Live Mic Pitch, Audio UX & Mobile Stand Mode (`src/audio/`, `src/ui/`)
1. **Practice Modes (in `Header` / transport controls)**
   - **Tempo Ramp:** Start BPM → Target BPM, increment `+N` BPM every `M` loops.
   - **Trading 4s / Call & Response:** Play a generated guide-tone/arpeggio solo line for 4 bars, then rhythm-section-only for 4 bars.
   - **Ear / Blind Mode:** Hide chord symbols and/or scale names until beat 1 (or reveal on click).
   - **2 & 4 / Gap-Click Metronome:** Optional hi-hat on 2 & 4 only, or silent bar gaps for time-feel practice.
2. **Live Microphone Pitch Detection (`src/audio/` → `Fretboard`)**
   - Add an opt-in "Mic Tuner / Live Neck" toggle using Web Audio `AnalyserNode` / `AudioWorklet` (YIN pitch detection).
   - Light up detected guitar pitch on `Fretboard` in real time, color-coded as chord tone, scale/tension, or outside note.
3. **Soundfont Caching (`src/audio/`)**
   - Cache the GeneralUser GS `.sf2` in IndexedDB / Cache API after first fetch; start playback immediately with the built-in synth if the SF2 is still downloading, then hot-swap smoothly.
4. **Responsive "Music Stand" Layout (`src/ui/`)**
   - Add a mobile/tablet breakpoint and dedicated **Stand Mode** toggle: large high-contrast chord grid with smooth auto-scroll to active bar, compact single-octave/window fretboard strip, and oversized Touch Play / Loop / Tempo buttons.

---

## Verification Gate
After every phase:
1. Run `npm test` (all existing 103 tests + new unit tests must pass).
2. Run `npm run build` (zero TypeScript or Vite bundling errors).
3. Smoke-test playback, MIDI export, `.gsm.json` import/export, and mobile viewport layout in browser.
