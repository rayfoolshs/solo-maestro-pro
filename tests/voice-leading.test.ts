import { describe, expect, it } from 'vitest';
import { parseChord, type ParsedChord } from '../src/theory/chords';
import {
  analyzeVoiceLeading,
  guideTonesOf,
  semitoneDistance,
  type GuideTone,
  type VoiceLeadingPair,
} from '../src/theory/voiceLeading';

function chord(symbol: string): ParsedChord {
  const parsed = parseChord(symbol);
  if (!parsed.ok) throw new Error(`bad chord in test: ${symbol}`);
  return parsed;
}

const pcs = (tones: GuideTone[]) => tones.map((tone) => tone.pc);
const roles = (tones: GuideTone[]) => tones.map((tone) => tone.role);
const pairs = (analysis: ReturnType<typeof analyzeVoiceLeading>) =>
  analysis.leadingPairs.map((pair) => ({
    from: pair.from,
    to: pair.to,
    semitones: pair.semitones,
  }));
const hasPair = (analysis: ReturnType<typeof analyzeVoiceLeading>, from: number, to: number, semitones: number) =>
  analysis.leadingPairs.some(
    (pair: VoiceLeadingPair) => pair.from === from && pair.to === to && pair.semitones === semitones,
  );

describe('guide tones', () => {
  it('uses the 3rd and 7th for seventh chords', () => {
    const dm7 = guideTonesOf(chord('Dm7'));
    expect(pcs(dm7).sort((a, b) => a - b)).toEqual([0, 5]); // C, F
    expect(roles(dm7)).toEqual(['3rd', '7th']);

    const g7 = guideTonesOf(chord('G7'));
    expect(pcs(g7).sort((a, b) => a - b)).toEqual([5, 11]); // F, B
  });

  it('uses the 6th on 6, 6/9 and m6 chords', () => {
    expect(pcs(guideTonesOf(chord('C6')))).toEqual([4, 9]); // E, A
    expect(pcs(guideTonesOf(chord('C6/9')))).toEqual([4, 9]);
    expect(roles(guideTonesOf(chord('Am6')))).toEqual(['3rd', '6th']);
  });

  it('uses the 4th on sus4 chords and keeps the 7th when present', () => {
    const sus = guideTonesOf(chord('G7sus4'));
    expect(pcs(sus)).toEqual([0, 5]); // C, F
    expect(roles(sus)).toEqual(['4th', '7th']);
  });

  it('returns only the third for triads without a seventh', () => {
    expect(pcs(guideTonesOf(chord('C')))).toEqual([4]);
    expect(pcs(guideTonesOf(chord('Cm')))).toEqual([3]);
    expect(pcs(guideTonesOf(chord('Cdim7')))).toEqual([3, 9]); // E♭, B♭♭
  });
});

describe('voice-leading analysis', () => {
  it('resolves Dm7 → G7 with F→F and C→B', () => {
    const analysis = analyzeVoiceLeading(chord('Dm7'), chord('G7'));
    expect(hasPair(analysis, 5, 5, 0)).toBe(true); // F → F
    expect(hasPair(analysis, 0, 11, -1)).toBe(true); // C → B
    expect(analysis.resolutionTargets.sort((a, b) => a - b)).toEqual([5, 11]);
    expect(pairs(analysis)).toHaveLength(2);
  });

  it('resolves G7 → Cmaj7 with B→B and F→E', () => {
    const analysis = analyzeVoiceLeading(chord('G7'), chord('Cmaj7'));
    expect(hasPair(analysis, 11, 11, 0)).toBe(true); // B → B
    expect(hasPair(analysis, 5, 4, -1)).toBe(true); // F → E
    expect(analysis.resolutionTargets.sort((a, b) => a - b)).toEqual([4, 11]);
  });

  it('handles a iiø–V7–i cadence', () => {
    const iiV = analyzeVoiceLeading(chord('Dm7b5'), chord('G7'));
    expect(hasPair(iiV, 5, 5, 0)).toBe(true); // F → F
    expect(hasPair(iiV, 0, 11, -1)).toBe(true); // C → B

    const vi = analyzeVoiceLeading(chord('G7'), chord('Cm7'));
    expect(hasPair(vi, 11, 10, -1)).toBe(true); // B → B♭
    expect(hasPair(vi, 5, 3, -2)).toBe(true); // F → E♭
  });

  it('resolves 6/9 guide tones without inventing a seventh', () => {
    const analysis = analyzeVoiceLeading(chord('C6/9'), chord('Fmaj7'));
    expect(hasPair(analysis, 4, 4, 0)).toBe(true); // E → E
    expect(hasPair(analysis, 9, 9, 0)).toBe(true); // A → A
  });

  it('resolves sus4 to the following dominant', () => {
    const analysis = analyzeVoiceLeading(chord('G7sus4'), chord('G7'));
    expect(hasPair(analysis, 0, 11, -1)).toBe(true); // C → B
    expect(hasPair(analysis, 5, 5, 0)).toBe(true); // F → F
  });

  it('returns guide tones but no targets when there is no next chord', () => {
    const analysis = analyzeVoiceLeading(chord('Dm7'), null);
    expect(pcs(analysis.guideTones).sort((a, b) => a - b)).toEqual([0, 5]);
    expect(analysis.resolutionTargets).toEqual([]);
    expect(analysis.leadingPairs).toEqual([]);
  });

  it('leaves out resolutions wider than two semitones', () => {
    // Cmaj7 guide tones E, B; F#maj7 guide tones A#, E#.
    const analysis = analyzeVoiceLeading(chord('Cmaj7'), chord('F#maj7'));
    for (const pair of analysis.leadingPairs) expect(Math.abs(pair.semitones)).toBeLessThanOrEqual(2);
  });
});

describe('semitoneDistance', () => {
  it('uses the shortest signed distance', () => {
    expect(semitoneDistance(5, 4)).toBe(-1);
    expect(semitoneDistance(0, 11)).toBe(-1);
    expect(semitoneDistance(11, 0)).toBe(1);
    expect(semitoneDistance(5, 5)).toBe(0);
    expect(semitoneDistance(0, 6)).toBe(6);
  });
});
