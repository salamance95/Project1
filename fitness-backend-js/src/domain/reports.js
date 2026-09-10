/** 주간 분석 리포트: 계획 대비 실제 기록을 비교한다. */

import { pyRound } from "../core/num.js";
import { DAYS } from "./data/planner.data.js";

const MACROS = ["calories", "protein", "carbs", "fat"];

function macroSum(rows) {
  const total = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const row of rows) {
    for (const key of MACROS) total[key] += row[key];
  }
  return total;
}

function rate(actual, planned) {
  if (!planned) return 0;
  return pyRound((actual / planned) * 100);
}

function addDays(iso, count) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function diffDays(from, to) {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

/**
 * plan: { title, days: [{ dayIndex, isRest, intensity, focus, meal }] }
 * workoutLogs: [{ logDate, status, rpe, sets: [{ weightKg, reps, exerciseName }] }]
 * mealLogs: [{ logDate, calories, protein, carbs, fat }]
 */
export function buildWeeklyReport(
  plan,
  workoutLogs,
  mealLogs,
  weekStart,
  tone = "direct",
  prevWorkoutLogs = [],
) {
  const plannedDays = plan.days.filter((day) => !day.isRest);
  const plannedByIndex = new Map(plan.days.map((day) => [day.dayIndex, day]));

  const logsByIndex = new Map();
  for (const log of workoutLogs) {
    const index = diffDays(weekStart, log.logDate);
    if (index >= 0 && index <= 6) logsByIndex.set(index, log);
  }

  const logs = [...logsByIndex.values()];
  const done = logs.filter((log) => log.status === "done");
  const partial = logs.filter((log) => log.status === "partial");
  const missed = logs.filter((log) => log.status === "missed");

  // 운동 수행률 (부분 수행은 0.5로 계산)
  const completedScore = done.length + 0.5 * partial.length;
  const adherence = rate(completedScore, plannedDays.length);

  // 볼륨과 운동별 기록
  let totalVolume = 0;
  let totalSets = 0;
  const records = new Map();

  for (const log of logs) {
    for (const entry of log.sets) {
      totalVolume += entry.weightKg * entry.reps;
      totalSets += 1;

      if (!records.has(entry.exerciseName)) {
        records.set(entry.exerciseName, {
          name: entry.exerciseName,
          sets: 0,
          maxWeight: 0,
          repsAtMax: 0,
          maxReps: 0,
          volume: 0,
        });
      }

      const record = records.get(entry.exerciseName);
      record.sets += 1;
      record.volume += entry.weightKg * entry.reps;
      record.maxReps = Math.max(record.maxReps, entry.reps);

      if (entry.weightKg > record.maxWeight) {
        record.maxWeight = entry.weightKg;
        record.repsAtMax = entry.reps;
      } else if (entry.weightKg === record.maxWeight) {
        record.repsAtMax = Math.max(record.repsAtMax, entry.reps);
      }
    }
  }

  const exerciseRecords = [...records.values()].map((record) => {
    // 기록한 무게가 전부 0이면 맨몸 운동으로 보고 횟수를 대표값으로 쓴다.
    const bodyweight = record.maxWeight === 0;
    return {
      name: record.name,
      sets: record.sets,
      bodyweight,
      maxWeight: pyRound(record.maxWeight, 1),
      repsAtMax: record.repsAtMax,
      maxReps: record.maxReps,
      volume: pyRound(record.volume),
      best: bodyweight
        ? `최고 ${record.maxReps}회`
        : `최고 ${pyRound(record.maxWeight, 1).toFixed(1)}kg × ${record.repsAtMax}회`,
    };
  });

  // 중량 운동을 먼저, 그 안에서는 무게가 높은 순으로.
  exerciseRecords.sort(
    (a, b) =>
      Number(a.bodyweight) - Number(b.bodyweight) ||
      b.maxWeight - a.maxWeight ||
      b.maxReps - a.maxReps,
  );

  // 지난주 볼륨과 비교
  let prevVolume = 0;
  for (const log of prevWorkoutLogs ?? []) {
    for (const entry of log.sets) prevVolume += entry.weightKg * entry.reps;
  }
  const volumeChange = prevVolume
    ? pyRound(((totalVolume - prevVolume) / prevVolume) * 100)
    : null;

  // 요일별 계획/기록
  const daily = [];
  for (let index = 0; index < 7; index += 1) {
    const day = plannedByIndex.get(index);
    const log = logsByIndex.get(index);
    const logDate = addDays(weekStart, index);
    const dayMeals = mealLogs.filter((row) => row.logDate === logDate);
    const actual = macroSum(dayMeals);

    daily.push({
      day: DAYS[index],
      date: logDate,
      isRestDay: day ? day.isRest : true,
      focus: day ? day.focus : "",
      intensity: day ? day.intensity : "rest",
      workoutStatus: log ? log.status : day && day.isRest ? "rest" : "none",
      rpe: log ? log.rpe : null,
      volume: pyRound(
        log ? log.sets.reduce((sum, e) => sum + e.weightKg * e.reps, 0) : 0,
      ),
      plannedCalories: day && day.meal ? day.meal.calories : 0,
      actualCalories: actual.calories,
      plannedProtein: day && day.meal ? day.meal.protein : 0,
      actualProtein: actual.protein,
      mealCount: dayMeals.length,
    });
  }

  // 영양: 기록이 있는 날끼리만 비교한다.
  const loggedDates = new Set(mealLogs.map((row) => row.logDate));
  const loggedIndexes = new Set(
    [...loggedDates].map((value) => diffDays(weekStart, value)),
  );

  const fullWeek = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const plannedMacros = { calories: 0, protein: 0, carbs: 0, fat: 0 };

  for (const day of plan.days) {
    if (!day.meal) continue;
    for (const key of MACROS) {
      fullWeek[key] += day.meal[key];
      if (loggedIndexes.has(day.dayIndex)) plannedMacros[key] += day.meal[key];
    }
  }

  const actualMacros = macroSum(mealLogs);
  const loggedDays = loggedDates.size;

  const rates = {};
  for (const key of MACROS) rates[key] = rate(actualMacros[key], plannedMacros[key]);

  const nutrition = {
    planned: plannedMacros,
    plannedFullWeek: fullWeek,
    actual: actualMacros,
    loggedDays,
    rates,
  };

  const rpes = logs.map((log) => log.rpe).filter(Boolean);
  const avgRpe = rpes.length
    ? pyRound(rpes.reduce((a, b) => a + b, 0) / rpes.length, 1)
    : null;

  return {
    weekStart,
    planTitle: plan.title,
    workout: {
      plannedSessions: plannedDays.length,
      done: done.length,
      partial: partial.length,
      missed: missed.length,
      adherence,
      totalVolume: pyRound(totalVolume),
      prevVolume: pyRound(prevVolume),
      volumeChange,
      totalSets,
      avgRpe,
      records: exerciseRecords,
    },
    nutrition,
    daily,
    insights: buildInsights(adherence, nutrition, daily, avgRpe, loggedDays, tone),
    tone,
  };
}

export function buildInsights(
  adherence,
  nutrition,
  daily,
  avgRpe,
  loggedDays,
  tone = "direct",
) {
  const insights = [];

  // 1) 수행률
  if (adherence >= 90) {
    insights.push({
      kind: "good",
      title: `계획의 ${adherence}%를 소화했습니다`,
      detail: "이 정도면 다음 주에 볼륨을 5~10% 올려도 회복이 따라옵니다.",
    });
  } else if (adherence >= 60) {
    insights.push({
      kind: "info",
      title: `수행률 ${adherence}%`,
      detail:
        "나쁘지 않습니다. 빠진 세션이 특정 요일에 몰리는지 아래 요일별 표를 확인하세요.",
    });
  } else {
    insights.push({
      kind: "warn",
      title: `수행률이 ${adherence}%로 낮습니다`,
      detail:
        "계획 자체가 일정에 비해 과할 가능성이 큽니다. 훈련일을 하루 줄이거나 " +
        "세션당 시간을 짧게 잡는 편이 완주율에 유리합니다.",
    });
  }

  // 2) 반복해서 빠지는 요일
  const missedDays = daily
    .filter((item) => item.workoutStatus === "missed")
    .map((item) => item.day);

  if (missedDays.length >= 2) {
    insights.push({
      kind: "warn",
      title: `${missedDays.join(", ")}요일에 빠짐이 몰렸습니다`,
      detail: "그 요일은 애초에 휴식일로 두고 다른 요일로 옮기는 편이 현실적입니다.",
    });
  }

  // 3) 식단 기록
  if (loggedDays === 0) {
    insights.push({
      kind: "info",
      title: "식단 기록이 없습니다",
      detail: "기록이 없으면 영양 분석을 할 수 없습니다. 하루 한 끼라도 남겨보세요.",
    });
  } else {
    if (loggedDays < 5) {
      insights.push({
        kind: "info",
        title: `식단을 ${loggedDays}일 기록했습니다`,
        detail: "달성률은 기록한 날끼리만 비교한 값입니다. 기록일이 늘수록 정확해집니다.",
      });
    }

    const proteinRate = nutrition.rates.protein;
    const calorieRate = nutrition.rates.calories;

    if (proteinRate < 80) {
      insights.push({
        kind: "warn",
        title: `단백질 달성률 ${proteinRate}%`,
        detail:
          "근육 유지에 필요한 양에 못 미칩니다. 매 끼니에 손바닥 크기 단백질을 " +
          "먼저 배치하세요.",
      });
    } else if (proteinRate >= 95) {
      insights.push({
        kind: "good",
        title: `단백질 달성률 ${proteinRate}%`,
        detail: "가장 중요한 지표를 지켰습니다. 열량이 흔들려도 이건 유지하세요.",
      });
    }

    if (calorieRate >= 115) {
      insights.push({
        kind: "warn",
        title: `열량이 계획 대비 ${calorieRate}%`,
        detail:
          "간식과 음료를 포함해 기록했는지 확인하고, 다음 주는 탄수화물부터 조정하세요.",
      });
    } else if (calorieRate <= 80) {
      insights.push({
        kind: "warn",
        title: `열량이 계획 대비 ${calorieRate}%에 그쳤습니다`,
        detail:
          "적게 먹는 것이 항상 좋은 것은 아닙니다. 과한 적자는 근손실과 요요로 이어집니다.",
      });
    }
  }

  // 4) 체감 강도
  if (avgRpe !== null) {
    if (avgRpe >= 8.5) {
      insights.push({
        kind: "warn",
        title: `평균 체감 강도 ${avgRpe}/10`,
        detail:
          "매 세션을 한계까지 밀고 있습니다. 다음 주는 한 세션을 의도적으로 " +
          "가볍게 가져가세요.",
      });
    } else if (avgRpe <= 5) {
      insights.push({
        kind: "info",
        title: `평균 체감 강도 ${avgRpe}/10`,
        detail: "여유가 있습니다. 중량이나 세트를 조금 올려도 됩니다.",
      });
    }
  }

  return applyTone(insights, tone, adherence);
}

/** insight_tone 실험. 문구는 그대로 두고 배열 순서와 도입부만 바꾼다. */
function applyTone(insights, tone, adherence) {
  if (tone !== "supportive") {
    const order = { warn: 0, info: 1, good: 2 };
    return [...insights].sort((a, b) => (order[a.kind] ?? 1) - (order[b.kind] ?? 1));
  }

  const order = { good: 0, info: 1, warn: 2 };
  const ordered = [...insights].sort((a, b) => (order[a.kind] ?? 1) - (order[b.kind] ?? 1));

  const lead = {
    kind: "good",
    title: "이번 주도 기록을 남겼습니다",
    detail: "완벽한 주는 없습니다. 아래는 다음 주에 하나씩 손보면 되는 것들입니다.",
  };

  if (adherence >= 90) {
    lead.title = "이번 주 계획을 거의 그대로 지켰습니다";
    lead.detail = "이 흐름을 유지하는 것이 어떤 프로그램보다 중요합니다.";
  }

  return [lead, ...ordered];
}
