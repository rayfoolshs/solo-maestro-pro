import { mod12, pcName } from '../theory/pitch';

export type NoteDurationKind = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth';

export const NOTEHEAD_GLYPH: Record<NoteDurationKind, string> = {
  whole: '\uE0A0',
  half: '\uE0A1',
  quarter: '\uE0A2',
  eighth: '\uE0A2',
  sixteenth: '\uE0A2',
};

export const REST_GLYPH: Record<NoteDurationKind, string> = {
  whole: '\uE4E3',
  half: '\uE4E4',
  quarter: '\uE4E5',
  eighth: '\uE4E6',
  sixteenth: '\uE4E7',
};

/** Bravura flag glyphs; the down variants attach to the bottom of the stem. */
export const FLAG_GLYPH = {
  eighth: { up: '\uE240', down: '\uE241' },
  sixteenth: { up: '\uE242', down: '\uE243' },
} as const;

const SHARP_LETTERS = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]; // C C D D E F F G G A A B
const FLAT_LETTERS = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];   // C D D E E F G G A A B B
const NATURAL_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);

export function noteDurationKind(beats: number): NoteDurationKind {
  if (beats >= 4) return 'whole';
  if (beats >= 2) return 'half';
  if (beats >= 1) return 'quarter';
  if (beats >= 0.5) return 'eighth';
  return 'sixteenth';
}

/** Diatonic staff step; E4 = 30, F5 = 38. */
export function midiToStaffStep(midi: number, flats = false): number {
  const pc = mod12(midi);
  const octave = Math.floor(midi / 12) - 1;
  const letter = (flats ? FLAT_LETTERS : SHARP_LETTERS)[pc];
  return octave * 7 + letter;
}

/** Vertical staff position in pixels (bottom line E4 at y = 31). */
export function staffYForStep(step: number, bottomLineY = 31): number {
  return bottomLineY - (step - 30) * 3.5;
}

export function staffY(midi: number, flats = false, bottomLineY = 31): number {
  return staffYForStep(midiToStaffStep(midi, flats), bottomLineY);
}

export function ledgerStepsFor(midi: number, flats = false): number[] {
  const step = midiToStaffStep(midi, flats);
  const steps: number[] = [];
  if (step < 30) {
    for (let s = 28; s >= step; s -= 2) steps.push(s);
  } else if (step > 38) {
    for (let s = 40; s <= step; s += 2) steps.push(s);
  }
  return steps;
}

export function accidentalFor(midi: number, flats: boolean): '#' | 'b' | null {
  if (NATURAL_PCS.has(mod12(midi))) return null;
  return flats ? 'b' : '#';
}

export function midiLabel(midi: number, flats: boolean): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${pcName(midi, flats)}${octave}`;
}
