import { mod12 } from './pitch';
import type { ParsedChord } from './chords';
import { ALL_KEYS, diatonicFamily, makeKey, type KeyInfo, type Mode } from './keys';

/**
 * A contiguous local key centre in the chord timeline.
 *
 * Boundaries are slot ids rather than bar/array indices so a pinned span
 * survives chord edits, saving, export and re-import.
 */
export interface KeySpan {
  id: string;
  startSlot: string;
  endSlot: string;
  tonic: number;
  mode: Mode;
  confidence: number;
  source: 'auto' | 'pinned';
}

/** A chord event as the theory engine sees it. */
export interface ChordEvent {
  slotId: string;
  barIndex: number;
  beat: number;
  chord: ParsedChord;
  /** Beats until the next chord or the end of the bar. */
  durationBeats?: number;
}

/** A KeySpan resolved against a concrete timeline. */
export interface ResolvedKeySpan extends KeySpan {
  startBar: number;
  endBar: number;
  startIndex: number;
  endIndex: number;
}

export interface LocalKeyAnalysis {
  spans: ResolvedKeySpan[];
  /** The active key centre for every chord slot. */
  slotKeys: Map<string, KeyInfo>;
}

export interface LocalKeyOptions {
  /** Score cost for changing key between adjacent chord events. */
  modulationPenalty?: number;
  /** Small per-event prior for the chart's global key. */
  globalPrior?: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const isTonic = (chord: ParsedChord, key: KeyInfo): boolean =>
  chord.rootPc === key.tonic &&
  (key.mode === 'major' ? chord.quality.family === 'major' : chord.quality.family === 'minor');

const isDominantOf = (chord: ParsedChord, key: KeyInfo): boolean =>
  chord.rootPc === mod12(key.tonic + 7) &&
  (chord.quality.family === 'dominant' || chord.quality.family === 'major');

const isTwoOf = (chord: ParsedChord, key: KeyInfo): boolean =>
  chord.rootPc === mod12(key.tonic + 2) &&
  (chord.quality.family === 'minor' || chord.quality.family === 'dim');

/** Emission score for one chord event under one candidate key. */
function scoreEvent(
  events: ChordEvent[],
  index: number,
  key: KeyInfo,
  globalKey: KeyInfo,
  globalPrior: number,
): number {
  const chord = events[index].chord;
  const keyPcs = new Set(key.pcs);
  const harmonicPcs = key.mode === 'minor'
    ? new Set([...key.pcs, mod12(key.tonic + 11)])
    : keyPcs;

  let score = 0;
  score += keyPcs.has(chord.rootPc) ? 2.2 : -2.4;

  let inKey = 0;
  for (const pc of chord.intervals) if (keyPcs.has(pc)) inKey++;
  const toneCount = chord.intervals.length;
  score += 3.6 * (inKey / toneCount);
  score -= 0.9 * (toneCount - inKey);

  // A minor-key V7 borrows the harmonic-minor leading tone.
  if (
    key.mode === 'minor' &&
    chord.rootPc === mod12(key.tonic + 7) &&
    chord.quality.family === 'dominant'
  ) {
    let inHarmonic = 0;
    for (const pc of chord.intervals) if (harmonicPcs.has(pc)) inHarmonic++;
    score += 2.8 * (inHarmonic / toneCount);
  }

  const degree = key.pcs.indexOf(chord.rootPc);
  if (degree >= 0) {
    const family = diatonicFamily(key.pcs, degree);
    if (family === chord.quality.family) score += 3;
    else if (chord.quality.family === 'dominant' && family === 'major') score += 1;
  }

  if (isTonic(chord, key)) score += 2.5;
  if (isDominantOf(chord, key)) score += 2;
  if (isTwoOf(chord, key)) score += 1.4;

  const prev = events[index - 1]?.chord;
  const prev2 = events[index - 2]?.chord;
  const next = events[index + 1]?.chord;

  if (prev && isDominantOf(prev, key) && isTonic(chord, key)) score += 6;
  if (prev && isTwoOf(prev, key) && isDominantOf(chord, key)) score += 2.5;
  if (prev2 && prev && isTwoOf(prev2, key) && isDominantOf(prev, key) && isTonic(chord, key)) score += 7;
  if (next && isTwoOf(chord, key) && isDominantOf(next, key)) score += 1.5;
  if (next && isDominantOf(chord, key) && isTonic(next, key)) score += 1.5;

  if (key.tonic === globalKey.tonic && key.mode === globalKey.mode) score += globalPrior;

  const duration = events[index].durationBeats ?? 4;
  const rhythmWeight = 0.7 + (0.3 * Math.min(4, Math.max(1, duration))) / 4;
  return score * rhythmWeight;
}

interface PinnedRange {
  span: KeySpan;
  start: number;
  end: number;
}

function pinnedRanges(events: ChordEvent[], pinned: KeySpan[]): PinnedRange[] {
  const indexBySlot = new Map(events.map((event, index) => [event.slotId, index]));
  const ranges: PinnedRange[] = [];
  for (const span of pinned) {
    if (span.source !== 'pinned') continue;
    const a = indexBySlot.get(span.startSlot);
    const b = indexBySlot.get(span.endSlot);
    if (a === undefined || b === undefined) continue;
    ranges.push({ span, start: Math.min(a, b), end: Math.max(a, b) });
  }
  ranges.sort((a, b) => a.start - b.start || a.end - b.end);

  const clean: PinnedRange[] = [];
  let lastEnd = -1;
  for (const range of ranges) {
    if (range.start <= lastEnd) continue;
    clean.push(range);
    lastEnd = range.end;
  }
  return clean;
}

function spanConfidence(
  emissions: number[][],
  keyIndex: number,
  start: number,
  end: number,
): number {
  let marginSum = 0;
  for (let i = start; i <= end; i++) {
    const assigned = emissions[i][keyIndex];
    let bestOther = -Infinity;
    for (let k = 0; k < ALL_KEYS.length; k++) {
      if (k !== keyIndex) bestOther = Math.max(bestOther, emissions[i][k]);
    }
    marginSum += assigned - bestOther;
  }
  const margin = marginSum / (end - start + 1);
  const lengthBoost = Math.min(0.12, (end - start) * 0.01);
  return clamp(0.45 + margin / 18 + lengthBoost, 0.15, 0.99);
}

/** True for a major key and its relative minor (same key signature). */
export function isRelativeKey(a: Pick<KeySpan, 'tonic' | 'mode'>, b: Pick<KeySpan, 'tonic' | 'mode'>): boolean {
  if (a.mode === 'major' && b.mode === 'minor') return mod12(a.tonic + 9) === b.tonic;
  if (a.mode === 'minor' && b.mode === 'major') return mod12(a.tonic + 3) === b.tonic;
  return false;
}

/**
 * Merge adjacent auto spans that are relative major/minor centres. They share
 * a key signature, so switching between them is not a modulation and would
 * otherwise show up as noisy bar-by-bar flipping.
 */
function mergeRelativeSpans(spans: ResolvedKeySpan[], globalKey: KeyInfo): ResolvedKeySpan[] {
  const merged: ResolvedKeySpan[] = [];
  for (const span of spans) {
    const prev = merged[merged.length - 1];
    const sameKey = !!prev && prev.tonic === span.tonic && prev.mode === span.mode;
    if (!prev || prev.source !== 'auto' || span.source !== 'auto' || (!sameKey && !isRelativeKey(prev, span))) {
      merged.push(span);
      continue;
    }

    const prevLength = prev.endIndex - prev.startIndex + 1;
    const spanLength = span.endIndex - span.startIndex + 1;
    const total = prevLength + spanLength;
    const prevIsGlobal = prev.tonic === globalKey.tonic && prev.mode === globalKey.mode;
    const spanIsGlobal = span.tonic === globalKey.tonic && span.mode === globalKey.mode;

    let chosen = prev;
    if (spanIsGlobal && !prevIsGlobal) chosen = span;
    else if (prevIsGlobal === spanIsGlobal) {
      if (spanLength > prevLength || (spanLength === prevLength && span.confidence > prev.confidence)) {
        chosen = span;
      }
    }

    merged[merged.length - 1] = {
      ...prev,
      id: `auto:${prev.startSlot}:${span.endSlot}`,
      startSlot: prev.startSlot,
      endSlot: span.endSlot,
      tonic: chosen.tonic,
      mode: chosen.mode,
      confidence: (prev.confidence * prevLength + span.confidence * spanLength) / total,
      startBar: prev.startBar,
      endBar: span.endBar,
      startIndex: prev.startIndex,
      endIndex: span.endIndex,
    };
  }
  return merged;
}

/**
 * Detect local key centres across a chord timeline.
 *
 * 1. Score all 24 keys per chord using diatonic fit, chord quality and
 *    ii–V–I / V–I motion, weighted by harmonic rhythm.
 * 2. Run Viterbi-style dynamic programming with a modulation penalty so a
 *    passing secondary dominant does not flip the whole analysis.
 * 3. Hard-constrain any pinned spans, then merge them with the auto spans.
 */
export function detectLocalKeySpans(
  timeline: ChordEvent[],
  globalKey: KeyInfo,
  pinned: KeySpan[] = [],
  options: LocalKeyOptions = {},
): LocalKeyAnalysis {
  const events = timeline.filter((event) => event.chord && event.chord.ok);
  if (!events.length) return { spans: [], slotKeys: new Map() };

  const penalty = options.modulationPenalty ?? 7.5;
  const globalPrior = options.globalPrior ?? 1.2;
  const keyCount = ALL_KEYS.length;
  const eventCount = events.length;

  const emissions: number[][] = events.map((_, index) =>
    ALL_KEYS.map((key) => scoreEvent(events, index, key, globalKey, globalPrior)),
  );

  const ranges = pinnedRanges(events, pinned);

  // Pinned events accept only their pinned key.
  const forcedKey = new Int16Array(eventCount).fill(-1);
  for (const range of ranges) {
    const keyIndex = ALL_KEYS.findIndex(
      (key) => key.tonic === mod12(range.span.tonic) && key.mode === range.span.mode,
    );
    if (keyIndex < 0) continue;
    for (let i = range.start; i <= range.end; i++) forcedKey[i] = keyIndex;
  }

  const dp: Float64Array[] = Array.from({ length: eventCount }, () => new Float64Array(keyCount));
  const back: Int8Array[] = Array.from({ length: eventCount }, () => new Int8Array(keyCount));

  for (let k = 0; k < keyCount; k++) {
    dp[0][k] = forcedKey[0] === -1 || forcedKey[0] === k ? emissions[0][k] : -1e12;
  }

  for (let i = 1; i < eventCount; i++) {
    let best1 = -Infinity;
    let best1Key = 0;
    let best2 = -Infinity;
    for (let k = 0; k < keyCount; k++) {
      const value = dp[i - 1][k];
      if (value > best1) {
        best2 = best1;
        best1 = value;
        best1Key = k;
      } else if (value > best2) {
        best2 = value;
      }
    }
    for (let k = 0; k < keyCount; k++) {
      const stay = dp[i - 1][k];
      const switchFrom = k === best1Key ? best2 : best1;
      const switchValue = switchFrom - penalty;
      const forced = forcedKey[i];
      if (forced !== -1 && forced !== k) {
        dp[i][k] = -1e12;
        back[i][k] = k;
      } else if (stay >= switchValue) {
        dp[i][k] = stay + emissions[i][k];
        back[i][k] = k;
      } else {
        dp[i][k] = switchValue + emissions[i][k];
        back[i][k] = best1Key;
      }
    }
  }

  let lastKey = 0;
  let lastScore = -Infinity;
  for (let k = 0; k < keyCount; k++) {
    if (dp[eventCount - 1][k] > lastScore) {
      lastScore = dp[eventCount - 1][k];
      lastKey = k;
    }
  }

  const assignments = new Array<number>(eventCount);
  let cursor = lastKey;
  for (let i = eventCount - 1; i >= 0; i--) {
    assignments[i] = cursor;
    if (i > 0) cursor = back[i][cursor];
  }

  const spanKeyInfo = (span: KeySpan): KeyInfo => makeKey(span.tonic, span.mode);
  const spans: ResolvedKeySpan[] = [];

  const pushSpan = (span: ResolvedKeySpan) => {
    spans.push(span);
  };

  let autoStart = -1;
  let autoKey = -1;

  const flushAuto = (end: number) => {
    if (autoStart < 0) return;
    const first = events[autoStart];
    const last = events[end];
    const span: ResolvedKeySpan = {
      id: `auto:${first.slotId}:${last.slotId}`,
      startSlot: first.slotId,
      endSlot: last.slotId,
      tonic: ALL_KEYS[autoKey].tonic,
      mode: ALL_KEYS[autoKey].mode,
      confidence: spanConfidence(emissions, autoKey, autoStart, end),
      source: 'auto',
      startBar: first.barIndex,
      endBar: last.barIndex,
      startIndex: autoStart,
      endIndex: end,
    };
    pushSpan(span);
    autoStart = -1;
    autoKey = -1;
  };

  let index = 0;
  while (index < eventCount) {
    const range = ranges.find((candidate) => candidate.start === index);
    if (range) {
      flushAuto(index - 1);
      const first = events[range.start];
      const last = events[range.end];
      pushSpan({
        ...range.span,
        confidence: range.span.confidence || 1,
        startBar: first.barIndex,
        endBar: last.barIndex,
        startIndex: range.start,
        endIndex: range.end,
      });
      index = range.end + 1;
      continue;
    }

    const keyIndex = assignments[index];
    if (autoStart >= 0 && keyIndex === autoKey) {
      index++;
      continue;
    }
    flushAuto(index - 1);
    autoStart = index;
    autoKey = keyIndex;
    index++;
  }
  flushAuto(eventCount - 1);

  spans.sort((a, b) => a.startIndex - b.startIndex);
  const merged = mergeRelativeSpans(spans, globalKey);

  // Empty bars between chord events belong to the preceding key centre.
  for (let i = 0; i < merged.length - 1; i++) {
    const next = merged[i + 1];
    if (merged[i].endBar + 1 < next.startBar) {
      merged[i] = { ...merged[i], endBar: next.startBar - 1 };
    }
  }

  const slotKeys = new Map<string, KeyInfo>();
  for (const span of merged) {
    const key = spanKeyInfo(span);
    for (let i = span.startIndex; i <= span.endIndex; i++) {
      slotKeys.set(events[i].slotId, key);
    }
  }

  return { spans: merged, slotKeys };
}

/** The active local key centre at a bar, or null outside every span. */
export function findKeySpan(spans: ResolvedKeySpan[], barIndex: number): ResolvedKeySpan | null {
  let found: ResolvedKeySpan | null = null;
  for (const span of spans) {
    if (barIndex >= span.startBar && barIndex <= span.endBar) found = span;
  }
  return found;
}

/** Resolve a span's tonic/mode into the existing KeyInfo shape. */
export function spanKey(span: KeySpan): KeyInfo {
  return makeKey(span.tonic, span.mode);
}
