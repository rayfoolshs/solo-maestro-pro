import { mod12 } from './pitch';

export type TuningId =
  | 'standard'
  | 'dropD'
  | 'dadgad'
  | 'openG'
  | 'sevenString'
  | 'bass4';

export interface TuningProfile {
  id: TuningId;
  label: string;
  /** Open-string MIDI notes, index 0 = lowest-pitched string. */
  openStrings: number[];
  stringNames: string[];
}

export const TUNINGS: TuningProfile[] = [
  {
    id: 'standard',
    label: 'Standard E',
    openStrings: [40, 45, 50, 55, 59, 64],
    stringNames: ['E', 'A', 'D', 'G', 'B', 'E'],
  },
  {
    id: 'dropD',
    label: 'Drop D',
    openStrings: [38, 45, 50, 55, 59, 64],
    stringNames: ['D', 'A', 'D', 'G', 'B', 'E'],
  },
  {
    id: 'dadgad',
    label: 'DADGAD',
    openStrings: [38, 45, 50, 55, 57, 62],
    stringNames: ['D', 'A', 'D', 'G', 'A', 'D'],
  },
  {
    id: 'openG',
    label: 'Open G',
    openStrings: [38, 43, 50, 55, 59, 62],
    stringNames: ['D', 'G', 'D', 'G', 'B', 'D'],
  },
  {
    id: 'sevenString',
    label: '7-String (B–E–A–D–G–B–E)',
    openStrings: [35, 40, 45, 50, 55, 59, 64],
    stringNames: ['B', 'E', 'A', 'D', 'G', 'B', 'E'],
  },
  {
    id: 'bass4',
    label: '4-String Bass (E–A–D–G)',
    openStrings: [28, 33, 38, 43],
    stringNames: ['E', 'A', 'D', 'G'],
  },
];

export const STANDARD_TUNING = TUNINGS[0];

export function tuningById(id: TuningId): TuningProfile {
  return TUNINGS.find((tuning) => tuning.id === id) ?? STANDARD_TUNING;
}

/** Sounding MIDI note at a fret, with the capo added to every open string. */
export function midiAt(openStrings: number[], stringIndex: number, fret: number, capo = 0): number {
  const open = openStrings[stringIndex];
  return open === undefined ? 0 : open + capo + fret;
}

/** Every fret on one string whose pitch class matches `pc`. */
export function fretsForPc(
  openStrings: number[],
  stringIndex: number,
  pc: number,
  minFret = 0,
  maxFret = 24,
  capo = 0,
): number[] {
  const open = openStrings[stringIndex];
  if (open === undefined) return [];
  const frets: number[] = [];
  for (let fret = Math.max(0, minFret); fret <= maxFret; fret++) {
    if (mod12(open + capo + fret) === mod12(pc)) frets.push(fret);
  }
  return frets;
}
