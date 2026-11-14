import { describe, expect, it } from 'vitest';
import { fretsForPc, midiAt, TUNINGS, tuningById } from '../src/theory/tunings';

const standard = tuningById('standard').openStrings;

describe('tuning profiles', () => {
  it('exposes the expected presets', () => {
    expect(TUNINGS.map((tuning) => tuning.id)).toEqual([
      'standard', 'dropD', 'dadgad', 'openG', 'sevenString', 'bass4',
    ]);
    expect(tuningById('standard').openStrings).toEqual([40, 45, 50, 55, 59, 64]);
    expect(tuningById('dropD').openStrings[0]).toBe(38);
    expect(tuningById('dadgad').openStrings).toEqual([38, 45, 50, 55, 57, 62]);
    expect(tuningById('openG').openStrings).toEqual([38, 43, 50, 55, 59, 62]);
  });

  it('calculates Drop D notes', () => {
    const open = tuningById('dropD').openStrings;
    expect(midiAt(open, 0, 0)).toBe(38); // D2
    expect(midiAt(open, 0, 2)).toBe(40); // E2
    expect(midiAt(open, 5, 0)).toBe(64); // high E4
  });

  it('calculates 7-string notes', () => {
    const tuning = tuningById('sevenString');
    expect(tuning.openStrings).toHaveLength(7);
    expect(midiAt(tuning.openStrings, 0, 0)).toBe(35); // low B1
    expect(midiAt(tuning.openStrings, 0, 5)).toBe(40); // E2
    expect(midiAt(tuning.openStrings, 1, 0)).toBe(40); // low E2
  });

  it('calculates 4-string bass notes', () => {
    const tuning = tuningById('bass4');
    expect(tuning.openStrings).toHaveLength(4);
    expect(midiAt(tuning.openStrings, 0, 0)).toBe(28); // E1
    expect(midiAt(tuning.openStrings, 3, 5)).toBe(48); // C3
  });

  it('applies a capo to every open string', () => {
    expect(midiAt(standard, 0, 0, 2)).toBe(42); // F♯2
    expect(midiAt(standard, 0, 3, 2)).toBe(45); // A2
    expect(midiAt(standard, 5, 0, 12)).toBe(76); // E5
  });

  it('finds pitch classes with the capo included', () => {
    expect(fretsForPc(standard, 0, 4)).toEqual([0, 12, 24]); // E
    expect(fretsForPc(standard, 0, 4, 0, 24, 2)).toEqual([10, 22]); // E above capo 2
  });
});
