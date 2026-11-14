import { mod12 } from './pitch';
import type { ParsedChord } from './chords';
import { fretsForPc } from './tunings';

export type CagedShapeId = 'C' | 'A' | 'G' | 'E' | 'D';
export type ShellRole = 'R' | '3' | '7';

export interface FretPoint {
  stringIndex: number;
  fret: number;
  pc: number;
  role?: ShellRole;
}

export interface ShapeBox {
  from: number;
  to: number;
  /** Lowest string index covered (inclusive). */
  stringFrom: number;
  /** Highest string index covered (inclusive). */
  stringTo: number;
}

export interface CagedShapeResult {
  shape: CagedShapeId;
  rootStringIndex: number;
  rootFret: number;
  box: ShapeBox;
  positions: FretPoint[];
}

export interface ThreeNpsPattern {
  positions: FretPoint[];
  box: ShapeBox;
  from: number;
  to: number;
}

export interface ShellGrip {
  stringSet: number[];
  positions: FretPoint[];
  box: ShapeBox;
  span: number;
  order: 'R-3-7' | 'R-7-3';
}

export interface ShellTones {
  rootPc: number;
  thirdPc: number;
  seventhPc: number;
}

const CAGED_CONFIG: Record<CagedShapeId, { rootString: number; before: number; after: number }> = {
  C: { rootString: 1, before: 1, after: 2 },
  A: { rootString: 1, before: 2, after: 1 },
  G: { rootString: 0, before: 3, after: 1 },
  E: { rootString: 0, before: 0, after: 3 },
  D: { rootString: 2, before: 0, after: 3 },
};

const stringOffset = (stringCount: number) => (stringCount > 6 ? stringCount - 6 : 0);

const scaleSet = (scalePcs: number[]) => new Set(scalePcs.map(mod12));

function boxFor(positions: FretPoint[], stringFrom: number, stringTo: number): ShapeBox {
  const frets = positions.map((point) => point.fret);
  return {
    from: Math.min(...frets),
    to: Math.max(...frets),
    stringFrom,
    stringTo,
  };
}

export interface CagedOptions {
  minFret?: number;
  maxFret?: number;
  /** Choose the root occurrence closest to this fret. */
  preferFret?: number;
}

/**
 * A CAGED position box anchored on the active root. The box filters the
 * scale tones shown on the neck; the user can choose which shape to work in.
 */
export function cagedShape(
  openStrings: number[],
  rootPc: number,
  scalePcs: number[],
  shape: CagedShapeId,
  options: CagedOptions = {},
): CagedShapeResult | null {
  const maxFret = options.maxFret ?? 24;
  const minFret = options.minFret ?? 0;
  const preferFret = options.preferFret ?? 0;
  const config = CAGED_CONFIG[shape];
  const offset = stringOffset(openStrings.length);
  const rootStringIndex = Math.min(openStrings.length - 1, config.rootString + offset);
  if (rootStringIndex < 0) return null;

  const rootFrets = fretsForPc(openStrings, rootStringIndex, rootPc, minFret, maxFret);
  if (!rootFrets.length) return null;

  const rootFret = rootFrets.reduce(
    (best, fret) => (Math.abs(fret - preferFret) < Math.abs(best - preferFret) ? fret : best),
    rootFrets[0],
  );
  const from = Math.max(0, rootFret - config.before);
  const to = Math.min(maxFret, rootFret + config.after);
  const pcs = scaleSet(scalePcs);
  const positions: FretPoint[] = [];

  for (let stringIndex = 0; stringIndex < openStrings.length; stringIndex++) {
    for (let fret = from; fret <= to; fret++) {
      const pc = mod12(openStrings[stringIndex] + fret);
      if (pcs.has(pc)) positions.push({ stringIndex, fret, pc });
    }
  }

  return {
    shape,
    rootStringIndex,
    rootFret,
    box: { from, to, stringFrom: 0, stringTo: openStrings.length - 1 },
    positions,
  };
}

/** Generate 3-notes-per-string scale boxes, de-duplicated across the neck. */
export function threeNpsPatterns(
  openStrings: number[],
  scalePcs: number[],
  maxFret = 24,
): ThreeNpsPattern[] {
  const pcs = scaleSet(scalePcs);
  const patterns: ThreeNpsPattern[] = [];
  const seen = new Set<string>();
  const lastStart = Math.min(12, Math.max(0, maxFret - 2));

  for (let start = 0; start <= lastStart; start++) {
    const positions: FretPoint[] = [];
    let valid = true;

    for (let stringIndex = 0; stringIndex < openStrings.length; stringIndex++) {
      const frets: number[] = [];
      for (let fret = start; fret <= maxFret && frets.length < 3; fret++) {
        const pc = mod12(openStrings[stringIndex] + fret);
        if (pcs.has(pc)) frets.push(fret);
      }
      if (frets.length < 3) {
        valid = false;
        break;
      }
      for (const fret of frets) {
        positions.push({
          stringIndex,
          fret,
          pc: mod12(openStrings[stringIndex] + fret),
        });
      }
    }

    if (!valid) continue;
    const signature = positions.map((point) => `${point.stringIndex}:${point.fret}`).join(',');
    if (seen.has(signature)) continue;
    seen.add(signature);

    const box = boxFor(positions, 0, openStrings.length - 1);
    patterns.push({ positions, box, from: box.from, to: box.to });
  }

  return patterns;
}

/** Pick the 3NPS box closest to the active position window. */
export function selectThreeNpsPattern(
  patterns: ThreeNpsPattern[],
  from: number,
  to: number,
): ThreeNpsPattern | null {
  if (!patterns.length) return null;
  const target = (from + to) / 2;
  return patterns.reduce((best, pattern) => {
    const patternCenter = (pattern.from + pattern.to) / 2;
    const bestCenter = (best.from + best.to) / 2;
    return Math.abs(patternCenter - target) < Math.abs(bestCenter - target) ? pattern : best;
  }, patterns[0]);
}

/** Root, 3rd and 7th pitch classes for a shell voicing, or null if absent. */
export function shellTonePcs(chord: ParsedChord): ShellTones | null {
  const has = (interval: number) => chord.quality.intervals.includes(interval);
  const third = has(4) ? 4 : has(3) ? 3 : null;
  const seventh = [11, 10, 9].find((interval) => has(interval)) ?? null;
  if (third === null || seventh === null) return null;
  return {
    rootPc: mod12(chord.rootPc),
    thirdPc: mod12(chord.rootPc + third),
    seventhPc: mod12(chord.rootPc + seventh),
  };
}

/**
 * Playable R–3–7 / R–7–3 grips on string sets 6-4-3 and 5-4-3
 * (shifted to E–D–G / A–D–G on a 7-string).
 *
 * The 5-4-3 set is the compact one. The 6-4-3 set is a wider stretch because
 * the low E to D string spans a seventh, so it is allowed up to six frets.
 */
export function shellVoicings(
  openStrings: number[],
  rootPc: number,
  thirdPc: number,
  seventhPc: number,
  maxFret = 24,
  maxSpan = 6,
): ShellGrip[] {
  const offset = stringOffset(openStrings.length);
  const sets = [
    [0 + offset, 2 + offset, 3 + offset],
    [1 + offset, 2 + offset, 3 + offset],
  ].filter((set) => set.every((index) => index >= 0 && index < openStrings.length));

  const grips: ShellGrip[] = [];

  for (const set of sets) {
    const [low, mid, high] = set;
    const rootFrets = fretsForPc(openStrings, low, rootPc, 0, maxFret);
    const thirdFrets = fretsForPc(openStrings, mid, thirdPc, 0, maxFret);
    const seventhFrets = fretsForPc(openStrings, high, seventhPc, 0, maxFret);

    const add = (
      midFrets: number[],
      highFrets: number[],
      order: ShellGrip['order'],
      midRole: ShellRole,
      highRole: ShellRole,
      midPc: number,
      highPc: number,
    ) => {
      for (const rootFret of rootFrets) {
        for (const midFret of midFrets) {
          for (const highFret of highFrets) {
            const frets = [rootFret, midFret, highFret];
            const span = Math.max(...frets) - Math.min(...frets);
            if (span > maxSpan) continue;
            grips.push({
              stringSet: set,
              positions: [
                { stringIndex: low, fret: rootFret, pc: mod12(rootPc), role: 'R' },
                { stringIndex: mid, fret: midFret, pc: mod12(midPc), role: midRole },
                { stringIndex: high, fret: highFret, pc: mod12(highPc), role: highRole },
              ],
              box: {
                from: Math.min(...frets),
                to: Math.max(...frets),
                stringFrom: Math.min(...set),
                stringTo: Math.max(...set),
              },
              span,
              order,
            });
          }
        }
      }
    };

    add(thirdFrets, seventhFrets, 'R-3-7', '3', '7', thirdPc, seventhPc);
    add(seventhFrets, thirdFrets, 'R-7-3', '7', '3', seventhPc, thirdPc);
  }

  const seen = new Set<string>();
  return grips
    .filter((grip) => {
      const signature = grip.positions.map((point) => `${point.stringIndex}:${point.fret}`).join(',');
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    })
    .sort((a, b) => a.span - b.span || a.stringSet.join('').localeCompare(b.stringSet.join('')));
}

/** Keep the most compact grip for each string set. */
export function bestShellGrips(grips: ShellGrip[]): ShellGrip[] {
  const best = new Map<string, ShellGrip>();
  for (const grip of grips) {
    const key = grip.stringSet.join('-');
    const current = best.get(key);
    if (!current || grip.span < current.span) best.set(key, grip);
  }
  return [...best.values()].sort((a, b) => a.stringSet[0] - b.stringSet[0]);
}
