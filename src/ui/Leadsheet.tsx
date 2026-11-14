import { useEffect, useMemo, useRef, useState } from 'react';
import type { Chart, MelodyNote } from '../chart/model';
import { autoName, beatsPerBar, prettyChord, quantizeBeat, uid } from '../chart/model';
import { styleLabel } from '../arrange/styles';
import type { KeyInfo } from '../theory/keys';
import { mod12 } from '../theory/pitch';
import type { ResolvedKeySpan } from '../theory/localKeys';
import { findKeySpan, spanKey } from '../theory/localKeys';
import type { Candidate } from '../theory/suggest';
import { pcName } from '../theory/pitch';
import {
  FLAG_GLYPH, NOTEHEAD_GLYPH, REST_GLYPH, accidentalFor, ledgerStepsFor, midiLabel,
  midiToStaffStep, noteDurationKind, staffYForStep,
} from '../chart/notation';

const clampBar = (n: number, last: number) => Math.max(0, Math.min(last, n));

const SHARP_STEPS = [0, 3, -2, 2, 5, 1, 4];
const FLAT_STEPS = [4, 1, 5, 2, 6, 3, 7];

function keySignature(key: KeyInfo): { count: number; flats: boolean } {
  const rel = key.mode === 'major' ? key.tonic : mod12(key.tonic + 3);
  const sharps: Record<number, number> = { 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 1: 7 };
  const flats: Record<number, number> = { 5: 1, 10: 2, 3: 3, 8: 4, 1: 5, 6: 6, 11: 7 };
  const s = sharps[rel] ?? 0;
  const f = flats[rel] ?? 0;
  return key.flats ? { count: f || s, flats: true } : { count: s || f, flats: false };
}

interface Props {
  chart: Chart;
  keyInfo: KeyInfo;
  view: 'fit' | 'comfortable';
  standMode: boolean;
  playLock: boolean;
  selection: { bar: number; slotId: string | null };
  playing: boolean;
  playBar: number;
  suggestions: Map<string, Candidate[]>;
  transitions: (a: number[], b: number[]) => number;
  keySpans: ResolvedKeySpan[];
  selectedLocalKeyName: string;
  onPinKey: (bar: number) => void;
  onClearKey: (bar: number) => void;
  onSelect: (bar: number, slotId: string | null) => void;
  onCommit: (bar: number, beat: number, value: string) => void;
  onMelodyNote: (bar: number, note: MelodyNote) => void;
  onMelodyRemove: (bar: number, startBeat: number) => void;
  onMelodyClear: (bar: number) => void;
  onBarCount: (n: number) => void;
  onToggleView: () => void;
  global: Candidate[];
  selectedCandidate: Candidate | null;
  loop: { mode: 'off' | 'visible' | 'range'; from: number; to: number };
  loopRange: { from: number; to: number };
  onLoopRange: (fromBar: number, toBar: number) => void;
}

/** Left gutter must fit the clef, the key signature and the time signature. */
const gutterFor = (accidentals: number) => 64 + accidentals * 12;

export function Leadsheet(props: Props) {
  const { chart, keyInfo, view, standMode, playLock, selection, playing, playBar, suggestions, transitions, keySpans, selectedLocalKeyName, selectedCandidate, onPinKey, onClearKey, onSelect, onCommit, onMelodyNote, onMelodyRemove, onMelodyClear, onBarCount, onToggleView, global } = props;
  const bpb = beatsPerBar(chart);
  const sig = keySignature(keyInfo);
  const styleLabelText = styleLabel(chart.style);

  const [edit, setEdit] = useState<{ bar: number; beat: number; value: string } | null>(null);
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
  const [keyMenu, setKeyMenu] = useState<{ bar: number; x: number; y: number } | null>(null);
  const [melodyPitch, setMelodyPitch] = useState('60');
  const [melodyDuration, setMelodyDuration] = useState(1);
  const [tieNext, setTieNext] = useState(false);
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!standMode || !playing) return;
    const active = chartRef.current?.querySelector('.barx.playing');
    active?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [standMode, playing, playBar]);

  const pitchOptions = useMemo(() => {
    const pcs = new Set(selectedCandidate?.pcs ?? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const options: number[] = [];
    for (let midi = 55; midi <= 79; midi++) if (pcs.has(mod12(midi))) options.push(midi);
    return options;
  }, [selectedCandidate]);

  const activePitchValue = melodyPitch === 'rest'
    ? 'rest'
    : pitchOptions.some((midi) => String(midi) === melodyPitch)
      ? melodyPitch
      : String(pitchOptions[0] ?? 60);

  const addMelodyAt = (barIndex: number, startBeat: number) => {
    const existing = chart.bars[barIndex]?.melody?.find(
      (note) => Math.abs(note.startBeat - startBeat) < 1e-6,
    );
    if (existing) {
      onMelodyRemove(barIndex, existing.startBeat);
      return;
    }
    const beat = quantizeBeat(startBeat);
    if (beat >= bpb) return;
    const duration = Math.min(quantizeBeat(melodyDuration), bpb - beat);
    if (duration < 0.25) return;
    onMelodyNote(barIndex, {
      id: uid('m'),
      pitchMidi: activePitchValue === 'rest' ? null : Number(activePitchValue),
      startBeat: beat,
      durationBeats: duration,
      ...(tieNext ? { tieToNext: true } : {}),
    });
  };
  const dragRef = useRef<{ a: number; b: number } | null>(null);
  const loopRangeRef = useRef(props.onLoopRange);
  useEffect(() => { loopRangeRef.current = props.onLoopRange; }, [props.onLoopRange]);
  const updateDrag = (next: { a: number; b: number } | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  useEffect(() => { setEdit(null); setKeyMenu(null); }, [chart.id]);

  const openKeyMenu = (bar: number, clientX: number, clientY: number) => {
    onSelect(bar, null);
    const x = Math.min(clientX, (typeof window === 'undefined' ? clientX : window.innerWidth) - 210);
    const y = Math.min(clientY, (typeof window === 'undefined' ? clientY : window.innerHeight) - 130);
    setKeyMenu({ bar, x: Math.max(8, x), y: Math.max(8, y) });
  };

  const menuSpan = keyMenu ? findKeySpan(keySpans, keyMenu.bar) : null;
  const menuPinned = !!keyMenu && keySpans.some(
    (span) => span.source === 'pinned' && keyMenu.bar >= span.startBar && keyMenu.bar <= span.endBar,
  );

  // fallback for browsers/situations where pointer capture does not deliver moves
  useEffect(() => {
    const barUnder = (x: number, y: number): number | null => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const sys = el?.closest('.sys') as HTMLElement | null;
      if (!sys) return null;
      const start = Number(sys.dataset.start);
      const count = Number(sys.dataset.count);
      const gutter = Number(sys.dataset.gutter);
      const rect = sys.getBoundingClientRect();
      const width = Math.max(1, (rect.width - gutter) / count);
      return start + Math.max(0, Math.min(count - 1, Math.floor((x - rect.left - gutter) / width)));
    };
    const move = (e: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const bar = barUnder(e.clientX, e.clientY);
      if (bar === null || bar === current.b) return;
      dragRef.current = { ...current, b: bar };
      setDrag(dragRef.current);
      loopRangeRef.current(Math.min(current.a, bar), Math.max(current.a, bar));
    };
    const up = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setDrag(null);
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  const visible = chart.bars.slice(0, chart.visibleBars);

  const renderMelodyNote = (note: MelodyNote, barIndex: number) => {
    const kind = noteDurationKind(note.durationBeats);
    const rest = note.pitchMidi === null;
    const left = (note.startBeat / bpb) * 100;
    const step = rest ? 34 : midiToStaffStep(note.pitchMidi!, keyInfo.flats);
    const y = staffYForStep(step);
    const accidental = rest ? null : accidentalFor(note.pitchMidi!, keyInfo.flats);
    const ledgers = rest ? [] : ledgerStepsFor(note.pitchMidi!, keyInfo.flats);
    const stemUp = step <= 34;
    const flag = kind === 'eighth' ? 'eighth' : kind === 'sixteenth' ? 'sixteenth' : null;

    return (
      <span
        key={note.id}
        className={`mnote${rest ? ' rest' : ''}`}
        style={{ left: `${left}%` }}
        onClick={(e) => {
          e.stopPropagation();
          onMelodyRemove(barIndex, note.startBeat);
        }}
        role="button"
        tabIndex={0}
        title={`${rest ? 'Rest' : midiLabel(note.pitchMidi!, keyInfo.flats)} · ${kind}`}
      >
        {ledgers.map((ledger) => (
          <i key={ledger} className="ledger" style={{ top: `${staffYForStep(ledger)}px` }} />
        ))}
        <span className="mnote-anchor" style={{ top: `${y}px` }}>
          {rest ? (
            <span className="smuf restglyph">{REST_GLYPH[kind]}</span>
          ) : (
            <>
              {accidental && (
                <span className="smuf accid">{accidental === '#' ? '\uE262' : '\uE260'}</span>
              )}
              <span className="smuf notehead">{NOTEHEAD_GLYPH[kind]}</span>
              {kind !== 'whole' && <i className={`mstem${stemUp ? ' up' : ' down'}`} />}
              {flag && (
                <span className={`smuf flagglyph${stemUp ? ' up' : ' down'}`}>
                  {FLAG_GLYPH[flag][stemUp ? 'up' : 'down']}
                </span>
              )}
              {note.tieToNext && <span className="mtie">⌒</span>}
            </>
          )}
        </span>
      </span>
    );
  };

  function renderChart(perSystem: number, gutter: number, interactive: boolean) {
    const systems: typeof visible[] = [];
    for (let i = 0; i < visible.length; i += perSystem) systems.push(visible.slice(i, i + perSystem));
    const gridCols = `${gutter}px repeat(${perSystem}, 1fr)`;

    return systems.map((sys, si) => {
      const startBar = si * perSystem;
      const sysEnd = startBar + sys.length - 1;
      const range = drag
        ? { from: Math.min(drag.a, drag.b), to: Math.max(drag.a, drag.b) }
        : props.loop.mode === 'range'
          ? props.loopRange
          : null;
      const showBand = !!range && range.from <= sysEnd && range.to >= startBar;
      const bandFrom = showBand ? Math.max(range!.from, startBar) - startBar : 0;
      const bandTo = showBand ? Math.min(range!.to, sysEnd) - startBar : 0;
      const systemSpans = (() => {
        const barSpans = sys.map((_, bi) => {
          const bar = startBar + bi;
          let chosen: ResolvedKeySpan | null = null;
          for (const span of keySpans) {
            if (bar >= span.startBar && bar <= span.endBar) chosen = span;
          }
          return chosen;
        });

        const groups: Array<{
          span: ResolvedKeySpan;
          from: number;
          to: number;
          continuation: boolean;
          pinned: boolean;
        }> = [];
        barSpans.forEach((span, bi) => {
          if (!span) return;
          const bar = startBar + bi;
          const last = groups[groups.length - 1];
          const sameKey = last && last.span.tonic === span.tonic && last.span.mode === span.mode;
          if (last && sameKey) {
            last.to = bar;
            last.pinned = last.pinned || span.source === 'pinned';
          } else {
            groups.push({
              span,
              from: bar,
              to: bar,
              continuation: bar > span.startBar,
              pinned: span.source === 'pinned',
            });
          }
        });
        return groups;
      })();

      return (
        <div
          className="sys"
          key={`${interactive ? 's' : 'p'}${si}`}
          data-start={startBar}
          data-count={sys.length}
          data-gutter={gutter}
          onPointerDown={interactive ? (e) => {
            if (e.button !== 0) return;
            const el = e.target as HTMLElement;
            if (el.closest('.chordbtn') || el.closest('input') || el.closest('.keybadge') || el.closest('.melodycell') || el.closest('.mnote')) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const width = Math.max(1, (rect.width - gutter) / sys.length);
            const idx = Math.floor((e.clientX - rect.left - gutter) / width);
            const bar = clampBar(startBar + idx, chart.visibleBars - 1);
            e.preventDefault();
            // capture keeps move/up events coming even outside the chart
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
            onSelect(bar, null);
            updateDrag({ a: bar, b: bar });
            props.onLoopRange(bar, bar);
          } : undefined}
          onPointerMove={interactive ? (e) => {
            const current = dragRef.current;
            if (!current) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const width = Math.max(1, (rect.width - gutter) / sys.length);
            const idx = Math.floor((e.clientX - rect.left - gutter) / width);
            const bar = clampBar(startBar + idx, chart.visibleBars - 1);
            if (bar !== current.b) {
              e.preventDefault();
              updateDrag({ ...current, b: bar });
              props.onLoopRange(Math.min(current.a, bar), Math.max(current.a, bar));
            }
          } : undefined}
          onPointerUp={interactive ? (e) => {
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
            updateDrag(null);
          } : undefined}
          onPointerCancel={interactive ? () => updateDrag(null) : undefined}
        >
          {showBand && (
            <div
              className={`loopband${drag ? ' live' : ''}`}
              style={{
                left: `calc(${gutter}px + (100% - ${gutter}px) * ${bandFrom / perSystem})`,
                width: `calc((100% - ${gutter}px) * ${(bandTo - bandFrom + 1) / perSystem})`,
              }}
            />
          )}
          <div className="sysnum">{startBar + 1}</div>

          <div className="keyrow" style={{ marginLeft: gutter }}>
            {systemSpans.map(({ span, from, to, continuation, pinned }) => (
              <button
                key={`${span.id}:${from}`}
                type="button"
                className={`keybadge${pinned ? ' pinned' : ''}${continuation ? ' cont' : ''}`}
                style={{
                  left: `${((from - startBar) / sys.length) * 100}%`,
                  width: `${(((to - from) + 1) / sys.length) * 100}%`,
                }}
                title={`Bars ${from + 1}–${to + 1} · ${spanKey(span).name} · ${pinned ? 'pinned' : 'auto'}`}
                onClick={interactive ? (e) => openKeyMenu(from, e.clientX, e.clientY) : undefined}
              >
                {spanKey(span).name}
                {pinned && <span className="pin">PIN</span>}
              </button>
            ))}
          </div>

          <div className="chordrow" style={{ gridTemplateColumns: gridCols }}>
            <div />
            {sys.map((bar, bi) => {
              const barIndex = startBar + bi;
              const active = interactive && playing && playBar === barIndex;
              return (
                <div
                  className={`barx${active ? ' playing' : ''}`}
                  key={bar.id}
                  role="group"
                  aria-label={`Bar ${barIndex + 1}`}
                  onContextMenu={interactive ? (e) => {
                    e.preventDefault();
                    openKeyMenu(barIndex, e.clientX, e.clientY);
                  } : undefined}
                >
                  {Array.from({ length: bpb }).map((_, beat) => {
                    const slot = bar.slots.find((s) => s.beat === beat);
                    const isEditing = interactive && edit && edit.bar === barIndex && edit.beat === beat;
                    const leftPct = (beat / bpb) * 100;
                    return (
                      <div key={beat} className={`slot${slot ? ' has' : ''}`} style={{ left: `${leftPct}%` }}>
                        {isEditing ? (
                          <input
                            autoFocus
                            value={edit.value}
                            onChange={(e) => setEdit({ ...edit, value: e.target.value })}
                            onBlur={() => { onCommit(barIndex, beat, edit.value); setEdit(null); }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { onCommit(barIndex, beat, edit.value); setEdit(null); }
                              if (e.key === 'Escape') setEdit(null);
                            }}
                            placeholder="Cm7"
                          />
                        ) : interactive ? (
                          <button
                            className="chordbtn"
                            onClick={() => {
                              onSelect(barIndex, slot?.id ?? null);
                              if (standMode && playLock) return;
                              setEdit({ bar: barIndex, beat, value: slot?.input ?? '' });
                            }}
                            title={slot ? 'Edit chord' : 'Add chord'}
                          >
                            {slot ? prettyChord(slot.input) : '＋'}
                          </button>
                        ) : (
                          <span className="chordbtn">{slot ? prettyChord(slot.input) : ''}</span>
                        )}
                      </div>
                    );
                  })}
                  <div className="beatdots">
                    {Array.from({ length: bpb }).map((_, b) => (
                      <i key={b} className={bar.slots.some((s) => s.beat === b) ? 'on' : ''} style={{ left: `calc(${(b / bpb) * 100}% + 1px)` }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="staff">
              {/* plain boxes, not a gradient or SVG: those lost hairlines when printed */}
              <div className="stafflines" aria-hidden>
                {[0, 1, 2, 3, 4].map((i) => (
                  <i key={i} style={{ top: 3 + i * 7 }} />
                ))}
              </div>
              <div className="bl" style={{ gridTemplateColumns: gridCols }}>
                <div />
                {sys.map((bar, bi) => {
                  const barIndex = startBar + bi;
                  return (
                    <div key={bar.id} className="blbar">
                      {interactive && !(standMode && playLock) && Array.from({ length: bpb * 4 }).map((_, cell) => (
                        <button
                          key={cell}
                          className="melodycell"
                          style={{
                            left: `${((cell * 0.25) / bpb) * 100}%`,
                            width: `${100 / (bpb * 4)}%`,
                          }}
                          onClick={() => addMelodyAt(barIndex, cell * 0.25)}
                          aria-label={`Melody bar ${barIndex + 1} beat ${cell * 0.25 + 1}`}
                        />
                      ))}
                      {(bar.melody ?? []).map((note) => renderMelodyNote(note, barIndex))}
                    </div>
                  );
                })}
              </div>
              <svg className="glyphs" width="100%" height="34" aria-hidden>
                {/* notation order: clef → key signature → time signature */}
                <text x="6" y="25">&#xE050;</text>
                {Array.from({ length: sig.count }).map((_, i) => {
                  const step = sig.flats ? FLAT_STEPS[i] : SHARP_STEPS[i];
                  const y = 4 + step * 3.5;
                  return (
                    <text key={i} x={34 + i * 12} y={y} fontSize="28">
                      {sig.flats ? '\uE260' : '\uE262'}
                    </text>
                  );
                })}
                {si === 0 && (
                  <>
                    <text x={42 + sig.count * 12} y="11">&#xE084;</text>
                    <text x={42 + sig.count * 12} y="25">&#xE084;</text>
                  </>
                )}
              </svg>
          </div>

          <div className="scrow" style={{ gridTemplateColumns: gridCols }}>
            <div />
            {sys.map((bar, bi) => {
              const barIndex = startBar + bi;
              return (
                <div className="scbar" key={bar.id}>
                  {bar.slots.map((slot) => {
                    const cands = suggestions.get(slot.id) ?? [];
                    const top = cands[0];
                    if (!top) return null;
                    const selected = interactive && (selection.slotId === slot.id || (selection.slotId === null && selection.bar === barIndex));
                    const idx = bar.slots.indexOf(slot);
                    const next = bar.slots[idx + 1];
                    const nextTop = next ? (suggestions.get(next.id) ?? [])[0] : null;
                    const smooth = nextTop ? transitions(top.pcs, nextTop.pcs) : null;
                    return (
                      <div
                        key={slot.id}
                        className={`scsub${selected ? ' sel' : ''}`}
                        style={{ left: `${(slot.beat / bpb) * 100}%`, width: `${(1 / bar.slots.length) * 100}%` }}
                        onClick={interactive ? () => onSelect(barIndex, slot.id) : undefined}
                        role={interactive ? 'button' : undefined}
                        tabIndex={interactive ? 0 : undefined}
                      >
                        <span className="nm" title={top.name}>{top.name}</span>
                        {top.added.length > 0 && <em>+{top.added.length}</em>}
                        <span className="alt">▸{cands.length - 1}</span>
                        {smooth !== null && (
                          <span className={`smooth${smooth < 0.75 ? ' shift' : ''}`} title="transition">{smooth < 0.75 ? '↗' : '→'}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      );
    });
  }

  const perSystem = standMode ? (narrow ? 2 : 4) : view === 'fit' ? 8 : 4;

  return (
    <section className="card leadsheet">
      <div className="print-head">
        <h2>{chart.name || autoName(chart)}</h2>
        <span>{chart.composer ? `${chart.composer}${chart.year ? ` · ${chart.year}` : ''} · ` : ''}{keyInfo.name} · {chart.tempo} bpm · {styleLabelText} · {chart.visibleBars} bars</span>
      </div>

      <div className="cardhead screen-only">
        <div className="ttl">Leadsheet</div>
        <div className="chip">{chart.name || autoName(chart)}</div>
        <div className="sub">Tap a beat to type a chord · drag the stave to set an A–B loop · {chart.visibleBars} bars</div>
        <div className="spacer" />
        <div className="chip"><span className="dot" />Bar {selection.bar + 1} selected</div>
        <button
          className="chip btn keychip"
          title="Local key at the selected bar — click to pin or clear"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            openKeyMenu(selection.bar, rect.left, rect.bottom + 4);
          }}
        >
          <span className="dot" />{selectedLocalKeyName}
        </button>
        <div className="stepper">
          <button onClick={() => onBarCount(chart.visibleBars - 1)} disabled={chart.visibleBars <= 4} aria-label="Fewer bars">−</button>
          <span>{chart.visibleBars} bars</span>
          <button onClick={() => onBarCount(chart.visibleBars + 1)} disabled={chart.visibleBars >= 64} aria-label="More bars">+</button>
        </div>
        <button className="chip btn" onClick={onToggleView}>{view === 'fit' ? 'Fit' : 'Comfort'}</button>
      </div>

      {!standMode && (
      <div className="melodybar">
          <span className="lab">Melody</span>
          <label className="sheetctl">
            <span className="lab">Pitch</span>
            <select className="fret-select" value={activePitchValue} onChange={(e) => setMelodyPitch(e.target.value)}>
              <option value="rest">Rest</option>
              {pitchOptions.map((midi) => (
                <option key={midi} value={midi}>{midiLabel(midi, keyInfo.flats)}</option>
              ))}
            </select>
          </label>
          <label className="sheetctl">
            <span className="lab">Length</span>
            <select className="fret-select" value={melodyDuration} onChange={(e) => setMelodyDuration(Number(e.target.value))}>
              <option value={4}>Whole</option>
              <option value={2}>Half</option>
              <option value={1}>Quarter</option>
              <option value={0.5}>8th</option>
              <option value={0.25}>16th</option>
            </select>
          </label>
          <button className={`chip btn${tieNext ? ' active' : ''}`} onClick={() => setTieNext((value) => !value)}>
            Tie next
          </button>
          <button className="chip btn" onClick={() => onMelodyClear(selection.bar)}>Clear bar</button>
          <span className="muted">Click the stave to add or remove notes.</span>
      </div>
      )}

      <div ref={chartRef} className={`chart screen-chart ${view}${drag ? ' dragging' : ''}`}>
        {renderChart(perSystem, gutterFor(sig.count), true)}
      </div>

      <div className="summary">
        <span className="lead2">Whole progression</span>
        <span className="txt"><b>{keyInfo.name}</b> — {global[0]?.name ?? ''} across the chart.</span>
        <div className="spacer" />
        {global.slice(1, 3).map((g) => (
          <div className="chip" key={g.id}>{g.name}</div>
        ))}
      </div>

      {keyMenu && (
        <>
          <div className="backdrop" onClick={() => setKeyMenu(null)} />
          <div className="keymenu" style={{ left: keyMenu.x, top: keyMenu.y }} role="menu">
            <div className="keymenu-head">
              Bar {keyMenu.bar + 1}
              {menuSpan ? ` · ${spanKey(menuSpan).name}` : ''}
              {menuSpan?.source === 'pinned' ? ' · pinned' : ''}
            </div>
            <button onClick={() => { onPinKey(keyMenu.bar); setKeyMenu(null); }}>
              Pin local key here
            </button>
            <button onClick={() => { onClearKey(keyMenu.bar); setKeyMenu(null); }} disabled={!menuPinned}>
              Clear local key
            </button>
          </div>
        </>
      )}
    </section>
  );
}
