/**
 * 자동 루틴 재생성.
 * 지난주 리포트에서 세 가지 신호만 본다: 수행률, 평균 RPE, 빠진 요일 패턴.
 */

import { DAYS, TRAINING_DAYS, VARIANTS } from "./data/planner.data.js";

const FREQUENCY_ORDER = ["주 2일", "주 3일", "주 4일", "주 5일 이상"];
const MAX_COUNT_OFFSET = 1;
const MIN_COUNT_OFFSET = -2;

function shiftFrequency(frequency, step) {
  const at = FREQUENCY_ORDER.indexOf(frequency);
  if (at < 0) return frequency;
  const next = Math.max(0, Math.min(at + step, FREQUENCY_ORDER.length - 1));
  return FREQUENCY_ORDER[next];
}

function missedWeekdays(report) {
  return report.daily
    .filter((item) => item.workoutStatus === "missed")
    .map((item) => item.day);
}

/** 반복해서 빠진 요일을 훈련일에서 빼고 실제로 소화한 요일로 옮긴다. */
function rebuildTrainingDays(frequency, missedDays) {
  const base = [...(TRAINING_DAYS[frequency] ?? TRAINING_DAYS["주 3일"])];
  if (missedDays.length === 0) return null;

  const drop = base.filter((day) => missedDays.includes(day));
  if (drop.length === 0) return null;

  const candidates = DAYS.filter(
    (day) => !base.includes(day) && !missedDays.includes(day),
  );
  if (candidates.length === 0) return null;

  const rebuilt = base.filter((day) => !drop.includes(day));
  for (let i = 0; i < drop.length; i += 1) {
    const next = candidates.shift();
    if (!next) break;
    rebuilt.push(next);
  }

  rebuilt.sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b));
  return rebuilt.join() === base.join() ? null : rebuilt;
}

/** 지난주 리포트 → 다음 주 조정안. */
export function analyze(report, profile, currentVariant, currentOffset = 0) {
  const { adherence, avgRpe } = report.workout;
  const proteinRate = report.nutrition.rates.protein;
  const { loggedDays } = report.nutrition;

  let frequency = profile.frequency;
  let variantId = currentVariant;
  let countOffset = currentOffset;
  const reasons = [];
  let mode = "maintain";

  if (avgRpe !== null && avgRpe >= 8.5) {
    // 체감 강도가 계속 높으면 수행률과 무관하게 먼저 덜어낸다.
    mode = "deload";
    countOffset = Math.max(countOffset - 1, MIN_COUNT_OFFSET);
    reasons.push(
      `평균 체감 강도가 ${avgRpe}/10로 높아 다음 주는 세션당 동작을 하나 줄인 ` +
        "디로드 주간으로 구성했습니다.",
    );
  } else if (adherence < 60) {
    mode = "scale_down";
    const nextFrequency = shiftFrequency(frequency, -1);

    if (nextFrequency !== frequency) {
      reasons.push(
        `수행률이 ${adherence}%에 그쳐 훈련일을 ${frequency}에서 ${nextFrequency}로 줄였습니다. ` +
          "지킬 수 있는 계획이 좋은 계획입니다.",
      );
      frequency = nextFrequency;
    } else {
      countOffset = Math.max(countOffset - 1, MIN_COUNT_OFFSET);
      reasons.push(`수행률이 ${adherence}%로 낮아 세션당 동작 수를 줄였습니다.`);
    }

    if (variantId !== "sustainable") {
      variantId = "sustainable";
      reasons.push("완주율이 가장 높은 '지속 가능형' 구성으로 바꿨습니다.");
    }
  } else if (adherence >= 90 && (avgRpe === null || avgRpe <= 7.5)) {
    mode = "progress";

    if (countOffset < MAX_COUNT_OFFSET) {
      countOffset += 1;
      reasons.push(`수행률 ${adherence}%에 여유도 있어 세션당 동작을 하나 늘렸습니다.`);
    } else {
      const nextFrequency = shiftFrequency(frequency, 1);
      if (nextFrequency !== frequency) {
        reasons.push(
          `볼륨을 더 올릴 여지가 있어 훈련일을 ${frequency}에서 ${nextFrequency}로 늘렸습니다.`,
        );
        frequency = nextFrequency;
      } else {
        reasons.push("현재 구성이 상한입니다. 같은 계획에서 중량을 올려보세요.");
      }
    }
  } else {
    reasons.push(
      `수행률 ${adherence}%로 무리 없이 진행 중입니다. 구성을 유지하고 중량만 점진적으로 ` +
        "올리세요.",
    );
  }

  // 요일 패턴 보정
  const missedDays = missedWeekdays(report);
  const trainingDays = rebuildTrainingDays(frequency, missedDays);
  if (trainingDays) {
    reasons.push(
      `${missedDays.join(", ")}요일에 빠짐이 반복돼 훈련일을 ` +
        `${trainingDays.join(", ")}요일로 옮겼습니다.`,
    );
  }

  // 영양 코멘트
  if (loggedDays >= 3 && proteinRate < 80) {
    reasons.push(
      `단백질 달성률이 ${proteinRate}%였습니다. 다음 주는 매 끼니 단백질을 먼저 채우세요.`,
    );
  }

  return { mode, frequency, variantId, countOffset, trainingDays, reasons };
}

export function variantById(variantId) {
  return VARIANTS.find((item) => item.id === variantId) ?? VARIANTS[0];
}
