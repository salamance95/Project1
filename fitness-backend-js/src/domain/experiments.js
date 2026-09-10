/**
 * A/B 테스트.
 * 배정은 (사용자, 실험) 해시로 결정되므로 파이썬 구현과 같은 변형이 나온다.
 * 전환율은 '노출된 사용자 중 전환한 사용자 수'로 계산한다.
 */

import crypto from "node:crypto";

import { EXPERIMENTS, SALT } from "./data/experiments.data.js";

export { EXPERIMENTS };

/** 0~99 사이의 안정적인 버킷 번호. 파이썬 sha1 앞 8자리와 같은 값을 쓴다. */
function bucketOf(userId, experiment) {
  const raw = `${SALT}:${experiment}:${userId}`;
  const digest = crypto.createHash("sha1").update(raw, "utf8").digest("hex");
  return Number.parseInt(digest.slice(0, 8), 16) % 100;
}

/** 가중치에 따라 변형을 고른다. 같은 입력이면 항상 같은 결과. */
export function pickVariant(userId, experiment) {
  const spec = EXPERIMENTS[experiment];
  const bucket = bucketOf(userId, experiment);

  let cursor = 0;
  for (const [variant, weight] of Object.entries(spec.variants)) {
    cursor += weight;
    if (bucket < cursor) return variant;
  }
  return Object.keys(spec.variants).at(-1);
}

export function activeExperiments(multiModelAvailable = false) {
  const active = {};
  for (const [key, spec] of Object.entries(EXPERIMENTS)) {
    if (!spec.requires_multi_model || multiModelAvailable) active[key] = spec;
  }
  return active;
}

/** 표본이 적거나 동률이면 결론을 내지 않는다. */
export function verdictOf(leader, tied, totalExposed) {
  if (!totalExposed) return "데이터 없음";
  if (tied) return "변형 간 차이 없음";
  if (totalExposed < 30) {
    return `${leader.variant} 우세 (표본 ${totalExposed}명, 판단하기 이릅니다)`;
  }
  return `${leader.variant} 우세`;
}

/**
 * 배정/이벤트 행을 받아 실험별 집계를 만든다.
 * DB 접근은 호출부(crud)가 맡고 여기서는 계산만 한다.
 */
export function summarize(assignments, events, multiModelAvailable = false) {
  const report = [];

  for (const [key, spec] of Object.entries(activeExperiments(multiModelAvailable))) {
    const byVariant = new Map();
    for (const [variant, weight] of Object.entries(spec.variants)) {
      byVariant.set(variant, {
        variant,
        weight,
        assigned: 0,
        exposed: 0,
        converted: 0,
        conversionRate: 0,
      });
    }

    for (const row of assignments) {
      if (row.experiment === key && byVariant.has(row.variant)) {
        byVariant.get(row.variant).assigned += 1;
      }
    }

    const exposedUsers = new Map();
    const convertedUsers = new Map();
    for (const variant of byVariant.keys()) {
      exposedUsers.set(variant, new Set());
      convertedUsers.set(variant, new Set());
    }

    for (const row of events) {
      if (row.experiment !== key || !byVariant.has(row.variant)) continue;
      if (row.event === spec.exposure) exposedUsers.get(row.variant).add(row.userId);
      else if (row.event === spec.goal) convertedUsers.get(row.variant).add(row.userId);
    }

    for (const [variant, stats] of byVariant) {
      const exposed = exposedUsers.get(variant);
      const converted = convertedUsers.get(variant);
      stats.exposed = exposed.size;
      stats.converted = [...converted].filter((id) => exposed.has(id)).length;
      stats.conversionRate = stats.exposed
        ? Math.round((stats.converted / stats.exposed) * 1000) / 10
        : 0;
    }

    const variants = [...byVariant.values()];
    const totalExposed = variants.reduce((sum, item) => sum + item.exposed, 0);
    const ranked = [...variants].sort((a, b) => b.conversionRate - a.conversionRate);
    const leader = ranked[0];
    const tied = ranked.length > 1 && ranked[0].conversionRate === ranked[1].conversionRate;

    report.push({
      key,
      description: spec.description,
      goal: spec.goal,
      goalLabel: spec.goalLabel,
      variants,
      totalExposed,
      verdict: verdictOf(leader, tied, totalExposed),
    });
  }

  return report;
}
