/** 운동 라이브러리. 부상·기구·안전 제한을 만족하는 동작을 고른다. */

import { BODYWEIGHT_RATIO } from "./data/energy.data.js";
import {
  BODYWEIGHT,
  CARDIO_SCHEME,
  DISTANCE_SPEED_KMH,
  LIGHT_WALK,
  EQUIPMENT_LIST,
  FALLBACK_PATTERN,
  SAFE_SCHEME,
  SEED_EXERCISES,
  SET_SCHEME,
} from "./data/exercises.data.js";

export { BODYWEIGHT, EQUIPMENT_LIST as EQUIPMENT, LIGHT_WALK, SEED_EXERCISES };

/**
 * 운동을 무엇으로 재는가. 화면의 입력 칸도 이 값을 보고 달라진다.
 *  weight   기구로 무게를 다루는 운동 — kg · 세트 x 횟수
 *  reps     무게를 쓰지 않는 맨몸 운동 — 세트 x 횟수
 *  distance 걷기·자전거처럼 이동 거리가 곧 운동량인 유산소 — km
 *  time     제자리에서 하는 유산소 — 분
 */
export const METRICS = {
  WEIGHT: "weight",
  REPS: "reps",
  DISTANCE: "distance",
  TIME: "time",
};

export function metricOf(item) {
  if (!item) return METRICS.REPS;
  if (DISTANCE_SPEED_KMH[item.slug]) return METRICS.DISTANCE;
  if (item.pattern === "cardio") return METRICS.TIME;
  // 추천 중량을 계산할 수 있는 동작 = 무게를 다루는 동작.
  return BODYWEIGHT_RATIO[item.slug] ? METRICS.WEIGHT : METRICS.REPS;
}

/** 유산소 처방에 적힌 분 수. "20분" → 20. */
export function minutesOf(text) {
  const match = /(\d+)\s*분/.exec(text ?? "");
  return match ? Number(match[1]) : null;
}

/** 거리로 재는 동작의 평균 속도(km/h). 아니면 null. */
export function speedOf(slug) {
  return DISTANCE_SPEED_KMH[slug] ?? null;
}

/** 평균 속도 × 시간 → 거리(km). 소수 첫째 자리까지. */
export function distanceFor(slug, minutes) {
  const speed = DISTANCE_SPEED_KMH[slug];
  if (!speed || !minutes) return null;
  return Math.floor((speed * minutes) / 60 * 10 + 0.5) / 10;
}
export { BODY_PARTS } from "./data/exercises.data.js";

const NONE_OPTION = "해당 없음";

/** 맨몸은 언제나 가능하므로 강제로 포함한다. */
export function normalizeEquipment(selected) {
  const chosen = new Set(
    (selected ?? []).filter((item) => EQUIPMENT_LIST.includes(item)),
  );
  chosen.add(BODYWEIGHT);
  return chosen;
}

export class ExerciseLibrary {
  constructor(items) {
    this.items = [...items];
    this.bySlug = new Map(this.items.map((item) => [item.slug, item]));
  }

  static fromSeed() {
    return new ExerciseLibrary(SEED_EXERCISES);
  }

  /** DB 행(운동 + 위험 부위 이름 배열) → 라이브러리. */
  static fromRows(rows) {
    return new ExerciseLibrary(
      rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        pattern: row.pattern,
        muscle: row.muscle,
        equipment: row.equipment ?? BODYWEIGHT,
        load: row.load,
        impact: Boolean(row.isHighImpact),
        alt: row.altSlug,
        risk: row.risk ?? [],
      })),
    );
  }

  #blocked(item, injuries, restrictions, equipment) {
    if (injuries.some((area) => item.risk.includes(area))) return true;
    if (restrictions.no_impact && item.impact) return true;
    if (equipment && !equipment.has(item.equipment)) return true;
    return false;
  }

  #pickFromPattern(pattern, injuries, usedSlugs, restrictions, equipment) {
    const candidates = this.items.filter((item) => item.pattern === pattern);
    if (candidates.length === 0) return null;

    const safe = candidates.filter(
      (item) => !this.#blocked(item, injuries, restrictions, equipment),
    );
    if (safe.length === 0) return null;

    // 막힌 고부하 동작이 있으면 그 동작의 대체 체인을 먼저 따라간다.
    const blocked = candidates.filter((item) =>
      this.#blocked(item, injuries, restrictions, equipment),
    );
    if (blocked.length > 0) {
      const origin = blocked.reduce((a, b) => (b.load > a.load ? b : a));
      let altSlug = origin.alt;
      const seen = new Set();

      while (altSlug && !seen.has(altSlug)) {
        seen.add(altSlug);
        const alt = this.bySlug.get(altSlug);
        if (!alt) break;
        if (
          !this.#blocked(alt, injuries, restrictions, equipment) &&
          !usedSlugs.has(alt.slug)
        ) {
          return alt;
        }
        altSlug = alt.alt;
      }
    }

    // 이번 세션에 이미 넣은 동작은 다시 쓰지 않는다.
    const pool = safe.filter((item) => !usedSlugs.has(item.slug));
    if (pool.length === 0) return null;

    pool.sort((a, b) =>
      restrictions.no_high_intensity ? a.load - b.load : b.load - a.load,
    );
    return pool[0];
  }

  /** 못 고르면 비슷한 패턴으로 넘어간다. */
  pick(pattern, injuries, usedSlugs, restrictions, equipment) {
    const picked = this.#pickFromPattern(
      pattern,
      injuries,
      usedSlugs,
      restrictions,
      equipment,
    );
    if (picked) return picked;

    for (const alternative of FALLBACK_PATTERN[pattern] ?? []) {
      const fallback = this.#pickFromPattern(
        alternative,
        injuries,
        usedSlugs,
        restrictions,
        equipment,
      );
      if (fallback) return fallback;
    }
    return null;
  }
}

export function prescriptionFor(profile, restrictions) {
  if (restrictions.no_high_intensity) {
    return SAFE_SCHEME[profile.level] ?? "3세트 x 12회";
  }
  const scheme = SET_SCHEME[profile.style] ?? SET_SCHEME["근비대 중심"];
  return scheme[profile.level] ?? "3세트 x 10회";
}

/** 패턴 목록 → [{item, name, reps}] */
export function buildSession(
  patterns,
  profile,
  library,
  restrictions,
  usedSlugs = null,
) {
  const injuries = (profile.injuries ?? []).filter(
    (item) => item !== NONE_OPTION,
  );
  const equipment = normalizeEquipment(profile.equipment);
  const used = usedSlugs ?? new Set();
  const reps = prescriptionFor(profile, restrictions);

  const session = [];
  for (const pattern of patterns) {
    const picked = library.pick(
      pattern,
      injuries,
      used,
      restrictions,
      equipment,
    );
    if (!picked) continue;

    used.add(picked.slug);
    const isCardio = pattern === "cardio" || picked.pattern === "cardio";
    session.push({
      item: picked,
      name: picked.name,
      reps: isCardio ? prescriptionForItem(picked, profile, restrictions) : reps,
    });
  }
  return session;
}

/**
 * 한 동작을 대신할 수 있는 동작들.
 *
 * 기구가 없을 때 쓰라고 만든 목록이라 순서가 중요하다.
 * 지정 대체 동작 → 맨몸(집에서 가능) → 보유 기구 → 그 밖의 기구 순으로 준다.
 * 부상 부위나 안전 제한에 걸리는 동작은 아예 빼고, 같은 패턴이 부족하면
 * 비슷한 패턴(FALLBACK_PATTERN)까지 넓힌다.
 */
export function alternativesFor(originSlug, profile, library, restrictions = {}, limit = 6) {
  const origin = library.bySlug.get(originSlug);
  if (!origin) return [];

  const injuries = (profile.injuries ?? []).filter((item) => item !== NONE_OPTION);
  const owned = normalizeEquipment(profile.equipment);
  const patterns = [origin.pattern, ...(FALLBACK_PATTERN[origin.pattern] ?? [])];

  const altChain = new Set();
  let cursor = origin.alt;
  while (cursor && !altChain.has(cursor)) {
    altChain.add(cursor);
    cursor = library.bySlug.get(cursor)?.alt;
  }

  const scored = library.items
    .filter((item) => item.slug !== origin.slug)
    .filter((item) => patterns.includes(item.pattern) || altChain.has(item.slug))
    // 아픈 부위와 안전 제한은 대체 동작에서도 그대로 지킨다.
    .filter((item) => !injuries.some((area) => item.risk.includes(area)))
    .filter((item) => !(restrictions.no_impact && item.impact))
    .map((item) => {
      const isHome = item.equipment === BODYWEIGHT;
      const isOwned = owned.has(item.equipment);
      const samePattern = item.pattern === origin.pattern;

      let reason = `${item.equipment} 필요`;
      if (altChain.has(item.slug)) reason = "지정된 대체 동작";
      else if (isHome) reason = "맨몸 · 집에서 가능";
      else if (isOwned) reason = "가지고 있는 기구로 가능";

      return {
        slug: item.slug,
        name: item.name,
        muscle: item.muscle,
        equipment: item.equipment,
        pattern: item.pattern,
        isHome,
        isOwned,
        samePattern,
        reason,
        // 정렬용. 큰 값이 먼저 온다.
        rank:
          (altChain.has(item.slug) ? 8 : 0) +
          (isHome ? 4 : 0) +
          (samePattern ? 3 : 0) +
          (isOwned ? 2 : 0),
      };
    });

  scored.sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name));
  return scored.slice(0, limit).map(({ rank, ...item }) => item);
}

/**
 * 동작 하나에 붙일 처방.
 * 거리로 재는 유산소는 km(시간 병기), 나머지 유산소는 시간, 근력은 세트x횟수.
 */
export function prescriptionForItem(item, profile, restrictions = {}) {
  if (item.pattern !== "cardio") return prescriptionFor(profile, restrictions);

  const time = CARDIO_SCHEME[profile.duration] ?? "20분";
  const km = distanceFor(item.slug, minutesOf(time));
  return km ? `${km}km(${time})` : time;
}
