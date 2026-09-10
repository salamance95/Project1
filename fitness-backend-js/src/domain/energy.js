/** 운동 소모 열량과 추천 중량. 둘 다 추정이다. */

import { pyRound } from "../core/num.js";
import {
  BODYWEIGHT_RATIO,
  DEFAULT_MET,
  DEFAULT_MINUTES,
  DUMBBELL_SLUGS,
  LEVEL_FACTOR,
  MET_BY_INTENSITY,
  MET_BY_PATTERN,
  MET_BY_SLUG,
  MINUTES_PER_SET,
  STYLE_FACTOR,
} from "./data/energy.data.js";

export { MET_BY_INTENSITY, MET_BY_SLUG, MINUTES_PER_SET };

/** 동작 → MET. 마스터에 없으면 패턴 기본값, 그것도 없으면 보통 근력 운동 기준. */
export function metFor(item) {
  if (!item) return DEFAULT_MET;
  return MET_BY_SLUG[item.slug] ?? MET_BY_PATTERN[item.pattern] ?? DEFAULT_MET;
}

/**
 * 운동 한 줄에 쓴 시간(분) 추정.
 * 세트 운동은 세트 수로, 거리 유산소는 거리와 평균 속도로 되짚는다.
 */
export function minutesForExercise({
  metric,
  sets = 0,
  distanceKm = 0,
  speedKmh = 0,
  minutes = 0,
}) {
  if (metric === "distance") {
    const total = distanceKm * Math.max(sets || 1, 1);
    if (total > 0 && speedKmh > 0) return (total / speedKmh) * 60;
    return minutes;
  }
  if (metric === "time") return minutes;
  return sets * MINUTES_PER_SET;
}

/** 운동 한 줄의 소모 열량. MET × 체중(kg) × 시간(h). */
export function exerciseKcal(entry, weightKg) {
  const minutes = minutesForExercise(entry);
  if (minutes <= 0) return 0;
  return pyRound((entry.met ?? DEFAULT_MET) * weightKg * (minutes / 60));
}

const DUMBBELL = new Set(DUMBBELL_SLUGS);

/** MET × 체중(kg) × 시간(h). 미수행이면 0. */
export function burnedKcal(status, intensity, durationMin, weightKg, fallbackMinutes = 50) {
  if (status === "missed") return 0;

  let minutes = durationMin || fallbackMinutes;
  if (status === "partial") minutes *= 0.5;

  const met = MET_BY_INTENSITY[intensity] ?? MET_BY_INTENSITY.moderate;
  return pyRound(met * weightKg * (minutes / 60));
}

/** 계획보다 더 한 세트 수 → 추가 소모 열량. */
export function extraBurn(extraSets, intensity, weightKg) {
  if (extraSets <= 0) return 0;
  const met = MET_BY_INTENSITY[intensity] ?? MET_BY_INTENSITY.moderate;
  return pyRound(met * weightKg * ((extraSets * MINUTES_PER_SET) / 60));
}

export function defaultMinutes(durationLabel) {
  return DEFAULT_MINUTES[durationLabel] ?? 50;
}

function roundTo(value, step) {
  return pyRound(value / step) * step;
}

/** 동작 slug → 추천 중량(kg). 맨몸 동작이면 null. */
export function recommendedWeight(slug, weightKg, level, style) {
  const ratio = BODYWEIGHT_RATIO[slug];
  if (!ratio) return null;

  let raw = weightKg * ratio;
  raw *= LEVEL_FACTOR[level] ?? 1;
  raw *= STYLE_FACTOR[style] ?? 1;

  const step = DUMBBELL.has(slug) ? 2.5 : 5;
  return Math.max(roundTo(raw, step), step);
}

/** '2.4km(20분)' → 2.4. 거리가 없으면 null. */
export function parseDistance(text) {
  const match = /([\d.]+)\s*km/i.exec(text ?? "");
  return match ? Number(match[1]) : null;
}

/** '4세트 x 10회' → [4, 10]. 형식이 다르면 [null, null]. */
export function parsePrescription(text) {
  const match = /(\d+)\s*세트\s*x\s*(\d+)\s*회/.exec(text ?? "");
  if (!match) return [null, null];
  return [Number(match[1]), Number(match[2])];
}
