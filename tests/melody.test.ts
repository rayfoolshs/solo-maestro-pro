import { describe, expect, it } from 'vitest';
import {
  makeEmptyChart, quantizeBeat,
  removeMelodyAt, setMelodyNote, setSlotHit, transposeChart,
  type Chart, type MelodyNote,
} from '../src/chart/model';
import { normalizeChart, parseChartText, serializeChart } from '../src/chart/io';
import { buildMidiFile } from '../src/arrange/midi';
import { buildScore } from '../src/arrange/buildScore';
import { makeKey } from '../src/theory/keys';

const key = makeKey(0, 'major');

function melodyChart(notes: MelodyNote[]): Chart {
  const base = makeEmptyChart();
  return {
    ...base,
    name: 'Melody Test',
    visibleBars: 4,
    bars: [
      { id: 'b1', slots: [{ id: 's1', beat: 0, input: 'Cmaj7' }], melody: notes },
      { id: 'b2', slots: [] },
      { id: 'b3', slots: [] },
      { id: 'b4', slots: [] },
    ],
  };
}

const note = (overrides: Partial<MelodyNote> = {}): MelodyNote => ({
  id: 'n1',
  pitchMidi: 60,
  startBeat: 0,
  durationBeats: 1,
  ...overrides,
});

describe('melody model', () => {
  it('quantizes beat positions to the sixteenth-note grid', () => {
    expect(quantizeBeat(0.37)).toBe(0.25);
    expect(quantizeBeat(1.13)).toBe(1.25);
    expect(quantizeBeat(2.0)).toBe(2);
    expect(quantizeBeat(-0.2)).toBe(0);
  });

  it('normalizes, clamps and sorts melody notes', () => {
    const chart = normalizeChart({
      name: 'Melody',
      bars: [{
        slots: [{ input: 'Cmaj7' }],
        melody: [
          { pitchMidi: 64, startBeat: 2, durationBeats: 1 },
          { pitchMidi: 60, startBeat: 0.37, durationBeats: 0.9, tieToNext: true, lyric: 'Hel' },
          { pitchMidi: null, startBeat: 1.13, durationBeats: 0.6 },
          { pitchMidi: 200, startBeat: 3, durationBeats: 1 },
        ],
      }],
    });
    expect(chart).not.toBeNull();
    const melody = chart!.bars[0].melody;
    expect(melody).toHaveLength(3);
    expect(melody![0]).toMatchObject({ pitchMidi: 60, startBeat: 0.25, durationBeats: 1, tieToNext: true, lyric: 'Hel' });
    expect(melody![1]).toMatchObject({ pitchMidi: null, startBeat: 1.25, durationBeats: 0.5 });
    expect(melody![2]).toMatchObject({ pitchMidi: 64, startBeat: 2, durationBeats: 1 });
  });

  it('adds, replaces and removes notes at the same start beat', () => {
    const first = setMelodyNote(makeEmptyChart(), 0, note());
    const replaced = setMelodyNote(first, 0, note({ id: 'n2', pitchMidi: 62 }));
    expect(replaced.bars[0].melody).toHaveLength(1);
    expect(replaced.bars[0].melody![0].pitchMidi).toBe(62);
    const removed = removeMelodyAt(replaced, 0, 0);
    expect(removed.bars[0].melody).toBeUndefined();
  });

  it('round-trips ties, rests and lyrics through .gsm.json', () => {
    const chart = normalizeChart({
      name: 'Melody',
      bars: [{
        slots: [{ input: 'C' }],
        melody: [
          { pitchMidi: 60, startBeat: 0, durationBeats: 1, tieToNext: true, lyric: 'Hel' },
          { pitchMidi: 62, startBeat: 1, durationBeats: 1, tieToNext: true },
          { pitchMidi: null, startBeat: 2, durationBeats: 1 },
        ],
      }],
    })!;
    const parsed = parseChartText(JSON.stringify(serializeChart(chart)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const melody = parsed.chart.bars[0].melody!;
    expect(melody).toHaveLength(3);
    expect(melody[0]).toMatchObject({ pitchMidi: 60, tieToNext: true, lyric: 'Hel' });
    expect(melody[1]).toMatchObject({ pitchMidi: 62, tieToNext: true });
    expect(melody[2].pitchMidi).toBeNull();
  });

  it('transposes melody pitches with the chart', () => {
    const chart = melodyChart([note({ pitchMidi: 60 }), note({ id: 'n2', pitchMidi: null, startBeat: 1 })]);
    const transposed = transposeChart(chart, 2);
    expect(transposed.bars[0].melody?.map((entry) => entry.pitchMidi)).toEqual([62, null]);
  });
});

describe('melody playback and MIDI', () => {
  it('emits melody events and skips rests', () => {
    const chart = melodyChart([
      note({ pitchMidi: 60, startBeat: 0, durationBeats: 1 }),
      note({ id: 'rest', pitchMidi: null, startBeat: 1, durationBeats: 1 }),
      note({ id: 'n3', pitchMidi: 64, startBeat: 2, durationBeats: 1 }),
    ]);
    const events = buildScore(chart, key, { style: 'jazz', swing: 0 });
    const melody = events.filter((event) => event.channel === 'melody');
    expect(melody).toHaveLength(2);
    expect(melody[0]).toMatchObject({ beat: 0, dur: 1, midi: 60 });
    expect(melody[1]).toMatchObject({ beat: 2, dur: 1, midi: 64 });
  });

  it('merges tied notes into one sounding event', () => {
    const chart = melodyChart([
      note({ pitchMidi: 60, startBeat: 0, durationBeats: 1, tieToNext: true }),
      note({ id: 'n2', pitchMidi: 60, startBeat: 1, durationBeats: 2 }),
    ]);
    const events = buildScore(chart, key, { style: 'jazz', swing: 0 });
    const melody = events.filter((event) => event.channel === 'melody');
    expect(melody).toHaveLength(1);
    expect(melody[0]).toMatchObject({ beat: 0, dur: 3, midi: 60 });
  });

  it('adds a Melody track to the MIDI file only when notes exist', () => {
    const withMelody = melodyChart([note({ pitchMidi: 60, startBeat: 0 })]);
    const melodyEvents = buildScore(withMelody, key, { style: 'jazz', swing: 0 });
    const midi = buildMidiFile(withMelody, melodyEvents);
    const trackCount = (midi[10] << 8) | midi[11];
    expect(trackCount).toBe(5);
    const ascii = [...midi].map((byte) => String.fromCharCode(byte)).join('');
    expect(ascii).toContain('Melody');
    expect([...midi].some((byte, index) => byte === 0xc2 && midi[index + 1] === 73)).toBe(true);

    const without = melodyChart([]);
    const noMelody = buildScore(without, key, { style: 'jazz', swing: 0 });
    const emptyMidi = buildMidiFile(without, noMelody);
    expect((emptyMidi[10] << 8) | emptyMidi[11]).toBe(4);
  });
});

describe('rhythmic hits', () => {
  function hitChart(hit: 'push' | 'kick' | 'stop' | 'slash') {
    const base = makeEmptyChart();
    const chart = {
      ...base,
      visibleBars: 4,
      bars: [
        { id: 'b1', slots: [{ id: 's1', beat: 2, input: 'G7' }] },
        ...base.bars.slice(1),
      ],
    };
    return setSlotHit(chart, 0, 2, hit);
  }

  it('normalizes and preserves hit markers', () => {
    const chart = normalizeChart({
      name: 'Hits',
      bars: [{ slots: [{ input: 'C', hit: 'stop' }, { input: 'F', beat: 2, hit: 'nonsense' }] }],
    });
    expect(chart!.bars[0].slots[0].hit).toBe('stop');
    expect(chart!.bars[0].slots[1].hit).toBeUndefined();
  });

  it('stops normal comping and bass for a stop hit', () => {
    const normal = buildScore(hitChart('slash'), key, { style: 'jazz', swing: 0 })
      .filter((event) => event.beat < 4);
    const stopped = buildScore(hitChart('stop'), key, { style: 'jazz', swing: 0 })
      .filter((event) => event.beat < 4);
    expect(stopped.filter((event) => event.channel === 'piano').length)
      .toBeLessThan(normal.filter((event) => event.channel === 'piano').length);
    expect(stopped.filter((event) => event.channel === 'bass')).toHaveLength(1);
  });

  it('anticipates a pushed chord by half a beat', () => {
    const events = buildScore(hitChart('push'), key, { style: 'jazz', swing: 0 })
      .filter((event) => event.beat < 4);
    const piano = events.filter((event) => event.channel === 'piano');
    expect(piano.some((event) => Math.abs(event.beat - 1.5) < 1e-6)).toBe(true);
  });

  it('adds a kick on a kick hit', () => {
    const events = buildScore(hitChart('kick'), key, { style: 'jazz', swing: 0 });
    expect(
      events.some(
        (event) => event.channel === 'drums' && event.midi === 36 && event.beat === 2 && event.velocity === 112,
      ),
    ).toBe(true);
  });
});
