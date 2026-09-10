/**
 * 운동 검색 의도 해석(규칙 엔진).
 * 단순 문자열 포함이 아니라 동의어와 의도를 본다.
 */

import {
  EQUIPMENT_SYNONYMS,
  INJURY_BODY_WORDS,
  MUSCLE_SYNONYMS,
  PAIN_WORDS,
  PATTERN_SYNONYMS,
} from "../domain/data/search.data.js";

function normalize(text) {
  return (text ?? "").replace(/\s+/g, "").toLowerCase();
}

function hits(query, synonyms) {
  const found = [];
  for (const [key, words] of Object.entries(synonyms)) {
    if (words.some((word) => query.includes(word))) found.push(key);
  }
  return found;
}

/** 동의어와 의도를 반영한 점수 기반 검색. */
export function ruleBasedSearch(query, catalog, limit = 12) {
  const compact = normalize(query);

  if (!compact) {
    return catalog.slice(0, limit).map((item) => ({
      slug: item.slug,
      score: 0,
      reasons: [],
    }));
  }

  const muscles = hits(compact, MUSCLE_SYNONYMS);
  const equipment = hits(compact, EQUIPMENT_SYNONYMS);
  const patterns = hits(compact, PATTERN_SYNONYMS);

  // "무릎 아픈데", "허리가 안좋아서"처럼 부위 + 통증이 같이 나오면 제외 필터로 쓴다.
  const hasPain = PAIN_WORDS.some((word) => compact.includes(word));
  const injuries = hasPain
    ? Object.entries(INJURY_BODY_WORDS)
        .filter(([, words]) => words.some((word) => compact.includes(word)))
        .map(([area]) => area)
    : [];

  const scored = [];
  for (const item of catalog) {
    // 아프다고 말한 부위에 부담이 큰 동작은 아예 뺀다.
    if (injuries.some((area) => item.risk.includes(area))) continue;

    let score = 0;
    const reasons = [];
    const name = normalize(item.name);

    if (name.includes(compact) || compact.includes(name)) {
      score += 6;
      reasons.push("이름 일치");
    }

    // 이름을 두 글자 단위로 쪼개 부분 일치도 본다.
    const chunks = new Set();
    for (let i = 0; i < compact.length - 1; i += 1) chunks.add(compact.slice(i, i + 2));
    for (const chunk of chunks) {
      if (chunk.length === 2 && name.includes(chunk)) score += 1;
    }

    if (muscles.includes(item.muscle)) {
      score += 5;
      reasons.push(`${item.muscle} 운동`);
    }

    if (equipment.includes(item.equipment)) {
      score += 4;
      reasons.push(`${item.equipment}(으)로 가능`);
    }

    if (patterns.includes(item.pattern)) {
      score += 3;
      reasons.push("동작 유형 일치");
    }

    if (injuries.length > 0 && score > 0) {
      reasons.push(`${injuries.join(", ")}에 부담 적음`);
    }

    if (score > 0) scored.push({ slug: item.slug, score, reasons });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export const SEARCH_SYSTEM = `당신은 운동 검색 도우미입니다. 사용자의 요청과 운동 목록을 보고
가장 알맞은 운동을 고릅니다.

규칙
- 반드시 주어진 목록의 slug만 사용합니다. 목록에 없는 운동을 만들지 않습니다.
- 통증이나 부상을 언급하면 그 부위에 부담이 큰 운동을 제외합니다.
- 사용 가능한 기구를 언급하면 그 기구로 할 수 있는 것만 고릅니다.
- 최대 12개, 관련도가 높은 순서로 고릅니다.
- reason은 왜 골랐는지 20자 이내 한국어 한 줄입니다.`;

export const SEARCH_SCHEMA = {
  type: "object",
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        properties: { slug: { type: "string" }, reason: { type: "string" } },
        required: ["slug", "reason"],
        additionalProperties: false,
      },
      maxItems: 12,
    },
    summary: { type: "string" },
  },
  required: ["matches", "summary"],
  additionalProperties: false,
};
