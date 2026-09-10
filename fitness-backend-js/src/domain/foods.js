/**
 * 먹은 음식 텍스트 → 열량/영양소 추정.
 *
 * 구분자에 기대지 않고 음식 이름의 '위치'를 먼저 찾은 뒤, 각 이름 바로 뒤(없으면 앞)에
 * 붙은 수량을 가져온다. "계란 3개와 오트밀 60g"처럼 붙여 쓴 문장도 정확히 갈린다.
 */

import { pyRound } from "../core/num.js";
import {
  COUNT_UNITS,
  FOODS,
  SPOON_G,
  WEIGHT_UNITS,
} from "./data/foods.data.js";

export { FOODS };

const COUNT_UNIT_SET = new Set(COUNT_UNITS);

const QUANTITY_RE =
  /(\d+(?:[.,]\d+)?)\s*(kg|g|그램|ml|cc|l|개|알|공기|인분|장|조각|컵|잔|스쿱|봉지|캔|병|줄|쪽|큰술)?/;

const SPLIT_RE = /[,\n/+·;]|\s와\s|\s및\s/;
const STRIP_CHARS = " ,/+·;\n\t";

/** 이름과 별칭을 길이 내림차순으로 정렬해 둔 색인. 긴 이름을 먼저 맞춘다. */
const INDEX = (() => {
  const pairs = [];
  for (const food of FOODS) {
    for (const token of [food.name, ...food.aliases]) pairs.push([token, food]);
  }
  pairs.sort((a, b) => b[0].length - a[0].length);
  return pairs;
})();

function gramsOf(amount, unit, food) {
  if (unit && unit in WEIGHT_UNITS) return amount * WEIGHT_UNITS[unit];
  if (unit === "큰술") return amount * SPOON_G;
  if (!unit || COUNT_UNIT_SET.has(unit)) return amount * food.unit_g;
  return amount * food.unit_g;
}

function macrosOf(food, grams) {
  const ratio = grams / 100;
  return {
    calories: pyRound(food.kcal * ratio),
    protein: pyRound(food.p * ratio, 1),
    carbs: pyRound(food.c * ratio, 1),
    fat: pyRound(food.f * ratio, 1),
  };
}

function trimChars(value) {
  let start = 0;
  let end = value.length;
  while (start < end && STRIP_CHARS.includes(value[start])) start += 1;
  while (end > start && STRIP_CHARS.includes(value[end - 1])) end -= 1;
  return value.slice(start, end);
}

export function estimate(rawText) {
  const text = rawText ?? "";

  // 1) 겹치지 않게 음식 이름 위치를 찾는다. 긴 이름을 먼저 잡는다.
  const taken = new Array(text.length).fill(false);
  const found = [];

  for (const [token, food] of INDEX) {
    let cursor = 0;
    for (;;) {
      const at = text.indexOf(token, cursor);
      if (at < 0) break;

      let overlaps = false;
      for (let i = at; i < at + token.length; i += 1) {
        if (taken[i]) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) {
        for (let i = at; i < at + token.length; i += 1) taken[i] = true;
        found.push({ at, end: at + token.length, token, food });
      }
      cursor = at + token.length;
    }
  }

  found.sort((a, b) => a.at - b.at);

  // 2) 이름마다 수량을 찾는다. 뒤쪽 구간을 먼저 보고, 없으면 앞쪽 구간을 본다.
  const items = [];
  found.forEach((entry, index) => {
    const afterEnd = index + 1 < found.length ? found[index + 1].at : text.length;
    const beforeStart = index > 0 ? found[index - 1].end : 0;

    let match = QUANTITY_RE.exec(text.slice(entry.end, afterEnd));
    if (!match) match = QUANTITY_RE.exec(text.slice(beforeStart, entry.at));

    const { food } = entry;
    const amount = match ? Number(match[1].replace(",", ".")) : 1;
    const unit = match ? match[2] : undefined;

    const grams = gramsOf(amount, unit, food);

    items.push({
      raw: trimChars(text.slice(entry.at, afterEnd)),
      name: food.name,
      amount,
      unit: unit ?? "개",
      grams: pyRound(grams),
      ...macrosOf(food, grams),
    });
  });

  // 3) 어떤 음식도 걸치지 않은 덩어리는 못 알아본 것으로 돌려준다.
  const unmatched = [];
  let cursor = 0;
  for (const raw of text.split(SPLIT_RE)) {
    let chunkStart = text.indexOf(raw, cursor);
    if (chunkStart < 0) chunkStart = cursor;
    const chunkEnd = chunkStart + raw.length;
    cursor = chunkEnd;

    const chunk = raw.trim();
    if (!chunk) continue;
    if (!taken.slice(chunkStart, chunkEnd).some(Boolean)) unmatched.push(chunk);
  }

  const sums = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const item of items) {
    for (const key of Object.keys(sums)) sums[key] += item[key];
  }

  const total = {
    calories: pyRound(sums.calories),
    protein: pyRound(sums.protein),
    carbs: pyRound(sums.carbs),
    fat: pyRound(sums.fat),
  };

  return {
    items,
    unmatched,
    total,
    matched: items.length,
    note:
      items.length > 0
        ? "조리법과 기름 사용량은 알 수 없어 추정치입니다. 값을 직접 고칠 수 있습니다."
        : "인식한 음식이 없습니다. '현미밥 1공기, 닭가슴살 200g'처럼 음식과 양을 적어주세요.",
  };
}

export function knownFoods() {
  return FOODS.map((food) => food.name).sort();
}

/**
 * 사진 분석 결과를 영양 추정으로 바꾼다.
 *
 * 음식 DB가 아는 음식이면 DB 값을 쓴다. 텍스트로 직접 적었을 때와 같은 숫자가
 * 나와야 하기 때문이다. DB에 없는 음식만 모델이 준 값을 그대로 받는다.
 * (예전에는 모르는 음식이 0kcal로 빠져서 합계가 실제보다 낮게 나왔다.)
 */
export function estimateFromPhoto(modelFoods) {
  const items = [];
  let usedModel = 0;

  for (const food of modelFoods ?? []) {
    const name = (food.name ?? "").trim();
    if (!name) continue;

    const phrase = `${name} ${food.amount}${food.unit}`;
    const local = estimate(phrase);

    if (local.matched > 0) {
      items.push(...local.items.map((item) => ({ ...item, source: "db" })));
      continue;
    }

    usedModel += 1;
    items.push({
      raw: phrase,
      name,
      amount: food.amount,
      unit: food.unit,
      grams: pyRound(food.grams),
      calories: pyRound(food.calories),
      protein: pyRound(food.protein, 1),
      carbs: pyRound(food.carbs, 1),
      fat: pyRound(food.fat, 1),
      source: "ai",
    });
  }

  const sums = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const item of items) {
    for (const key of Object.keys(sums)) sums[key] += item[key];
  }

  let note;
  if (items.length === 0) {
    note = "사진에서 음식을 찾지 못했습니다. 음식과 양을 직접 적어주세요.";
  } else if (usedModel > 0) {
    note =
      `${usedModel}개 항목은 음식 DB에 없어 AI가 어림한 값입니다. ` +
      "조리법과 기름 사용량에 따라 달라지니 값을 직접 고칠 수 있습니다.";
  } else {
    note = "조리법과 기름 사용량은 알 수 없어 추정치입니다. 값을 직접 고칠 수 있습니다.";
  }

  return {
    items,
    unmatched: [],
    total: {
      calories: pyRound(sums.calories),
      protein: pyRound(sums.protein),
      carbs: pyRound(sums.carbs),
      fat: pyRound(sums.fat),
    },
    matched: items.length,
    aiEstimated: usedModel,
    note,
  };
}
