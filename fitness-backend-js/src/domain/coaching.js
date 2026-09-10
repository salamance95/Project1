/** 일정 재조정(기능 4)과 치트데이/외식 보정(기능 5). */

import { pyRound } from "../core/num.js";
import { INTENSITY_LABEL, macrosForIntensity, mealForDay, weeklyTotal } from "./nutrition.js";
import { DAYS } from "./data/planner.data.js";
import {
  ALCOHOL_LOAD,
  ALCOHOL_TACTICS,
  CUISINE_TACTICS,
  EVENT_LOAD,
  RECOVERY_WORKOUT,
} from "./data/coaching.data.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

function dayIndexOf(schedule, day) {
  return schedule.findIndex((item) => item.day === day);
}

/**
 * 못 한 운동을 이번 주 안에서 뒤로 밀어 재배치한다.
 * 휴식일이 1순위 목적지, 없으면 가벼운 훈련일과 자리를 바꾼다.
 */
export function reschedule(schedule, baseline, missedDay, lockedDays = []) {
  const plan = clone(schedule);
  const index = dayIndexOf(plan, missedDay);
  if (index < 0 || plan[index].isRestDay) {
    return [plan, "재배치할 운동이 없습니다."];
  }

  const missedSession = clone(plan[index]);
  const later = [];
  for (let i = index + 1; i < plan.length; i += 1) {
    if (!lockedDays.includes(plan[i].day)) later.push(i);
  }

  const restTargets = later.filter((i) => plan[i].isRestDay);
  const lightTargets = later.filter((i) => ["low", "moderate"].includes(plan[i].intensity));
  const targets = restTargets.length ? restTargets : lightTargets.length ? lightTargets : later;

  // 미수행일 자리는 회복일로 비운다.
  plan[index] = {
    ...plan[index],
    isRestDay: true,
    intensity: "rest",
    intensityLabel: INTENSITY_LABEL.rest,
    workout: RECOVERY_WORKOUT,
    meal: mealForDay(baseline, "rest"),
    status: "미수행",
    note: null,
  };

  if (targets.length === 0) {
    plan[index].note =
      `${missedDay}요일 세션은 이번 주에 남은 날이 없어 다음 주 첫 훈련일로 이월합니다.`;
    return [
      plan,
      `${missedDay}요일 '${missedSession.workout.focus}'는 이번 주에 배치할 자리가 ` +
        "없어 다음 주 첫 세션으로 이월했습니다. 이번 주 남은 기간은 열량을 유지하세요.",
    ];
  }

  const target = targets[0];
  const displaced = plan[target];
  const targetDay = displaced.day;

  plan[target] = {
    ...missedSession,
    day: targetDay,
    status: "재배치됨",
    note: `${missedDay}요일 미수행분을 ${targetDay}요일로 이동`,
    meal: mealForDay(baseline, missedSession.intensity),
  };

  let message;
  if (!displaced.isRestDay) {
    // 원래 그날 훈련이 있었다면 사라지지 않도록 미수행일 자리로 당겨 놓는다.
    plan[index] = {
      ...displaced,
      day: missedDay,
      status: "교대됨",
      note: `${targetDay}요일 세션과 자리를 바꿨습니다.`,
      meal: mealForDay(baseline, displaced.intensity),
    };
    message =
      `${missedDay}요일과 ${targetDay}요일 세션을 서로 바꿨습니다. 주간 총 볼륨은 그대로 유지됩니다.`;
  } else {
    message =
      `${missedDay}요일 '${missedSession.workout.focus}'를 휴식일이던 ` +
      `${targetDay}요일로 옮겼습니다. ${missedDay}요일은 회복일로 전환했습니다.`;
  }

  return [plan, message];
}

/** 하루 열량이 기준선의 75% 아래로 떨어지지 않게 막는다. */
function clampDay(meal, baseline, floorRatio = 0.75) {
  const floor = baseline.calories * floorRatio;
  if (meal.calories >= floor) return meal;

  const deficit = floor - meal.calories;
  const next = { ...meal };
  next.carbs = pyRound(next.carbs + deficit / 4);
  next.calories = pyRound(next.protein * 4 + next.carbs * 4 + next.fat * 9);
  return next;
}

/** 회식/외식 일정을 반영하고 남은 요일에 주간 밸런스를 재분배한다. */
export function applyEvent(schedule, baseline, event) {
  const plan = clone(schedule);
  const index = dayIndexOf(plan, event.day);
  if (index < 0) {
    return [plan, { surplus: 0, perDay: 0, days: [] }, []];
  }

  const food = EVENT_LOAD[event.cuisine] ?? EVENT_LOAD["한식(백반/찌개)"];
  const drink = ALCOHOL_LOAD[event.alcohol ?? "없음"] ?? ALCOHOL_LOAD["없음"];
  const surplus = {};
  for (const key of Object.keys(food)) surplus[key] = food[key] + drink[key];

  // 1) 이벤트 당일: 낮 시간대를 미리 비워 초과분을 일부 흡수한다.
  const target = plan[index];
  const preCut = Math.min(surplus.calories * 0.35, baseline.calories * 0.2);
  const dayMeal = { ...target.meal };

  dayMeal.carbs = pyRound(Math.max(dayMeal.carbs - ((preCut / 4) * 0.7), 40));
  dayMeal.fat = pyRound(Math.max(dayMeal.fat - ((preCut / 9) * 0.3), baseline.fat * 0.5));
  dayMeal.protein = pyRound(dayMeal.protein * 1.05);
  dayMeal.calories = pyRound(
    dayMeal.protein * 4 + dayMeal.carbs * 4 + dayMeal.fat * 9 + surplus.calories,
  );
  dayMeal.target = `${event.type} · ${event.cuisine ?? "외식"} 대응일`;
  dayMeal.breakfast = "달걀 3개 + 그릭요거트 (단백질 선섭취, 탄수화물 최소)";
  dayMeal.lunch = "닭가슴살 또는 흰살생선 + 샐러드, 밥은 절반";
  dayMeal.dinner = `${event.cuisine ?? "외식"} — 아래 실전 가이드대로 대응`;
  dayMeal.note = `당일 낮 식사에서 약 ${pyRound(preCut)}kcal를 미리 비워둡니다.`;

  plan[index] = {
    ...target,
    meal: dayMeal,
    event,
    status: "치트데이",
    note: `${event.type} 일정 반영 (추정 초과 +${surplus.calories}kcal)`,
  };

  // 2) 남은 요일에 초과분을 분산 보정한다. 지난 요일은 되돌릴 수 없으므로 제외.
  const remaining = [];
  for (let i = index + 1; i < plan.length; i += 1) {
    if (!plan[i].event) remaining.push(i);
  }

  let rebalance;
  if (remaining.length === 0) {
    rebalance = {
      surplus: surplus.calories,
      applied: 0,
      carryOver: surplus.calories,
      perDay: 0,
      days: [],
    };
  } else {
    const perDay = surplus.calories / remaining.length;
    let applied = 0;

    for (const i of remaining) {
      let meal = { ...plan[i].meal };
      const before = meal.calories;

      // 단백질은 유지하고 탄수화물 70% / 지방 30% 비율로 깎는다.
      meal.carbs = pyRound(Math.max(meal.carbs - ((perDay * 0.7) / 4), 50));
      meal.fat = pyRound(Math.max(meal.fat - ((perDay * 0.3) / 9), baseline.fat * 0.55));
      meal.calories = pyRound(meal.protein * 4 + meal.carbs * 4 + meal.fat * 9);

      // 하루 열량이 지나치게 떨어지면 되돌린다. 굶기는 보정은 하지 않는다.
      meal = clampDay(meal, baseline);
      const cut = before - meal.calories;
      applied += cut;
      meal.note = `${event.day}요일 ${event.type} 보정: ${pyRound(cut)}kcal 차감`;
      plan[i] = { ...plan[i], meal, status: "보정됨" };
    }

    rebalance = {
      surplus: surplus.calories,
      applied: pyRound(applied),
      carryOver: Math.max(pyRound(surplus.calories - applied), 0),
      perDay: pyRound(applied / remaining.length),
      days: remaining.map((i) => plan[i].day),
    };
  }

  return [plan, rebalance, buildTactics(event, surplus, rebalance)];
}

/** 사전/현장/사후 3단계 실전 대처법. */
export function buildTactics(event, surplus, rebalance) {
  const cuisine = event.cuisine ?? "한식(백반/찌개)";
  const alcohol = event.alcohol ?? "없음";

  const before = [
    "당일 아침·점심은 단백질과 채소 위주로, 탄수화물은 평소의 절반으로 줄이세요.",
    "출발 30분 전 물 500ml와 단백질 20g(요거트·삶은 달걀)로 공복감을 없애세요.",
  ];

  const during = [...(CUISINE_TACTICS[cuisine] ?? []), ...(ALCOHOL_TACTICS[alcohol] ?? [])];
  during.push("첫 10분은 채소와 단백질만 먹고 탄수화물은 뒤로 미루세요.");

  const after = [
    "다음 날 체중이 1~2kg 늘어도 대부분 수분입니다. 열량을 추가로 굶지 마세요.",
    "다음 날 아침 20~30분 걷기로 혈당과 부기를 정리하세요.",
  ];

  if (rebalance.days.length > 0) {
    after.push(
      `초과 ${surplus.calories}kcal 중 ${rebalance.applied}kcal를 ` +
        `${rebalance.days.join(", ")}요일에 하루 약 ${rebalance.perDay}kcal씩 ` +
        "나눠 자동 보정했습니다. 단백질은 그대로 유지합니다.",
    );
    if (rebalance.carryOver > 0) {
      after.push(
        `남은 ${rebalance.carryOver}kcal는 더 깎으면 하루 열량이 너무 낮아져 ` +
          "보정하지 않았습니다. 다음 주 초반에 자연스럽게 상쇄됩니다.",
      );
    }
  } else {
    after.push(
      "주 후반 일정이라 이번 주에는 남은 보정일이 없습니다. " +
        `초과 ${surplus.calories}kcal는 다음 주 초 3일에 나눠 반영하세요.`,
    );
  }

  return [
    { phase: "사전", items: before },
    { phase: "현장", items: during },
    { phase: "사후", items: after },
  ];
}

export function weeklySummary(schedule, baseline) {
  const total = weeklyTotal(schedule);
  const moderate = macrosForIntensity(baseline, "moderate");
  const planned = {};
  for (const key of ["calories", "protein", "carbs", "fat"]) {
    planned[key] = pyRound(moderate[key] * 7);
  }
  return { actual: total, reference: planned };
}

export { DAYS };
