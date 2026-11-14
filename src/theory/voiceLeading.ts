import { mod12 } from './pitch';
import type { ParsedChord } from './chords';

export type GuideRole = '3rd' | '7th' | '6th' | '4th' | '2nd';

export interface GuideTone {
  pc: number;
  role: GuideRole;
  interval: number;
}

export interface VoiceLeadingPair {
  from: number;
  to: number;
  fromRole: GuideRole;
  toRole: GuideRole;
  /** Shortest signed distance in semitones, −6…+6. */
  semitones: number;
}

export interface VoiceLeadingAnalysis {
  guideTones: GuideTone[];
  nextGuideTones: GuideTone[];
  /** Pitch classes of the nearest next-chord targets. */
  resolutionTargets: number[];
  leadingPairs: VoiceLeadingPair[];
}

/**
 * The chord tones that define its quality: 3rd and 7th, except 6/9 and m6
 * chords use the 6th, and sus chords use their 4th (or 2nd for sus2).
 */
export function guideTonesOf(chord: ParsedChord): GuideTone[] {
  const has = (interval: number) => chord.quality.intervals.includes(interval);
  const tones: GuideTone[] = [];

  if (chord.quality.family === 'sus') {
    const interval = has(5) ? 5 : has(2) ? 2 : null;
    if (interval !== null) {
      tones.push({
        pc: mod12(chord.rootPc + interval),
        role: interval === 5 ? '4th' : '2nd',
        interval,
      });
    }
  } else {
    const third = has(4) ? 4 : has(3) ? 3 : null;
    if (third !== null) {
      tones.push({ pc: mod12(chord.rootPc + third), role: '3rd', interval: third });
    }
  }

  const isSixthChord =
    chord.quality.id === '6' || chord.quality.id === '69' || chord.quality.id === 'm6';

  if (isSixthChord && has(9)) {
    tones.push({ pc: mod12(chord.rootPc + 9), role: '6th', interval: 9 });
  } else {
    const seventh = [11, 10, 9].find((interval) => has(interval));
    if (seventh !== undefined) {
      tones.push({ pc: mod12(chord.rootPc + seventh), role: '7th', interval: seventh });
    }
  }

  return tones;
}

/** Shortest signed pitch-class distance, −6…+6. */
export function semitoneDistance(from: number, to: number): number {
  const delta = mod12(to - from);
  return delta > 6 ? delta - 12 : delta;
}

function nearestTone(
  from: GuideTone,
  candidates: GuideTone[],
): { tone: GuideTone; distance: number } | null {
  if (!candidates.length) return null;
  let best = candidates[0];
  let bestDistance = semitoneDistance(from.pc, best.pc);

  for (let i = 1; i < candidates.length; i++) {
    const distance = semitoneDistance(from.pc, candidates[i].pc);
    if (Math.abs(distance) < Math.abs(bestDistance)) {
      best = candidates[i];
      bestDistance = distance;
    }
  }

  return { tone: best, distance: bestDistance };
}

/**
 * Voice-leading targets from one chord to the next.
 *
 * Each current guide tone is paired with the nearest guide tone of the next
 * chord. Only 0, ±1 and ±2 semitone resolutions are treated as targets; wider
 * moves are left out rather than shown as false voice-leading.
 */
export function analyzeVoiceLeading(
  currentChord: ParsedChord,
  nextChord: ParsedChord | null,
): VoiceLeadingAnalysis {
  const guideTones = guideTonesOf(currentChord);
  const nextGuideTones = nextChord ? guideTonesOf(nextChord) : [];

  if (!nextGuideTones.length) {
    return { guideTones, nextGuideTones, resolutionTargets: [], leadingPairs: [] };
  }

  const leadingPairs: VoiceLeadingPair[] = [];
  const targets = new Set<number>();

  for (const from of guideTones) {
    const nearest = nearestTone(from, nextGuideTones);
    if (!nearest || Math.abs(nearest.distance) > 2) continue;
    leadingPairs.push({
      from: from.pc,
      to: nearest.tone.pc,
      fromRole: from.role,
      toRole: nearest.tone.role,
      semitones: nearest.distance,
    });
    targets.add(nearest.tone.pc);
  }

  return {
    guideTones,
    nextGuideTones,
    resolutionTargets: [...targets],
    leadingPairs,
  };
}
