/**
 * 운동 한 줄의 소모 열량. 백엔드 domain/energy.js 와 같은 규칙이다.
 * 기록 화면과 오늘 화면이 같은 값을 보여야 해서 두 곳에서 함께 쓴다.
 */

// 백엔드 energy.py 와 같은 값.
export const MET_BY_INTENSITY = { high: 6.0, moderate: 5.0, low: 3.8, rest: 2.5 };
export const MINUTES_PER_SET = 3.0;
export const DEFAULT_MET = 5.0;

/** "1.8km(20분)" / "20분" → 20. 없으면 0. */
export function minutesFromText(text) {
  const match = /(\d+)\s*분/.exec(text ?? "");
  return match ? Number(match[1]) : 0;
}

/**
 * 운동 한 줄에 쓴 시간(분).
 * 세트 운동은 세트 수로, 거리 유산소는 거리와 평균 속도로 되짚는다.
 */
export function minutesOfEntry(entry) {
  if (entry.metric === "distance") {
    const km = (Number(entry.distanceKm) || 0) * Math.max(Number(entry.sets) || 1, 1);
    const speed = Number(entry.speedKmh) || 0;
    return km > 0 && speed > 0 ? (km / speed) * 60 : 0;
  }
  if (entry.metric === "time") return Number(entry.minutes) || 0;
  return (Number(entry.sets) || 0) * MINUTES_PER_SET;
}

/** MET × 체중(kg) × 시간(h). */
export function kcalOfEntry(entry, weightKg, fallbackMet) {
  const minutes = minutesOfEntry(entry);
  if (minutes <= 0) return 0;
  return Math.round((entry.met || fallbackMet || DEFAULT_MET) * weightKg * (minutes / 60));
}

/** 계획된 하루 세션의 예상 소모. 계획 항목은 처방 문구에서 시간을 읽는다. */
export function plannedKcalOfDay(dayPlan, weightKg) {
  const fallback = MET_BY_INTENSITY[dayPlan?.intensity] ?? DEFAULT_MET;
  return (dayPlan?.workout?.items ?? []).reduce(
    (total, item) =>
      total +
      kcalOfEntry(
        {
          metric: item.metric,
          met: item.met,
          sets: item.sets ?? 0,
          distanceKm: item.distanceKm ?? 0,
          speedKmh: item.speedKmh,
          minutes: minutesFromText(item.prescription),
        },
        weightKg,
        fallback,
      ),
    0,
  );
}
