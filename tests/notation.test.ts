import { describe, expect, it } from 'vitest';
import {
  FLAG_GLYPH, NOTEHEAD_GLYPH, REST_GLYPH, accidentalFor, midiToStaffStep,
  noteDurationKind, staffYForStep,
} from '../src/chart/notation';

describe('notation helpers', () => {
  it('maps beat lengths to note kinds', () => {
    expect(noteDurationKind(4)).toBe('whole');
    expect(noteDurationKind(2)).toBe('half');
    expect(noteDurationKind(1)).toBe('quarter');
    expect(noteDurationKind(0.5)).toBe('eighth');
    expect(noteDurationKind(0.25)).toBe('sixteenth');
  });

  it('uses distinct flag glyphs for eighths and sixteenths', () => {
    expect(FLAG_GLYPH.eighth.up).not.toBe(FLAG_GLYPH.sixteenth.up);
    expect(FLAG_GLYPH.eighth.down).not.toBe(FLAG_GLYPH.sixteenth.down);
    expect(NOTEHEAD_GLYPH.quarter).toBe('\uE0A2');
    expect(REST_GLYPH.quarter).toBe('\uE4E5');
  });

  it('places E4 and F5 on the treble stave', () => {
    expect(midiToStaffStep(64)).toBe(30);
    expect(midiToStaffStep(77)).toBe(38);
    expect(staffYForStep(30)).toBe(31);
    expect(staffYForStep(38)).toBe(3);
  });

  it('spells accidentals according to the key preference', () => {
    expect(accidentalFor(61, false)).toBe('#');
    expect(accidentalFor(61, true)).toBe('b');
    expect(accidentalFor(60, true)).toBeNull();
  });
});
