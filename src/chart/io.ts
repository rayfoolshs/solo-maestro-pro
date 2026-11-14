import {
  quantizeBeat, uid,
  type Bar, type Chart, type ChordSlot, type MelodyNote, type RhythmHit, type Style,
} from './model';
import { STYLES } from '../arrange/styles';
import type { KeySpan } from '../theory/localKeys';

export const CHART_FORMAT = 'solo-maestro-pro/chart';
/** Format ids written by earlier Guitar Solo Maestro builds. */
export const LEGACY_CHART_FORMATS = ['guitar-solo-maestro/chart'] as const;
export const ACCEPTED_CHART_FORMATS: readonly string[] = [CHART_FORMAT, ...LEGACY_CHART_FORMATS];
export const CHART_FILE_VERSION = 1;
export const MAX_CHART_BYTES = 1_000_000;
const MAX_BARS = 256;
const MAX_SLOTS_PER_BAR = 8;

export interface ChartFile {
  format: typeof CHART_FORMAT;
  version: number;
  savedAt: string;
  chart: Chart;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const asNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asBool = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const wrapTranspose = (value: unknown): number => {
  const rounded = Math.round(asNumber(value, 0));
  const wrapped = ((rounded % 12) + 12) % 12;
  return wrapped > 6 ? wrapped - 12 : wrapped;
};

const SAFE_ID = /^[A-Za-z0-9_-]{1,40}$/;
const FORBIDDEN_IDS = new Set(['__proto__', 'constructor', 'prototype']);

const safeId = (value: unknown, used: Set<string>, prefix: string): string => {
  const candidate = asString(value);
  if (SAFE_ID.test(candidate) && !FORBIDDEN_IDS.has(candidate) && !used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }
  let id = uid(prefix);
  while (used.has(id)) id = uid(prefix);
  used.add(id);
  return id;
};

const safeName = (value: unknown, fallback: string): string => {
  const name = asString(value).trim().slice(0, 120);
  return name || fallback;
};

/** Validate optional pinned local key spans against the imported bars. */
const normalizeKeySpans = (input: unknown, bars: Bar[]): KeySpan[] | undefined => {
  if (!Array.isArray(input)) return undefined;
  const slotIds = new Set(bars.flatMap((bar) => bar.slots.map((slot) => slot.id)));
  const usedIds = new Set<string>();
  const spans: KeySpan[] = [];

  for (const raw of input) {
    if (!isObject(raw)) continue;
    const startSlot = asString(raw.startSlot);
    const endSlot = asString(raw.endSlot);
    if (!slotIds.has(startSlot) || !slotIds.has(endSlot)) continue;

    const tonic = Math.round(asNumber(raw.tonic, -1));
    if (tonic < 0 || tonic > 11) continue;
    const mode: 'major' | 'minor' | null =
      raw.mode === 'major' || raw.mode === 'minor' ? raw.mode : null;
    if (!mode) continue;
    const source: 'auto' | 'pinned' | null =
      raw.source === 'pinned' || raw.source === 'auto' ? raw.source : null;
    if (!source) continue;

    spans.push({
      id: safeId(raw.id, usedIds, 'key'),
      startSlot,
      endSlot,
      tonic,
      mode,
      confidence: clamp(asNumber(raw.confidence, source === 'pinned' ? 1 : 0.5), 0, 1),
      source,
    });
  }

  return spans.length ? spans : undefined;
};

/**
 * Build a fresh Chart from untrusted data, field by field. Never spreads the
 * parsed object, so unknown keys and prototype tricks cannot reach app state.
 * Returns null when there is no usable bar data.
 */
export function normalizeChart(input: unknown): Chart | null {
  if (!isObject(input)) return null;

  const timeSignature: Chart['timeSignature'] = input.timeSignature === '3/4' ? '3/4' : '4/4';
  const bpb = timeSignature === '3/4' ? 3 : 4;

  const rawBars = Array.isArray(input.bars) ? input.bars.slice(0, MAX_BARS) : [];
  const usedBarIds = new Set<string>();
  const usedSlotIds = new Set<string>();
  const usedMelodyIds = new Set<string>();

  const hits = new Set(['push', 'kick', 'stop', 'slash']);
  const normalizeHit = (value: unknown): RhythmHit | undefined =>
    typeof value === 'string' && hits.has(value) ? value as RhythmHit : undefined;

  const normalizeMelody = (value: unknown): MelodyNote[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const notes: MelodyNote[] = [];
    const starts = new Set<number>();

    for (const raw of value.slice(0, 64)) {
      if (!isObject(raw)) continue;
      const startBeat = quantizeBeat(clamp(asNumber(raw.startBeat, 0), 0, bpb - 0.25));
      if (starts.has(startBeat)) continue;
      const durationBeats = quantizeBeat(
        clamp(asNumber(raw.durationBeats, 1), 0.25, bpb - startBeat),
      );
      if (durationBeats < 0.25) continue;

      let pitchMidi: number | null;
      if (raw.pitchMidi === null) {
        pitchMidi = null;
      } else {
        const pitch = Math.round(asNumber(raw.pitchMidi, NaN));
        if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) continue;
        pitchMidi = pitch;
      }

      const note: MelodyNote = {
        id: safeId(raw.id, usedMelodyIds, 'm'),
        pitchMidi,
        startBeat,
        durationBeats,
      };
      if (asBool(raw.tieToNext, false)) note.tieToNext = true;
      const lyric = asString(raw.lyric).trim().slice(0, 40);
      if (lyric) note.lyric = lyric;
      notes.push(note);
      starts.add(startBeat);
    }

    notes.sort((a, b) => a.startBeat - b.startBeat);
    return notes.length ? notes : undefined;
  };

  const bars: Bar[] = rawBars
    .filter(isObject)
    .map((rawBar) => {
      const rawSlots = Array.isArray(rawBar.slots) ? rawBar.slots.slice(0, MAX_SLOTS_PER_BAR) : [];
      const slots: ChordSlot[] = rawSlots
        .filter(isObject)
        .map((rawSlot) => {
          const inputChord = asString(rawSlot.input).trim().slice(0, 40);
          if (!inputChord) return null;
          const hit = normalizeHit(rawSlot.hit);
          return {
            id: safeId(rawSlot.id, usedSlotIds, 's'),
            beat: Math.round(clamp(asNumber(rawSlot.beat, 0), 0, bpb - 0.25) * 100) / 100,
            input: inputChord,
            ...(hit ? { hit } : {}),
          };
        })
        .filter((slot): slot is ChordSlot => !!slot)
        .sort((a, b) => a.beat - b.beat);
      const melody = normalizeMelody(rawBar.melody);
      return {
        id: safeId(rawBar.id, usedBarIds, 'b'),
        slots,
        ...(melody ? { melody } : {}),
      };
    });

  if (rawBars.length === 0) return null;

  while (bars.length < 4) bars.push({ id: safeId(undefined, usedBarIds, 'b'), slots: [] });

  const pinsInput = isObject(input.pins) ? input.pins : {};
  const pins: Record<string, string> = {};
  for (const bar of bars) {
    for (const slot of bar.slots) {
      const pin = pinsInput[slot.id];
      if (typeof pin === 'string' && pin && SAFE_ID.test(pin)) pins[slot.id] = pin.slice(0, 40);
    }
  }

  const rawKey = isObject(input.keyManual) ? input.keyManual : null;
  const tonic = rawKey ? asNumber(rawKey.tonic, -1) : -1;
  const mode: 'major' | 'minor' | null =
    rawKey?.mode === 'major' || rawKey?.mode === 'minor' ? rawKey.mode : null;
  const keyManual = mode && tonic >= 0 && tonic <= 11
    ? { tonic: Math.round(tonic), mode }
    : null;

  const style = typeof input.style === 'string' && Object.prototype.hasOwnProperty.call(STYLES, input.style)
    ? (input.style as Style)
    : 'jazz';

  const metadata: Pick<Chart, 'composer' | 'year' | 'form' | 'tags'> = {};
  const composer = asString(input.composer).trim().slice(0, 120);
  if (composer) metadata.composer = composer;
  const year = asNumber(input.year, NaN);
  if (Number.isInteger(year) && year > 1000 && year < 3000) metadata.year = year;
  const form = asString(input.form).trim().slice(0, 60);
  if (form) metadata.form = form;
  const tags = Array.isArray(input.tags)
    ? [...new Set(input.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim().slice(0, 24)).filter(Boolean))].slice(0, 8)
    : [];
  if (tags.length) metadata.tags = tags;

  const maxVisible = Math.min(64, bars.length);
  const visibleBars = clamp(
    Math.round(asNumber(input.visibleBars, bars.length)),
    Math.min(4, maxVisible),
    maxVisible,
  );

  const keySpans = normalizeKeySpans(input.keySpans, bars);

  return {
    id: uid('c'),
    name: safeName(input.name, ''),
    timeSignature,
    bars,
    visibleBars,
    keyManual,
    tempo: Math.round(clamp(asNumber(input.tempo, 120), 40, 220)),
    style,
    swing: clamp(asNumber(input.swing, 0.62), 0, 1),
    countIn: asBool(input.countIn, true),
    metronome: asBool(input.metronome, false),
    pianoOctave: Math.round(clamp(asNumber(input.pianoOctave, 0), -2, 2)),
    pins,
    ...(keySpans ? { keySpans } : {}),
    transpose: wrapTranspose(input.transpose),
    ...metadata,
  };
}

export function serializeChart(chart: Chart): ChartFile {
  return {
    format: CHART_FORMAT,
    version: CHART_FILE_VERSION,
    savedAt: new Date().toISOString(),
    chart,
  };
}

export type ParseResult = { ok: true; chart: Chart } | { ok: false; error: string };

export function parseChartText(text: string): ParseResult {
  if (text.length > MAX_CHART_BYTES) return { ok: false, error: 'That file is too large (1 MB maximum).' };

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }

  if (!isObject(data)) return { ok: false, error: 'That file is not a chart.' };
  if (typeof data.format === 'string' && !ACCEPTED_CHART_FORMATS.includes(data.format)) {
    return { ok: false, error: 'That file is not a Solo Maestro Pro chart.' };
  }
  const candidate = isObject(data.chart) ? data.chart : data;
  const chart = normalizeChart(candidate);
  if (!chart) return { ok: false, error: 'No chord chart found in that file.' };
  return { ok: true, chart };
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'chart';
}

/** Serialize and download the chart as a .gsm.json file. */
export function downloadChart(chart: Chart): void {
  const blob = new Blob([JSON.stringify(serializeChart(chart), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugify(chart.name || 'chart')}.gsm.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
