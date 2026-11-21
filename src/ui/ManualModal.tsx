import { useEffect, useRef, useState } from 'react';
import { VERSION } from '../version';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SECTIONS = [
  { id: 'start', title: 'Getting started' },
  { id: 'header', title: 'Header & transport' },
  { id: 'mixer', title: 'Mixer & loop' },
  { id: 'leadsheet', title: 'Leadsheet' },
  { id: 'scales', title: 'Scale suggestions' },
  { id: 'stand', title: 'Music Stand mode' },
  { id: 'fretboard', title: 'Fretboard' },
  { id: 'keyboard', title: 'Keyboard & MIDI' },
  { id: 'why', title: 'Why lane' },
  { id: 'charts', title: 'Charts & files' },
  { id: 'shortcuts', title: 'Keyboard shortcuts' },
  { id: 'trouble', title: 'Troubleshooting' },
] as const;

/**
 * In-app manual. Kept deliberately hand-written rather than rendered from
 * docs/USER-GUIDE.md so the copy can point at controls exactly as they appear
 * on screen.
 */
export function ManualModal({ open, onClose }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    setActive(SECTIONS[0].id);
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [open]);

  if (!open) return null;

  const go = (id: string) => {
    const body = bodyRef.current;
    const el = body?.querySelector<HTMLElement>(`#manual-${id}`);
    if (body && el) {
      const top = el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
      body.scrollTo({ top: top - 8, behavior: 'auto' });
      setActive(id);
    }
  };

  const onScroll = () => {
    const body = bodyRef.current;
    if (!body) return;
    // The last section can never reach the top of the scroll area, so treat
    // "at the bottom" as the last section instead of the last one that fits.
    if (body.scrollTop + body.clientHeight >= body.scrollHeight - 2) {
      setActive(SECTIONS[SECTIONS.length - 1].id);
      return;
    }
    const top = body.getBoundingClientRect().top + 24;
    let current: string = SECTIONS[0].id;
    for (const section of SECTIONS) {
      const el = body.querySelector<HTMLElement>(`#manual-${section.id}`);
      if (el && el.getBoundingClientRect().top <= top) current = section.id;
    }
    setActive(current);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal manual"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-title"
      >
        <div className="modal-head">
          <div>
            <h2 id="manual-title">Manual</h2>
            <p>Solo Maestro Pro v{VERSION} · everything the app can do</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close manual">×</button>
        </div>

        <div className="manual-main">
          <nav className="manual-nav" aria-label="Manual contents">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                className={active === section.id ? 'on' : ''}
                aria-current={active === section.id ? 'true' : undefined}
                onClick={() => go(section.id)}
              >
                {section.title}
              </button>
            ))}
          </nav>

          <div className="manual-body" ref={bodyRef} onScroll={onScroll}>
            <section id="manual-start">
              <h3>Getting started</h3>
              <p>
                Solo Maestro Pro tells you which scale to play over every chord, shows it on
                the neck and keyboard, and plays the changes back so you can practise.
              </p>
              <ul>
                <li>The app reopens your last chart from this browser, or Autumn Leaves on a fresh install.</li>
                <li>Open <b>Standards</b> for the Core 100 library, or <b>Chart ▾</b> for the built-in presets.</li>
                <li>Check <b>Key</b>, <b>Tempo</b> and <b>Style</b> in the header, then press <b>Play</b>.</li>
                <li>Loop is <b>off</b> to begin with. Drag across the chart, or use the Loop panel under the mixer, to repeat bars.</li>
                <li>Click any chord to see why the suggested scale fits in the why lane below the chart.</li>
              </ul>
            </section>

            <section id="manual-header">
              <h3>Header &amp; transport</h3>
              <table className="manual-table">
                <tbody>
                  <tr><th>Key</th><td>Auto-detected key. Pick any of the 24 keys to override it; <b>auto</b> shows the detector's confidence.</td></tr>
                  <tr><th>Tempo</th><td>40–220 bpm. A change made while playing takes effect from the next bar.</td></tr>
                  <tr><th>Style</th><td>Jazz Swing, Jazz Ballad, Blues Shuffle, Rock, Funk or Bossa Nova.</td></tr>
                  <tr><th>Chart ▾</th><td>Presets, new/empty chart, both chart libraries, MIDI export, clear chords and Fit/Comfort.</td></tr>
                  <tr><th>New</th><td>A blank 4-bar leadsheet. Asks first if the working chart already has chords.</td></tr>
                  <tr><th>Charts</th><td>My charts — saved snapshots plus JSON backup and restore.</td></tr>
                  <tr><th>Standards</th><td>The bundled Core 100 standards, searchable and filterable.</td></tr>
                  <tr><th>Stand</th><td>Music Stand mode for phones and tablets, with a large transport and Play Lock.</td></tr>
                  <tr><th>Print</th><td>Prints the leadsheet as A4 landscape, 8 bars per system.</td></tr>
                  <tr><th>Manual</th><td>This guide. Also opens with <kbd>?</kbd>.</td></tr>
                  <tr><th>Play / Stop</th><td>Starts playback at the selected bar; Stop returns to the start of the current range. Space does the same.</td></tr>
                </tbody>
              </table>
            </section>

            <section id="manual-mixer">
              <h3>Mixer &amp; loop</h3>
              <p>The mixer panel on the left carries the transport and the whole mix.</p>
              <ul>
                <li><b>Play</b> and tempo ±5.</li>
                <li><b>Style</b> selector — the same six feels as the header.</li>
                <li><b>Piano · Bass · Drums · Melody</b> volume sliders and mute buttons. Melody controls the leadsheet melody channel.</li>
                <li><b>Transpose</b> −/+ moves the whole chart a semitone; click the number to reset. Chords, key and analysis follow.</li>
                <li><b>Oct</b> shifts the piano voicing by up to two octaves.</li>
                <li><b>Swing</b> 0–100% for the swing and shuffle feels; other styles ignore it.</li>
              </ul>
              <table className="manual-table">
                <tbody>
                  <tr><th>Jazz Swing</th><td>132 bpm · swung eighths, ride cymbal and walking bass</td></tr>
                  <tr><th>Jazz Ballad</th><td>66 bpm · sparse sustained voicings and brushes</td></tr>
                  <tr><th>Blues Shuffle</th><td>120 bpm · fixed 12/8 triplet feel, 1–5–6–♭7 bass</td></tr>
                  <tr><th>Rock</th><td>120 bpm · straight eighths, power chords and backbeat</td></tr>
                  <tr><th>Funk</th><td>100 bpm · straight 16ths, clav-style stabs and syncopated bass</td></tr>
                  <tr><th>Bossa Nova</th><td>140 bpm · 3-2 son clave, shaker and surdo kick</td></tr>
                </tbody>
              </table>
              <p><b>Loop</b>, directly under the mixer:</p>
              <ul>
                <li><b>Off</b> — the default. Plays from the selected bar to the end of the chart.</li>
                <li><b>Visible</b> — repeats the bars currently on screen.</li>
                <li><b>A–B</b> — repeats the range set by the A and B steppers.</li>
                <li>Drag across the chart (chords, stave or scale lane) to set A–B in one gesture.</li>
                <li><kbd>L</kbd> toggles the loop between Off and Visible.</li>
              </ul>
            </section>

            <section id="manual-leadsheet">
              <h3>Leadsheet</h3>
              <ul>
                <li><b>Chords</b> — click a beat to type a symbol, then <kbd>Enter</kbd> to commit or <kbd>Esc</kbd> to cancel. Most jazz symbols work: <code>Cmaj7</code>, <code>B♭maj7</code>, <code>F#m7b5</code>, <code>D/F#</code>, <code>A7♭9</code>, <code>Falt</code>, <code>C6/9</code> and more.</li>
                <li><b>Selection</b> — a click selects that bar and its chord. Shift to another beat to edit it.</li>
                <li><b>Local key badges</b> — the amber badge above each system names the detected key centre. Click it (or right-click a bar) to pin a key from that bar or clear a pinned key.</li>
                <li><b>Bar numbers</b> — every bar is numbered below the staff, aligned to its bar line.</li>
                <li><b>Bar count</b> — the <b>− / +</b> stepper changes the visible bars (4–64). Hidden bars keep their chords.</li>
                <li><b>Fit / Comfort</b> — 8 or 4 bars per system.</li>
                <li><b>Loop</b> — drag across the chart to set an A–B range; a single click loops one bar.</li>
                <li><b>Melody</b> — choose <b>Pitch</b> and <b>Length</b>, optionally arm <b>Tie next</b>, then click the stave to add notes. Click a note to remove it; <b>Clear bar</b> empties the selected bar. Rests are a pitch of Rest.</li>
                <li><b>Playhead</b> — the sounding bar is tinted and the beat dots light up as it plays.</li>
              </ul>
            </section>

            <section id="manual-scales">
              <h3>Scale suggestions</h3>
              <p>
                Under every bar the scale lane names the recommended scale for that chord —
                for example <b>C Dorian</b> or <b>D Phrygian dominant</b>.
              </p>
              <ul>
                <li><code>+n</code> counts alternative scales. Click the cell to select the chord and inspect them in the why lane.</li>
                <li>The arrow between cells rates the voice-leading to the next chord: <b>→</b> is a smooth change, <b>↗</b> needs more care.</li>
                <li>Clicking a chord selects it; the fretboard, keyboard and why lane follow.</li>
              </ul>
            </section>

            <section id="manual-stand">
              <h3>Music Stand mode</h3>
              <p>
                <b>Stand</b> in the header switches to a phone/tablet practice layout. The screen
                shows a large transport bar with Play/Stop, tempo −/+, a loop toggle and a
                bar/beat counter. The chart follows playback with smooth auto-scroll.
              </p>
              <ul>
                <li>2 bars per row on a phone, 4 on a tablet.</li>
                <li>A compact fretboard strip sits below the chart with quick position buttons.</li>
                <li>The bottom dock jumps to <b>Chart</b> or <b>Fretboard</b>, opens the <b>Mixer</b> in a bottom sheet, or enables <b>Lock</b>.</li>
                <li><b>Lock</b> prevents accidental chord and melody edits while you perform.</li>
                <li><b>Exit</b> returns to the normal editor.</li>
              </ul>
            </section>

            <section id="manual-fretboard">
              <h3>Fretboard</h3>
              <ul>
                <li>24 frets drawn as the neck looks in playing position: low E on the bottom row.</li>
                <li><b>Tonic</b> is ringed, chord tones are teal, other scale tones are sand and tensions are dashed.</li>
                <li><b>Degrees / Notes</b> switches between scale degrees and note names; <b>Tensions</b> shows or hides the colour tones.</li>
                <li><b>Position</b> windows narrow the neck to one area; <b>All</b> shows the whole neck.</li>
                <li><b>Guide-tone overlay</b> — <b>Off</b>, <b>3/7</b> for the current chord's 3rd and 7th (or 6th/4th where appropriate), or <b>→ next</b> to add ghosted rings on the next chord's nearest resolution targets. The guide bar names the pairs.</li>
                <li><b>Tuning</b> — Standard E, Drop D, DADGAD, Open G, 7-String or 4-String Bass — plus <b>Capo</b> 0–12 and a <b>Left-handed</b> mirror.</li>
                <li><b>Shape</b> — CAGED boxes, 3-notes-per-string patterns or R–3–7 / R–7–3 shell voicings.</li>
                <li>Click any fret to hear a short jazz-guitar pluck. <b>Hear scale</b> and <b>Hear arp</b> audition the selected scale or chord in the chord inspector.</li>
              </ul>
            </section>

            <section id="manual-keyboard">
              <h3>Keyboard &amp; MIDI</h3>
              <ul>
                <li>Toggle <b>Keyboard</b> in the board header to see the scale on a piano instead of the neck.</li>
                <li>Three octaves are written on a grand stave — bass clef below middle C, treble above — with right-hand fingering.</li>
                <li>The tonic, chord tones and other scale tones use the same colours as the fretboard.</li>
                <li>Turn on <b>MIDI</b>, pick your device, then choose <b>Piano</b>, <b>Organ</b>, <b>Flute</b> or <b>Saxophone</b>. The keys and stave light up while you hold notes.</li>
                <li><kbd>A</kbd>–<kbd>K</kbd> on the computer keyboard and clicking keys both work when Web MIDI is unavailable.</li>
                <li>Web MIDI needs a supporting browser (Chrome or Edge) and a secure context — localhost or HTTPS.</li>
              </ul>
            </section>

            <section id="manual-why">
              <h3>Why lane</h3>
              <p>
                The strip under the leadsheet explains the selected chord: the recommended scale,
                its degrees, the parent scale it comes from and why it fits the chord. Compare
                alternatives there, or use <b>Hear scale</b> and <b>Hear arp</b> to audition them
                before committing.
              </p>
            </section>

            <section id="manual-charts">
              <h3>Charts &amp; files</h3>
              <ul>
                <li><b>Autosave</b> — the working chart is saved in this browser on every edit.</li>
                <li><b>My charts</b> — save named snapshots, then <b>Load</b>, <b>Update</b>, <b>Rename</b>, <b>Duplicate</b> or <b>Delete</b>. Up to 100 charts.</li>
                <li><b>Export JSON / Import JSON</b> — move charts between devices or keep a backup (<code>name.gsm.json</code>).</li>
                <li><b>Export MIDI</b> — downloads the visible bars as a Standard MIDI File: piano, bass, drums and an optional melody track.</li>
                <li><b>Print</b> — A4 landscape with the title block, chords, stave, bar numbers, scale lane and summary. The Mixer and loop panel are left off the page.</li>
              </ul>
            </section>

            <section id="manual-shortcuts">
              <h3>Keyboard shortcuts</h3>
              <table className="manual-table">
                <tbody>
                  <tr><th><kbd>Space</kbd></th><td>Play / stop</td></tr>
                  <tr><th><kbd>L</kbd></th><td>Loop Off ↔ Visible</td></tr>
                  <tr><th><kbd>?</kbd></th><td>Open this manual</td></tr>
                  <tr><th><kbd>Esc</kbd></th><td>Close the manual, a dialog or a menu</td></tr>
                  <tr><th><kbd>A</kbd>–<kbd>K</kbd></th><td>Play notes on the on-screen keyboard</td></tr>
                </tbody>
              </table>
            </section>

            <section id="manual-trouble">
              <h3>Troubleshooting</h3>
              <ul>
                <li><b>No sound</b> — press Play (browsers start audio only after a gesture), check the mixer mutes and channel volumes, and check the system volume. The chip beside <b>Mixer</b> shows the soundfont state: <b>GM</b> ready, a percentage while downloading, or <b>Synth</b> as a fallback.</li>
                <li><b>First playback is quiet</b> — the General MIDI soundfont downloads on first use; until it is ready the built-in synth plays.</li>
                <li><b>MIDI keyboard not found</b> — use Chrome or Edge over HTTPS or localhost, allow MIDI access, and reconnect the device.</li>
                <li><b>Print looks different</b> — printing always uses A4 landscape with 8 bars per system, regardless of the on-screen view.</li>
                <li><b>Charts disappeared</b> — chart storage belongs to the browser and site origin; clearing site data or private browsing removes it. Keep JSON backups for anything you care about.</li>
              </ul>
              <p className="modal-foot">
                The developer-facing guide lives in <code>docs/USER-GUIDE.md</code>; this manual
                mirrors the controls in the build you are using (v{VERSION}).
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
