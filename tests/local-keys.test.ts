import { describe, expect, it } from 'vitest';
import {
  autumnLeaves,
  blueBossa,
  chordTimeline,
  parseSlots,
  transposeChart,
  type Chart,
} from '../src/chart/model';
import { parseChartText, serializeChart } from '../src/chart/io';
import { standardToChart, STANDARDS } from '../src/chart/standards';
import { detectKey } from '../src/theory/keys';
import {
  detectLocalKeySpans,
  findKeySpan,
  spanKey,
  type KeySpan,
} from '../src/theory/localKeys';
import { suggestForChord } from '../src/theory/suggest';

function analyse(chart: Chart, pinned: KeySpan[] = chart.keySpans ?? []) {
  const globalKey = detectKey(parseSlots(chart)).key;
  return detectLocalKeySpans(chordTimeline(chart), globalKey, pinned);
}

const spanNames = (chart: Chart) =>
  analyse(chart).spans.map((span) => ({
    start: span.startBar + 1,
    end: span.endBar + 1,
    name: spanKey(span).name,
  }));

describe('local key-centre detection', () => {
  it('finds the C minor → D♭ major → C minor centres in Blue Bossa', () => {
    expect(spanNames(blueBossa())).toEqual([
      { start: 1, end: 8, name: 'C minor' },
      { start: 9, end: 12, name: 'D♭ major' },
      { start: 13, end: 24, name: 'C minor' },
      { start: 25, end: 28, name: 'D♭ major' },
      { start: 29, end: 32, name: 'C minor' },
    ]);
  });

  it('keeps Autumn Leaves in one relative major/minor centre', () => {
    const spans = analyse(autumnLeaves()).spans;
    expect(spans).toHaveLength(1);
    expect(spans[0].startBar).toBe(0);
    expect(spans[0].endBar).toBe(31);
    expect(spanKey(spans[0]).name).toBe('G minor');
  });

  it('moves All the Things You Are across distant centres without bar-by-bar flipping', () => {
    const standard = STANDARDS.find((entry) => entry.id === 'all-the-things-you-are');
    expect(standard).toBeTruthy();
    if (!standard) return;

    const spans = analyse(standardToChart(standard)).spans;
    expect(spans.length).toBeGreaterThanOrEqual(3);
    expect(new Set(spans.map((span) => spanKey(span).name)).size).toBeGreaterThanOrEqual(2);
    expect(spanKey(spans[0]).name).toBe('A♭ major');
    expect(spanKey(spans[spans.length - 1]).name).toBe('A♭ major');
    expect(spans.map((span) => spanKey(span).name)).toContain('B♭ minor');
    for (const span of spans) expect(span.endBar - span.startBar + 1).toBeGreaterThanOrEqual(2);
  });

  it('ranks chord scales against the local centre, not the chart key', () => {
    const chart = blueBossa();
    const events = chordTimeline(chart);
    const analysis = analyse(chart);
    const ebm7 = events.find((event) => event.chord.input === 'Ebm7');
    expect(ebm7).toBeTruthy();
    if (!ebm7) return;

    const localKey = analysis.slotKeys.get(ebm7.slotId);
    expect(localKey?.name).toBe('D♭ major');
    if (!localKey) return;

    const top = suggestForChord(ebm7.chord, localKey)[0];
    expect(top.scaleId).toBe('dorian');
    expect(top.bucket).toBe('key');
    expect(top.added).toHaveLength(0);
  });
});

describe('pinned local key spans', () => {
  const pinned: KeySpan = {
    id: 'pin-1',
    startSlot: '',
    endSlot: '',
    tonic: 7,
    mode: 'major',
    confidence: 1,
    source: 'pinned',
  };

  function pinnedBlueBossa(): { chart: Chart; span: KeySpan } {
    const chart = blueBossa();
    const slot = chart.bars[0].slots[0];
    const span = { ...pinned, startSlot: slot.id, endSlot: slot.id };
    return { chart: { ...chart, keySpans: [span] }, span };
  }

  it('hard-overrides the auto span and its slot key', () => {
    const { chart, span } = pinnedBlueBossa();
    const analysis = analyse(chart);
    const atBarOne = findKeySpan(analysis.spans, 0);
    expect(atBarOne?.source).toBe('pinned');
    expect(spanKey(atBarOne!)).toMatchObject({ tonic: 7, mode: 'major' });
    expect(analysis.slotKeys.get(span.startSlot)?.name).toBe('G major');
  });

  it('survives .gsm.json export and re-import', () => {
    const { chart, span } = pinnedBlueBossa();
    const parsed = parseChartText(JSON.stringify(serializeChart(chart)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.chart.keySpans).toHaveLength(1);
    expect(parsed.chart.keySpans![0]).toMatchObject({
      id: span.id,
      startSlot: span.startSlot,
      endSlot: span.endSlot,
      tonic: 7,
      mode: 'major',
      source: 'pinned',
    });
  });

  it('drops spans whose slots no longer exist', () => {
    const { chart } = pinnedBlueBossa();
    const raw = {
      ...serializeChart(chart),
      chart: {
        ...chart,
        keySpans: [{ ...chart.keySpans![0], startSlot: 'missing-slot' }],
      },
    };
    const parsed = parseChartText(JSON.stringify(raw));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.chart.keySpans).toBeUndefined();
  });

  it('transposes pinned spans with the chart', () => {
    const { chart, span } = pinnedBlueBossa();
    const transposed = transposeChart(chart, 2);
    expect(transposed.keySpans).toHaveLength(1);
    expect(transposed.keySpans![0].tonic).toBe(9);
    expect(transposed.keySpans![0].startSlot).toBe(span.startSlot);
    expect(transposed.keySpans![0].endSlot).toBe(span.endSlot);
  });

  it('still auto-detects when an older file has no keySpans', () => {
    const chart = blueBossa();
    const parsed = parseChartText(JSON.stringify(serializeChart(chart)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.chart.keySpans).toBeUndefined();
    expect(analyse(parsed.chart).spans.length).toBeGreaterThan(0);
  });
});
