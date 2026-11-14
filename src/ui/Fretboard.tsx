import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Candidate } from '../theory/suggest';
import { degreeOf, noteX, rowY, FRET_COUNT } from '../theory/fretboard';
import { midiToName, pcName } from '../theory/pitch';
import { TUNINGS, tuningById, type TuningId } from '../theory/tunings';
import {
  bestShellGrips,
  cagedShape,
  selectThreeNpsPattern,
  shellTonePcs,
  shellVoicings,
  threeNpsPatterns,
  type CagedShapeId,
  type FretPoint,
  type ShapeBox,
} from '../theory/shapes';
import type { ParsedChord } from '../theory/chords';
import type { GuideRole, VoiceLeadingAnalysis } from '../theory/voiceLeading';
import { engine } from '../audio/engine';
import { midiInput, programOf, type MidiInputStatus, type MidiInstrumentId } from '../audio/midiInput';
import { midiForKey } from '../audio/computerKeys';
import { Keyboard } from './Keyboard';
import { MidiBar } from './MidiBar';

type OverlayMode = 'off' | 'guide' | 'target';
type ShapeMode = 'off' | CagedShapeId | '3nps' | 'shells';

interface Props {
  candidate: Candidate | null;
  chordPcs: number[];
  currentChord: ParsedChord | null;
  rootPc: number;
  flats: boolean;
  tensions: boolean;
  onToggleTensions: () => void;
  voiceLeading: VoiceLeadingAnalysis | null;
  barIndex: number;
  playingBar: number;
  playBeat: number;
}

const W = 1000;
const H = 186;
const NUT = 58;
const END = W - 12;

const GUIDE_SHORT: Record<GuideRole, string> = {
  '3rd': '3',
  '7th': '7',
  '6th': '6',
  '4th': '4',
  '2nd': '2',
};

const POSITIONS = [
  { label: 'All', from: 0, to: 24 },
  { label: '1–5', from: 1, to: 5 },
  { label: '3–7', from: 3, to: 7 },
  { label: '5–9', from: 5, to: 9 },
  { label: '8–12', from: 8, to: 12 },
  { label: '10–15', from: 10, to: 15 },
  { label: '12–17', from: 12, to: 17 },
  { label: '17–24', from: 17, to: 24 },
];

function Legend({ showGuide = false, showShape = false }: { showGuide?: boolean; showShape?: boolean }) {
  return (
    <div className="legend">
      <span><i className="sw tonic" />Tonic</span>
      <span><i className="sw chord" />Chord tones</span>
      <span><i className="sw scale" />Scale tones</span>
      <span><i className="sw tension" />Tension</span>
      {showGuide && <span><i className="sw guide" />Guide</span>}
      {showGuide && <span><i className="sw target" />Next</span>}
      {showShape && <span><i className="sw shape" />Shape</span>}
    </div>
  );
}

export function Fretboard({ candidate, chordPcs, currentChord, rootPc, flats, tensions, onToggleTensions, voiceLeading, barIndex, playingBar, playBeat }: Props) {
  const [mode, setMode] = useState<'degrees' | 'notes'>('degrees');
  const [overlay, setOverlay] = useState<OverlayMode>('off');
  const [shapeMode, setShapeMode] = useState<ShapeMode>('off');
  const [tuningId, setTuningId] = useState<TuningId>('standard');
  const [capo, setCapo] = useState(0);
  const [leftHanded, setLeftHanded] = useState(false);
  const [pos, setPos] = useState(0);
  const [view, setView] = useState<'fretboard' | 'keyboard'>('fretboard');
  const [midi, setMidi] = useState<MidiInputStatus>(() => midiInput.getStatus());
  const [instrument, setInstrument] = useState<MidiInstrumentId>('piano');
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [auditionAt, setAuditionAt] = useState<{ si: number; fret: number } | null>(null);
  const held = useRef<Set<number>>(new Set());
  const auditionTimer = useRef<number | null>(null);
  const scaleIntervals = candidate?.scale.intervals ?? [];
  const inScale = new Set(candidate?.pcs ?? []);
  const chordSet = new Set(chordPcs);
  const guideRoles = new Map<number, GuideRole>(
    (voiceLeading?.guideTones ?? []).map((tone) => [tone.pc, tone.role]),
  );
  const targetPcs = new Set(voiceLeading?.resolutionTargets ?? []);
  const targetOpacity = playingBar === barIndex && barIndex >= 0
    ? playBeat >= 2 ? 0.95 : 0.52
    : 0.82;

  const tuning = tuningById(tuningId);
  const openStrings = useMemo(
    () => tuning.openStrings.map((open) => open + capo),
    [tuning, capo],
  );
  const rowCount = openStrings.length;
  const maxFret = Math.max(1, FRET_COUNT - capo);
  const rawWindow = POSITIONS[pos] ?? POSITIONS[0];
  const fretWindow = { ...rawWindow, to: Math.min(rawWindow.to, maxFret) };
  const flipX = useCallback((x: number) => (leftHanded ? W - x : x), [leftHanded]);

  const shapeOverlay = useMemo(() => {
    if (shapeMode === 'off' || !candidate || !candidate.pcs.length) return null;

    if (shapeMode === '3nps') {
      const pattern = selectThreeNpsPattern(
        threeNpsPatterns(openStrings, candidate.pcs, maxFret),
        fretWindow.from,
        fretWindow.to,
      );
      return pattern
        ? { positions: pattern.positions, boxes: [pattern.box], roles: new Map<string, string>() }
        : null;
    }

    if (shapeMode === 'shells') {
      if (!currentChord) return null;
      const tones = shellTonePcs(currentChord);
      if (!tones) return null;
      const grips = bestShellGrips(
        shellVoicings(openStrings, tones.rootPc, tones.thirdPc, tones.seventhPc, maxFret),
      );
      if (!grips.length) return null;
      const roles = new Map<string, string>();
      const positions: FretPoint[] = [];
      for (const grip of grips) {
        for (const point of grip.positions) {
          positions.push(point);
          if (point.role) roles.set(`${point.stringIndex}:${point.fret}`, point.role);
        }
      }
      return { positions, boxes: grips.map((grip) => grip.box), roles };
    }

    const result = cagedShape(openStrings, rootPc, candidate.pcs, shapeMode, {
      maxFret,
      preferFret: (fretWindow.from + fretWindow.to) / 2,
    });
    return result
      ? { positions: result.positions, boxes: [result.box], roles: new Map<string, string>() }
      : null;
  }, [shapeMode, candidate, currentChord, openStrings, maxFret, fretWindow.from, fretWindow.to, rootPc]);

  const shapePoints = useMemo(
    () => new Map((shapeOverlay?.positions ?? []).map((point) => [`${point.stringIndex}:${point.fret}`, point])),
    [shapeOverlay],
  );

  useEffect(() => {
    if (POSITIONS[pos].from > maxFret) setPos(0);
  }, [maxFret, pos]);

  useEffect(() => () => {
    if (auditionTimer.current !== null) window.clearTimeout(auditionTimer.current);
  }, []);

  const audition = (si: number, fret: number) => {
    engine.audition(openStrings[si] + fret);
    setAuditionAt({ si, fret });
    if (auditionTimer.current !== null) window.clearTimeout(auditionTimer.current);
    auditionTimer.current = window.setTimeout(() => setAuditionAt(null), 260);
  };

  useEffect(() => midiInput.subscribe(setMidi), []);

  const pressNote = useCallback((midi: number, velocity = 100) => {
    if (held.current.has(midi)) return;
    held.current.add(midi);
    engine.playNoteOn(midi, velocity, programOf(instrument));
    setActiveNotes((prev) => new Set(prev).add(midi));
  }, [instrument]);

  const releaseNote = useCallback((midi: number) => {
    if (!held.current.delete(midi)) return;
    engine.noteOff(midi);
    setActiveNotes((prev) => {
      const next = new Set(prev);
      next.delete(midi);
      return next;
    });
  }, []);

  const releaseAll = useCallback(() => {
    held.current.forEach((midi) => engine.noteOff(midi));
    held.current.clear();
    setActiveNotes(new Set());
  }, []);

  useEffect(() => {
    if (!midi.enabled) return;
    return midiInput.onNote((note) => {
      if (note.allOff) {
        releaseAll();
        return;
      }
      if (note.on) pressNote(note.midi, note.velocity);
      else releaseNote(note.midi);
    });
  }, [midi.enabled, pressNote, releaseNote, releaseAll]);

  // Computer-keyboard fallback while the keyboard view is open: A–K plays C4–C5.
  useEffect(() => {
    if (view !== 'keyboard') return;
    const down = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
        || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const midi = midiForKey(e.key);
      if (midi === null) return;
      e.preventDefault();
      pressNote(midi);
    };
    const up = (e: KeyboardEvent) => {
      const midi = midiForKey(e.key);
      if (midi !== null) releaseNote(midi);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      releaseAll();
    };
  }, [view, pressNote, releaseNote, releaseAll]);

  const toggleMidi = () => {
    if (midi.enabled) {
      releaseAll();
      midiInput.disable();
    } else {
      void engine.prepareSoundfont();
      void midiInput.enable();
    }
  };

  const topY = rowY(rowCount - 1, rowCount);
  const bottomY = rowY(0, rowCount);
  const rowSpacing = rowCount > 1 ? (bottomY - topY) / (rowCount - 1) : 26;
  const centerY = (topY + bottomY) / 2;
  const markerYs = rowCount >= 6 ? [centerY - rowSpacing / 2, centerY + rowSpacing / 2] : [centerY];
  const boardBottom = bottomY + 12;
  const fretNumberY = boardBottom + 11;

  return (
    <section className="card board">
      <div className="boardhead">
        <div>
          <div className="ttl">{view === 'fretboard' ? 'Fretboard' : 'Keyboard'}</div>
          <div className="sub">
            {candidate ? (
              <>
                <b>{candidate.name}</b> · {candidate.degrees} ·{' '}
                {view === 'fretboard' ? (
                  <>tonic <b>{midiToName(60 + rootPc, flats).replace(/\d/g, '')}</b> ringed</>
                ) : (
                  <>right-hand fingering</>
                )}
              </>
            ) : (
              'Select a chord'
            )}
          </div>
        </div>
        <div className="spacer" />
        <div className="seg">
          <button className={mode === 'degrees' ? 'on' : ''} onClick={() => setMode('degrees')}>Degrees</button>
          <button className={mode === 'notes' ? 'on' : ''} onClick={() => setMode('notes')}>Notes</button>
        </div>
        {view === 'fretboard' && (
          <div className="seg ovlseg" role="group" aria-label="Guide-tone overlay">
            <button
              className={overlay === 'off' ? 'on' : ''}
              onClick={() => setOverlay('off')}
              title="No guide-tone overlay"
            >
              Off
            </button>
            <button
              className={overlay === 'guide' ? 'on' : ''}
              onClick={() => setOverlay('guide')}
              title="Highlight the current chord's 3rds and 7ths"
            >
              3/7
            </button>
            <button
              className={overlay === 'target' ? 'on' : ''}
              onClick={() => setOverlay('target')}
              title="Guide tones plus the next chord's nearest resolution targets"
            >
              → next
            </button>
          </div>
        )}
        <button className={`chip btn${tensions ? ' active' : ''}`} onClick={onToggleTensions}>
          <span className="dashdot" /> Tensions
        </button>
        <button
          className={`kswitch${view === 'keyboard' ? ' on' : ''}`}
          role="switch"
          aria-checked={view === 'keyboard'}
          onClick={() => setView((v) => (v === 'fretboard' ? 'keyboard' : 'fretboard'))}
        >
          <span className="track"><i /></span>
          Keyboard
        </button>
      </div>

      {view === 'keyboard' ? (
        <>
          <MidiBar
            status={midi}
            instrument={instrument}
            onToggle={toggleMidi}
            onSelectDevice={(id) => midiInput.select(id)}
            onSelectInstrument={setInstrument}
          />
          <Keyboard
            candidate={candidate}
            chordPcs={chordPcs}
            rootPc={rootPc}
            flats={flats}
            tensions={tensions}
            mode={mode}
            activeNotes={activeNotes}
            onNoteOn={pressNote}
            onNoteOff={releaseNote}
          />
          <div className="foot">
            <div className="spacer" />
            <Legend />
          </div>
        </>
      ) : (
        <>
          <div className="boardwrap">
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" role="img" aria-label="Fretboard">
              <rect x="0" y="0" width={W} height={H} rx="9" fill="#FDFBF6" pointerEvents="none" />
              <rect x="0.5" y="0.5" width={W - 1} height={boardBottom + 0.5} rx="9" fill="none" stroke="#EFE9DC" pointerEvents="none" />

              {[3, 5, 7, 9, 15, 17, 19, 21].map((f) => (
                <circle key={f} cx={flipX(noteX(f, NUT, END))} cy={centerY} r={4} fill="#E7E0D0" pointerEvents="none" />
              ))}
              {[12, 24].map((f) => (
                <g key={f}>
                  {markerYs.map((y, i) => (
                    <circle key={i} cx={flipX(noteX(f, NUT, END))} cy={y} r={4} fill="#E7E0D0" pointerEvents="none" />
                  ))}
                </g>
              ))}

              {Array.from({ length: FRET_COUNT }).map((_, i) => {
                const f = i + 1;
                const xRight = noteX(f, NUT, END) + (noteX(f + 1, NUT, END) - noteX(f, NUT, END)) / 2;
                return (
                  <line
                    key={f}
                    x1={flipX(xRight)} y1={topY - 12} x2={flipX(xRight)} y2={boardBottom}
                    stroke={f === 12 ? '#B9AF9B' : '#D8D0BF'}
                    strokeWidth={f === 12 ? 1.4 : 1}
                    opacity={f <= maxFret && f >= fretWindow.from && f <= fretWindow.to ? 1 : 0.35}
                    pointerEvents="none"
                  />
                );
              })}

              <rect
                x={leftHanded ? W - NUT - 1 : NUT - 3}
                y={topY - 12}
                width={4}
                height={boardBottom - (topY - 12)}
                rx={1.6}
                fill={capo > 0 ? '#8A3E07' : '#1B1712'}
                pointerEvents="none"
              />
              {capo > 0 && (
                <text x={flipX(NUT)} y={topY - 16} textAnchor="middle" fontSize={7} fontWeight={700} fill="#8A3E07" pointerEvents="none">
                  Capo {capo}
                </text>
              )}

              {openStrings.map((_, si) => (
                <g key={si}>
                  <line
                    x1={flipX(NUT)} y1={rowY(si, rowCount)} x2={flipX(END)} y2={rowY(si, rowCount)}
                    stroke="#C3BBAA" strokeWidth={2.2 - si * 0.22} strokeLinecap="round"
                    pointerEvents="none"
                  />
                  <text
                    x={leftHanded ? W - 10 : 22} y={rowY(si, rowCount) + 3}
                    textAnchor={leftHanded ? 'start' : 'end'}
                    fontSize={8.5} fontWeight={600} fill="#A79E8C" fontFamily="ui-monospace, monospace"
                    pointerEvents="none"
                  >
                    {tuning.stringNames[si]}
                  </text>
                </g>
              ))}

              {Array.from({ length: FRET_COUNT }).map((_, i) => {
                const f = i + 1;
                return (
                  <text
                    key={f} x={flipX(noteX(f, NUT, END))} y={fretNumberY} textAnchor="middle"
                    fontSize={7.5} fill="#B3AA98" opacity={f <= maxFret ? 1 : 0.3}
                    fontFamily="ui-monospace, monospace"
                    pointerEvents="none"
                  >
                    {f}
                  </text>
                );
              })}

              {shapeOverlay?.boxes.map((box, i) => {
                const xA = flipX(noteX(box.from, NUT, END));
                const xB = flipX(noteX(box.to, NUT, END));
                let x = Math.min(xA, xB) - 16;
                let width = Math.abs(xA - xB) + 32;
                if (x < 8) { width += x - 8; x = 8; }
                if (x + width > W - 8) width = W - 8 - x;
                const yTop = rowY(box.stringTo, rowCount) - 11;
                const yBottom = rowY(box.stringFrom, rowCount) + 11;
                return (
                  <rect
                    key={`shape-${i}`} x={x} y={Math.min(yTop, yBottom)}
                    width={Math.max(4, width)} height={Math.abs(yBottom - yTop)}
                    rx={8} fill="rgba(91,91,214,0.06)" stroke="rgba(91,91,214,0.3)" strokeDasharray="4 3"
                    pointerEvents="none"
                  />
                );
              })}

              {openStrings.map((open, si) =>
                Array.from({ length: FRET_COUNT + 1 }).map((_, fret) => {
                  if (fret > maxFret) return null;
                  const midi = open + fret;
                  const pc = ((midi % 12) + 12) % 12;
                  const x = flipX(noteX(fret, NUT, END));
                  const y = rowY(si, rowCount);
                  const shapePoint = shapePoints.get(`${si}:${fret}`);
                  const shapeDim = shapeOverlay && !shapePoint ? 0.3 : 1;
                  const dim = (fret >= fretWindow.from && fret <= fretWindow.to ? 1 : 0.25) * shapeDim;
                  const isTarget = overlay === 'target' && targetPcs.has(pc);
                  const inScaleNote = inScale.has(pc);
                  const isAudition = auditionAt?.si === si && auditionAt?.fret === fret;

                  if (!inScaleNote) {
                    if (!tensions && !isTarget) return null;
                    return (
                      <g
                        key={`t${si}-${fret}`} opacity={dim}
                        onClick={() => audition(si, fret)} style={{ cursor: 'pointer' }}
                        role="button" aria-label={`Fret ${fret} ${pcName(pc, flats)}`}
                      >
                        {tensions && (
                          <circle cx={x} cy={y} r={4} fill="none" stroke="#CBC1AC" strokeWidth={0.9} strokeDasharray="2 2" />
                        )}
                        {isTarget && (
                          <>
                            <circle
                              cx={x} cy={y} r={5.6} fill="none"
                              stroke="#0F766E" strokeWidth={1.4} strokeDasharray="2.5 2"
                              opacity={targetOpacity}
                            />
                            <circle cx={x} cy={y} r={1.7} fill="#0F766E" opacity={targetOpacity} />
                            <text
                              x={x} y={y - 9} textAnchor="middle" fontSize={6}
                              fontWeight={700} fill="#0F766E" opacity={targetOpacity}
                            >
                              {pcName(pc, flats)}
                            </text>
                          </>
                        )}
                        {isAudition && (
                          <circle cx={x} cy={y} r={7.5} fill="none" stroke="#B03A2E" strokeWidth={1.6} opacity={0.9} />
                        )}
                      </g>
                    );
                  }

                  const isTonic = pc === rootPc;
                  const isChord = chordSet.has(pc);
                  const isGuide = overlay !== 'off' && guideRoles.has(pc);
                  const guideRole = guideRoles.get(pc);
                  const rad = isTonic ? 10 : isChord ? 9 : 8;
                  const label = mode === 'notes'
                    ? midiToName(midi, flats)
                    : degreeOf(pc, rootPc, scaleIntervals) ?? '';

                  return (
                    <g
                      key={`${si}-${fret}`} opacity={dim}
                      onClick={() => audition(si, fret)} style={{ cursor: 'pointer' }}
                      role="button" aria-label={`Fret ${fret} ${pcName(pc, flats)}`}
                    >
                      {shapePoint && (
                        <circle cx={x} cy={y} r={rad + 4.8} fill="none" stroke="#5B5BD6" strokeWidth={1.8} opacity={0.95} />
                      )}
                      {shapePoint?.role && (
                        <g>
                          <rect x={x - 9} y={y + rad - 1} width={8} height={8} rx={2} fill="#5B5BD6" />
                          <text
                            x={x - 5} y={y + rad + 5} textAnchor="middle"
                            fontSize={5.5} fontWeight={800} fill="#FFFFFF"
                          >
                            {shapePoint.role}
                          </text>
                        </g>
                      )}
                      {isGuide && (
                        <>
                          <circle cx={x} cy={y} r={rad + 3.2} fill="none" stroke="#B45309" strokeWidth={2} opacity={0.9} />
                          {mode === 'degrees' && guideRole && (
                            <g>
                              <rect x={x + rad - 2} y={y - rad - 7} width={9} height={9} rx={2.5} fill="#B45309" />
                              <text
                                x={x + rad + 2.5} y={y - rad - 0.6} textAnchor="middle"
                                fontSize={6} fontWeight={800} fill="#FFFFFF"
                              >
                                {GUIDE_SHORT[guideRole]}
                              </text>
                            </g>
                          )}
                        </>
                      )}
                      {isTarget && (
                        <circle
                          cx={x} cy={y} r={rad + 5.6} fill="none"
                          stroke="#0F766E" strokeWidth={1.5} strokeDasharray="2.5 2"
                          opacity={targetOpacity}
                        />
                      )}
                      {isTonic && <circle cx={x} cy={y} r={rad + 3} fill="none" stroke="#C98136" strokeWidth={1.1} opacity={0.55} />}
                      <circle
                        cx={x} cy={y} r={rad}
                        fill={isTonic ? '#B45309' : isChord ? '#0F766E' : '#F2ECDD'}
                        stroke={isTonic || isChord ? '#FDFBF6' : '#DCD3BF'}
                        strokeWidth={isTonic ? 2.4 : isChord ? 2 : 0.9}
                      />
                      <text
                        x={x} y={y + 3} textAnchor="middle"
                        fontSize={label.length > 1 ? 6.8 : isTonic ? 8.6 : 7.8}
                        fontWeight={700}
                        fill={isTonic || isChord ? '#FFFFFF' : '#847B69'}
                      >
                        {label}
                      </text>
                      {isAudition && (
                        <circle cx={x} cy={y} r={rad + 7} fill="none" stroke="#B03A2E" strokeWidth={1.6} opacity={0.9} />
                      )}
                    </g>
                  );
                }),
              )}
            </svg>
          </div>

          {overlay !== 'off' && voiceLeading && (
            <div className="guidebar">
              <span className="lab">Guide</span>
              {voiceLeading.guideTones.map((tone) => (
                <span className="guidechip" key={`g${tone.pc}`}>
                  {pcName(tone.pc, flats)} <em>{GUIDE_SHORT[tone.role]}</em>
                </span>
              ))}
              {voiceLeading.leadingPairs.length > 0 && <span className="gsep">→</span>}
              {voiceLeading.leadingPairs.map((pair, i) => (
                <span className="guidepair" key={`p${pair.from}-${pair.to}-${i}`}>
                  {pcName(pair.from, flats)}
                  <span className={pair.semitones === 0 ? 'same' : ''}>
                    {pair.semitones === 0 ? '=' : pair.semitones > 0 ? `+${pair.semitones}` : pair.semitones}
                  </span>
                  {pcName(pair.to, flats)}
                </span>
              ))}
            </div>
          )}

          <div className="fretcontrols">
            <label className="fretctl">
              <span className="lab">Tuning</span>
              <select
                className="fret-select"
                value={tuningId}
                onChange={(e) => setTuningId(e.target.value as TuningId)}
              >
                {TUNINGS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="fretctl">
              <span className="lab">Capo</span>
              <select
                className="fret-select"
                value={capo}
                onChange={(e) => setCapo(Number(e.target.value))}
              >
                {Array.from({ length: 13 }, (_, i) => (
                  <option key={i} value={i}>{i === 0 ? 'None' : `Fret ${i}`}</option>
                ))}
              </select>
            </label>
            <label className="fretctl">
              <span className="lab">Shape</span>
              <select
                className="fret-select"
                value={shapeMode}
                onChange={(e) => setShapeMode(e.target.value as ShapeMode)}
              >
                <option value="off">Off</option>
                <option value="C">CAGED C</option>
                <option value="A">CAGED A</option>
                <option value="G">CAGED G</option>
                <option value="E">CAGED E</option>
                <option value="D">CAGED D</option>
                <option value="3nps">3 notes / string</option>
                <option value="shells">Shell voicings</option>
              </select>
            </label>
            <button
              className={`pos${leftHanded ? ' on' : ''}`}
              onClick={() => setLeftHanded((value) => !value)}
              title="Mirror the fretboard for a left-handed player"
            >
              Left-handed
            </button>
          </div>

          <div className="foot">
            <span className="lab">Position</span>
            {POSITIONS.map((p, i) => (
              <button
                key={p.label}
                className={`pos${i === pos ? ' on' : ''}`}
                onClick={() => setPos(i)}
                disabled={p.from > maxFret}
              >
                {p.label}
              </button>
            ))}
            <div className="spacer" />
            <Legend showGuide showShape />
          </div>
        </>
      )}
    </section>
  );
}
