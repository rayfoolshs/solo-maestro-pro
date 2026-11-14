# Solo Maestro Pro

A practice companion for guitarists who want to solo over chord changes. You give it a
tune; it tells you **which scale to play over every chord** and shows you **where those
notes sit on the neck** — then plays the progression back so you can practise against it.

**v0.11.0** · [Play it live](https://rayfoolshs.github.io/solo-maestro-pro/) · made by
Ray Foo · [www.rayfooproductions.com](https://www.rayfooproductions.com)

![Solo Maestro Pro](guitar-solo-maestro-screen.jpg)

---

## The core idea

Most practice tools stop at backing tracks. This one pairs the track with the theory: every
chord gets a ranked chord-scale, labelled with *why* — "G Phrygian dominant · 5th mode of C
harmonic minor · adds B" — and the fretboard shows the tonic ringed, chord tones in teal and
passing notes muted.

## What you can do with it

**Enter a chart**

A leadsheet with chords above a stave and scale suggestions beneath. Click any beat to type
a chord (`B♭maj7`, `F#m7b5`, `C6/9`, `D/F#`), or drag across the chart to set an A–B loop.
Bars go from 4 to 64; the stepper hides and reveals them without destroying anything. The app
opens on **Blue Bossa** in C minor — two choruses, three flats on the stave. The `Chart ▾`
menu also loads **Autumn Leaves**, **Cantaloupe Island**, **Mr. P.C.** and **Misty**, and the
**Standards** button opens a bundled **Core 100** library with search and style/tag filters.
Transpose the whole chart from the mixer in semitone steps; click the offset to reset.

**Save and load**

The **Charts** button opens **My charts**: snapshot the working chart, then update, rename,
duplicate, reload or delete saved versions. Back up or share any chart as a versioned
`.gsm.json` file with **Export JSON**, and restore one with **Import JSON**. Saved charts
live in this browser's local storage; the working chart still autosaves separately.

**Take it elsewhere**

`Chart ▾ → Export MIDI…` writes a format-1 `.mid` of the current arrangement — separate
piano, bass and drums tracks, with tempo, meter and swing baked in — ready for a DAW or
notation app. If the chart has melody notes, an extra **Melody** track is included.

**Read the analysis**

- Key detection across all 24 keys, with a confidence score and an overridable key.
- **Local key centres** detect real modulations (Blue Bossa's D♭ bridge, for example) and
  let you pin or clear a key per bar.
- A scale per chord, ranked against the active local key, with borrowed-note flags and
  transition arrows showing how far each scale is from its neighbour.
- **Guide tones** (3rds and 7ths) and ghosted targets for the next chord help train
  voice-leading across barlines.
- One whole-progression recommendation, plus pentatonic and blues alternatives.

**See it on the neck**

A 24-fret fretboard with true fret spacing, oriented the way the neck looks in playing
position — low E on the bottom row up to high E on top. Tonic ringed in amber, chord tones
teal, other scale tones sand, tensions dashed. Degree or note labels, and eight position
windows (All, 1–5 … 17–24).

Choose **Standard E**, **Drop D**, **DADGAD**, **Open G**, **7-String** or **4-String Bass**,
add a capo, or mirror the neck for a left-handed player. Shape overlays filter the neck to a
CAGED box, a 3-notes-per-string pattern or compact shell voicings. Click any fret to hear a
plucked jazz-guitar note; **Hear scale** and **Hear arp** audition the current harmony.

**See it on the keyboard**

Toggle **Keyboard** to swap the fretboard for a piano view: three octaves of the suggested
scale on a grand stave (bass and treble clefs) with right-hand fingering, plus three octaves
of keyboard with the scale, chord tones and tonic highlighted. Connect a MIDI keyboard and
pick **Piano**, **Organ**, **Flute** or **Saxophone** (defaults to piano); the keys light up
as you play.

**Play it**

A General MIDI soundfont (GeneralUser GS, through Spessasynth's WASM synth) renders piano
comping — voice-led rootless voicings with per-style comping cycles — a bass line on the
roots with chromatic approaches, and drums in six feels:
**Jazz Swing**, **Jazz Ballad**, **Blues Shuffle**, **Rock**, **Funk** and **Bossa Nova**
— a real 3-2 son clave for bossa, 16th hats for funk, brushed swing for the ballad, and the
six-hit ride for jazz. Swing is adjustable for the two jazz feels; the shuffle is a fixed
12/8 feel. Switching style, swing, key or tempo while playing re-arranges from the next
bar. There is also a 0–100 % swing slider, tempo, count-in, loop, and a compact mixer with
per-part volume, mutes and a piano octave shifter. The keyboard view also plays a live
MIDI keyboard through the same soundfont, with a piano/organ/flute/saxophone choice.

**Write a lead sheet**

The Leadsheet always shows chords over a treble stave. Choose a pitch and length, then
click the stave to add melody notes; the same bar supports rests, ties, accidentals and
rhythmic markers. The Melody channel has its own mixer volume and mute, and melody notes
are included in the MIDI export.

**Take it on the stand**

**Stand** mode replaces the header with a large transport bar, switches the chart to 2 bars
per row on a phone or 4 on a tablet, follows the active bar with smooth auto-scroll, and
adds a compact fretboard strip plus a bottom dock for Chart, Fretboard, Mixer and Play Lock.
Lock prevents accidental chord or melody edits while you perform.

**Print it**

A4 landscape, one page, mirroring the on-screen leadsheet: title block, eight bars per
system, scale lane under each.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production bundle in dist/
npm test         # 154 theory, chart, arrangement, audio and UI-facing tests
```

## How it's built

React + TypeScript on Vite. The musical core — chord parsing, key detection, chord-scale
ranking, groove generation — is **pure TypeScript with no React and no audio**, covered by
unit tests. Playback is a lookahead scheduler over Web Audio. Deployed to GitHub Pages from
a public repo on every push.

```
src/
  theory/     pitch, chords, scales, keys, local key centres, guide tones, tunings, shapes, fretboard and keyboard mapping
  chart/      the document: Chart / Bar / ChordSlot / MelodyNote, notation helpers, Core 100 standards, JSON io, library
  arrange/    style descriptors, chart + style -> note events (comping, bass, drums, melody, swing)
  audio/      lookahead scheduler, built-in synth, Spessasynth soundfont, Web MIDI input, audition voice
  ui/         Header, Leadsheet, Mixer, Fretboard, Keyboard, MidiBar, StandBar, StandardsModal, ChartsModal, VersionModal
  version.ts  version + release history (drives the in-app modal)
tests/        theory + arrangement tests
```

## Still to come

Live microphone pitch detection (Milestone 6), live MIDI step entry for melody, and true
beam grouping for beamed rhythms. The remaining plan is in
[`Build Plan 1 and 2..md`](Build%20Plan%201%20and%202..md) and [`Build.md`](Build.md).

## Docs

- [`docs/`](docs/README.md) — user guide, visual theme, architecture, Core 100, chart format, MIDI export
- [`BUILD_PLAN.md`](BUILD_PLAN.md) — architecture, theory engine, arrangement, roadmap
- [`CHANGELOG.md`](CHANGELOG.md) — version history
- [`UPDATES.md`](UPDATES.md) — upcoming milestones

## Deployment

- Source: <https://github.com/rayfoolshs/solo-maestro-pro>
- Live: <https://rayfoolshs.github.io/solo-maestro-pro/>

Pushes to `main` run tests, build, and deploy to GitHub Pages via
`.github/workflows/deploy.yml`. The bundle uses a relative base, so it runs from any
sub-path.

## Credits

- Notation glyphs: **Bravura** (Steinberg, SIL OFL)
- Chord lettering: **MuseJazzText** (MuseScore, SIL OFL)
- Soundfont: **GeneralUser GS** by S. Christian Collins
- Synth: **spessasynth_lib** (Apache-2.0)
- Default tune: *Blue Bossa* by Kenny Dorham (chord changes only)
