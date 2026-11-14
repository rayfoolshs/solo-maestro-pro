import { describe, expect, it } from 'vitest';
import { parseChord, type ParsedChord } from '../src/theory/chords';
import {
  bestShellGrips,
  cagedShape,
  selectThreeNpsPattern,
  shellTonePcs,
  shellVoicings,
  threeNpsPatterns,
} from '../src/theory/shapes';
import { tuningById } from '../src/theory/tunings';

const standard = tuningById('standard').openStrings;
const sevenString = tuningById('sevenString').openStrings;
const C_MAJOR = [0, 2, 4, 5, 7, 9, 11];

function chord(symbol: string): ParsedChord {
  const parsed = parseChord(symbol);
  if (!parsed.ok) throw new Error(`bad chord in test: ${symbol}`);
  return parsed;
}

describe('3-notes-per-string patterns', () => {
  it('gives every string exactly three scale tones', () => {
    const patterns = threeNpsPatterns(standard, C_MAJOR, 24);
    expect(patterns.length).toBeGreaterThan(0);

    for (const pattern of patterns) {
      expect(pattern.positions).toHaveLength(standard.length * 3);
      for (let stringIndex = 0; stringIndex < standard.length; stringIndex++) {
        expect(pattern.positions.filter((point) => point.stringIndex === stringIndex)).toHaveLength(3);
      }
      for (const point of pattern.positions) expect(C_MAJOR).toContain(point.pc);
      expect(pattern.box.to).toBeGreaterThanOrEqual(pattern.box.from);
    }
  });

  it('selects the box nearest the active position window', () => {
    const patterns = threeNpsPatterns(standard, C_MAJOR, 24);
    const selected = selectThreeNpsPattern(patterns, 5, 9);
    expect(selected).not.toBeNull();
    expect(selected!.to).toBeGreaterThanOrEqual(5);
  });
});

describe('CAGED shapes', () => {
  it('anchors the C shape on the A string', () => {
    const result = cagedShape(standard, 0, C_MAJOR, 'C', { preferFret: 5 });
    expect(result).not.toBeNull();
    expect(result!.rootStringIndex).toBe(1);
    expect(result!.rootFret).toBe(3);
    expect(result!.box).toMatchObject({ from: 2, to: 5, stringFrom: 0, stringTo: 5 });
    expect(result!.positions.length).toBeGreaterThan(0);
    for (const point of result!.positions) expect(C_MAJOR).toContain(point.pc);
  });

  it('anchors the E shape on the low E string', () => {
    const result = cagedShape(standard, 0, C_MAJOR, 'E', { preferFret: 12 });
    expect(result).not.toBeNull();
    expect(result!.rootStringIndex).toBe(0);
    expect(result!.rootFret).toBe(8); // C on the low E string
    expect(result!.box).toMatchObject({ from: 8, to: 11 });
  });

  it('shifts the root strings for a 7-string', () => {
    const result = cagedShape(sevenString, 0, C_MAJOR, 'C', { preferFret: 5 });
    expect(result).not.toBeNull();
    expect(result!.rootStringIndex).toBe(2); // A string in the 7-string layout
  });
});

describe('shell voicings', () => {
  it('derives root, third and seventh from the chord quality', () => {
    expect(shellTonePcs(chord('Cmaj7'))).toEqual({ rootPc: 0, thirdPc: 4, seventhPc: 11 });
    expect(shellTonePcs(chord('G7'))).toEqual({ rootPc: 7, thirdPc: 11, seventhPc: 5 });
    expect(shellTonePcs(chord('Cm7'))).toEqual({ rootPc: 0, thirdPc: 3, seventhPc: 10 });
    expect(shellTonePcs(chord('C5'))).toBeNull();
  });

  it('returns valid R–3–7 grips on both string sets', () => {
    const tones = shellTonePcs(chord('Cmaj7'))!;
    const grips = bestShellGrips(shellVoicings(standard, tones.rootPc, tones.thirdPc, tones.seventhPc));
    expect(grips.map((grip) => grip.stringSet.join('-'))).toEqual(['0-2-3', '1-2-3']);

    for (const grip of grips) {
      expect(grip.positions).toHaveLength(3);
      expect(grip.positions.map((point) => point.role).sort()).toEqual(['3', '7', 'R']);

      const root = grip.positions.find((point) => point.role === 'R')!;
      const third = grip.positions.find((point) => point.role === '3')!;
      const seventh = grip.positions.find((point) => point.role === '7')!;
      expect(root.pc).toBe(0);
      expect(third.pc).toBe(4);
      expect(seventh.pc).toBe(11);
      expect(root.stringIndex).toBe(grip.stringSet[0]);
      expect(grip.span).toBeLessThanOrEqual(6);
      for (const point of grip.positions) {
        expect(point.fret).toBeGreaterThanOrEqual(0);
        expect(point.fret).toBeLessThanOrEqual(24);
      }
    }

    const compact = grips.find((grip) => grip.stringSet[0] === 1)!;
    expect(compact.span).toBeLessThanOrEqual(4);
  });

  it('finds R–7–3 grips as well as R–3–7', () => {
    const tones = shellTonePcs(chord('G7'))!;
    const grips = shellVoicings(standard, tones.rootPc, tones.thirdPc, tones.seventhPc);
    expect(grips.some((grip) => grip.order === 'R-3-7')).toBe(true);
    expect(grips.some((grip) => grip.order === 'R-7-3')).toBe(true);
  });

  it('shifts the string sets on a 7-string', () => {
    const tones = shellTonePcs(chord('Cmaj7'))!;
    const grips = bestShellGrips(shellVoicings(sevenString, tones.rootPc, tones.thirdPc, tones.seventhPc));
    expect(grips.map((grip) => grip.stringSet.join('-'))).toEqual(['1-3-4', '2-3-4']);
  });
});
