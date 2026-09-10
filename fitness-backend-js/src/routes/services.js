/** 여러 라우트가 함께 쓰는 조회·계산 헬퍼. 파이썬 main.py의 내부 함수에 해당한다. */

import {
  burnedKcal,
  defaultMinutes,
  exerciseKcal,
  metFor,
  parseDistance,
  parsePrescription,
} from "../domain/energy.js";
import { METRICS, metricOf, speedOf } from "../domain/exercises.js";
import { checkProfile } from "../domain/safety.js";
import { DAYS } from "../domain/planner.js";
import * as crud from "../persistence/crud.js";

export class HttpError extends Error {
  constructor(status, detail) {
    super(typeof detail === "string" ? detail : "요청을 처리하지 못했습니다.");
    this.status = status;
    this.detail = detail;
  }
}

/** userId → { user, profile, payload, restrictions } */
export function profileContext(userId) {
  const profile = crud.activeProfile(userId);
  if (!profile) throw new HttpError(404, "설문 정보를 찾을 수 없습니다.");

  const user = crud.getUser(profile.userId);
  const payload = crud.profilePayload(profile, user);
  const { restrictions } = checkProfile(payload);

  return { user, profile, payload, restrictions };
}

/** 그 날짜가 속한 계획의 요일 정보를 찾는다. */
export function planDayFor(userId, targetDate) {
  for (const plan of crud.plansOverlapping(userId, targetDate, targetDate)) {
    const offset = crud.diffDays(plan.weekStart, targetDate);
    if (offset >= 0 && offset <= 6) {
      const day = crud.planDaysOf(plan.id).find((row) => row.dayIndex === offset);
      if (day) return { plan, day };
    }
  }
  return { plan: null, day: null };
}

/** 그날 계획된 총 세트 수. */
function plannedSetsOf(day) {
  if (!day) return 0;
  return day.items.reduce((total, item) => {
    const [sets] = parsePrescription(item.prescription);
    return total + (sets ?? 0);
  }, 0);
}

/** exerciseId → 마스터 동작. 동작별 MET을 찾을 때 쓴다. */
function libraryById() {
  return new Map(
    crud
      .loadLibrary()
      .items.filter((item) => item.id)
      .map((item) => [item.id, item]),
  );
}

/**
 * 저장된 세트 행들을 '운동 한 줄'로 모아 소모 열량을 낸다.
 * 세트마다 반올림하면 화면에 보이던 값과 몇 kcal씩 어긋난다.
 */
function kcalOfLoggedSets(rows, byId, weightKg) {
  const groups = new Map();

  for (const row of rows) {
    const key = `${row.exerciseId}|${row.distanceKm ?? 0}`;
    const group = groups.get(key) ?? {
      exerciseId: row.exerciseId,
      distanceKm: row.distanceKm ?? 0,
      sets: 0,
    };
    group.sets += 1;
    groups.set(key, group);
  }

  let total = 0;
  for (const group of groups.values()) {
    const item = byId.get(group.exerciseId) ?? null;
    total += exerciseKcal(
      {
        metric: item ? metricOf(item) : METRICS.REPS,
        met: metFor(item),
        sets: group.sets,
        distanceKm: group.distanceKm,
        speedKmh: item ? speedOf(item.slug) : null,
      },
      weightKg,
    );
  }
  return total;
}

/** 계획된 한 항목의 소모 열량. 처방에 적힌 세트 수·거리를 그대로 쓴다. */
function kcalOfPlannedItem(item, byId, weightKg) {
  const known = byId.get(item.exerciseId) ?? null;
  const metric = known ? metricOf(known) : METRICS.REPS;
  const [sets] = parsePrescription(item.prescription);

  return exerciseKcal(
    {
      metric,
      met: metFor(known),
      sets: sets ?? 0,
      distanceKm: parseDistance(item.prescription) ?? 0,
      speedKmh: known ? speedOf(known.slug) : null,
    },
    weightKg,
  );
}

/**
 * 기본 소모 + 계획 초과분 소모.
 *
 * 열량은 동작마다 다르게 잡는다. 같은 3세트라도 스쿼트와 레터럴 레이즈가
 * 같은 열량일 수 없어서, 동작별 MET으로 세트·거리를 환산해 더한다.
 * 소요 시간을 직접 적었다면 그 시간을 믿고(추가분이 이미 들어 있다) 그것으로 계산한다.
 */
export function energyFor(log, day, weightKg, fallbackMinutes) {
  const intensity = day ? day.intensity : "moderate";
  const byId = libraryById();

  const plannedSets = plannedSetsOf(day);
  const loggedSets = log.sets.length;
  const extraSets = log.status !== "missed" ? Math.max(loggedSets - plannedSets, 0) : 0;

  // 실제로 기록한 동작들을 하나씩 더한다.
  let loggedKcal = kcalOfLoggedSets(log.sets, byId, weightKg);
  if (log.status === "missed") loggedKcal = 0;
  else if (log.status === "partial") loggedKcal = Math.round(loggedKcal * 0.5);

  const plannedKcal = (day?.items ?? []).reduce(
    (total, item) => total + kcalOfPlannedItem(item, byId, weightKg),
    0,
  );
  const extra = Math.max(Math.round(loggedKcal - plannedKcal), 0);

  // 시간을 적었으면 그 시간이 진실이다. 아니면 동작별 추정 합계를 쓴다.
  const hasDuration = log.durationMin !== null && log.durationMin !== undefined;
  const base = hasDuration
    ? burnedKcal(log.status, intensity, log.durationMin, weightKg, fallbackMinutes)
    : loggedKcal;

  return {
    baseKcal: base,
    extraSets,
    extraKcal: extra,
    // 추가분은 이미 base(동작별 합계)에 들어 있다. 두 번 더하지 않는다.
    extraIncluded: false,
    plannedSets,
    loggedSets,
    burnedKcal: base,
  };
}

export function burnedFor(userId, log) {
  const profile = crud.activeProfile(userId);
  if (!profile) return 0;

  const user = crud.getUser(profile.userId);
  const { day } = planDayFor(userId, log.logDate);
  return energyFor(log, day, user.weightKg, defaultMinutes(profile.duration));
}

/** '덤벨 컬(이두)' → '이두'. 직접 적은 운동에서 부위를 뽑는다. */
function muscleFromName(name) {
  const match = /\(([^)]+)\)\s*$/.exec(name ?? "");
  return match ? match[1] : "";
}

/** 달력·요약에 쓸 날짜별 집계. */
export function dailySummary(userId, start, end, workouts, meals) {
  const profile = crud.activeProfile(userId);
  const user = profile ? crud.getUser(profile.userId) : null;
  const weight = user ? user.weightKg : 70;
  const fallback = profile ? defaultMinutes(profile.duration) : 50;

  const muscleById = new Map(
    crud.loadLibrary().items.map((item) => [item.id, item.muscle]),
  );

  // 기간과 겹치는 계획을 미리 펼쳐 날짜 → 계획 요일로 만든다.
  const planByDate = new Map();
  for (const plan of crud.plansOverlapping(userId, start, end)) {
    for (const day of crud.planDaysOf(plan.id)) {
      planByDate.set(crud.addDays(plan.weekStart, day.dayIndex), day);
    }
  }

  const workoutByDate = new Map(workouts.map((log) => [log.logDate, log]));
  const mealsByDate = new Map();
  for (const meal of meals) {
    if (!mealsByDate.has(meal.logDate)) mealsByDate.set(meal.logDate, []);
    mealsByDate.get(meal.logDate).push(meal);
  }

  const summary = [];
  let cursor = start;

  while (cursor <= end) {
    const day = planByDate.get(cursor);
    const log = workoutByDate.get(cursor);
    const dayMeals = mealsByDate.get(cursor) ?? [];

    const intake = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    for (const meal of dayMeals) {
      intake.calories += meal.calories;
      intake.protein += meal.protein;
      intake.carbs += meal.carbs;
      intake.fat += meal.fat;
    }

    const energy = log ? energyFor(log, day, weight, fallback) : null;

    // 기록한 세트에서 실제로 한 운동 이름과 부위를 뽑는다.
    const performed = [];
    const muscles = [];
    if (log) {
      for (const entry of log.sets) {
        if (!performed.includes(entry.exerciseName)) performed.push(entry.exerciseName);
        const muscle = muscleById.get(entry.exerciseId) || muscleFromName(entry.exerciseName);
        if (muscle && !muscles.includes(muscle)) muscles.push(muscle);
      }
    }

    if (log || dayMeals.length > 0 || day) {
      summary.push({
        date: cursor,
        planned: day ? day.focus : null,
        intensity: day ? day.intensity : null,
        isRestDay: day ? Boolean(day.isRest) : null,
        targetCalories: day && day.meal ? day.meal.calories : null,
        targetProtein: day && day.meal ? day.meal.protein : null,
        workoutStatus: log ? log.status : null,
        performed,
        muscles,
        durationMin: log ? log.durationMin : null,
        rpe: log ? log.rpe : null,
        burnedKcal: energy ? energy.burnedKcal : 0,
        extraSets: energy ? energy.extraSets : 0,
        extraKcal: energy ? energy.extraKcal : 0,
        extraIncluded: energy ? energy.extraIncluded : false,
        plannedSets: energy ? energy.plannedSets : 0,
        loggedSets: energy ? energy.loggedSets : 0,
        intake,
        meals: dayMeals.map((meal) => ({
          mealType: meal.mealType,
          description: meal.description,
          calories: meal.calories,
          protein: meal.protein,
        })),
      });
    }

    cursor = crud.addDays(cursor, 1);
  }

  return summary;
}

/** 리포트 엔진이 기대하는 형태로 계획을 펼친다. */
export function planForReport(plan) {
  return {
    title: plan.title,
    days: crud.planDaysOf(plan.id).map((day) => ({
      dayIndex: day.dayIndex,
      isRest: Boolean(day.isRest),
      intensity: day.intensity,
      focus: day.focus,
      meal: day.meal
        ? {
            calories: day.meal.calories,
            protein: day.meal.protein,
            carbs: day.meal.carbs,
            fat: day.meal.fat,
          }
        : null,
    })),
  };
}

export { DAYS };
