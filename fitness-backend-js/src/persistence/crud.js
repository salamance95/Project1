/** DB 읽기/쓰기. 계획 객체 ↔ 정규화 테이블 사이의 변환을 담당한다. */

import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "../core/db.js";
import {
  adjustments,
  bodyParts,
  diningEvents,
  equipment,
  exerciseRisks,
  exercises,
  mealLogs,
  mealTargets,
  musicLinks,
  planDayExercises,
  planDays,
  plans,
  profileEquipment,
  profileInjuries,
  profiles,
  safetyFlags,
  setLogs,
  users,
  workoutLogs,
} from "../db/schema.js";
import { nowIso } from "../core/num.js";
import {
  ExerciseLibrary,
  LIGHT_WALK,
  METRICS,
  distanceFor,
  metricOf,
  minutesOf,
  normalizeEquipment,
  speedOf,
} from "../domain/exercises.js";
import {
  metFor,
  parseDistance,
  parsePrescription,
  recommendedWeight,
} from "../domain/energy.js";
import { INTENSITY_LABEL, weeklyTotal } from "../domain/nutrition.js";
import { bodyProfile } from "../domain/body.js";
import { AUTO_SPLIT, DAYS, coachingFor, guideFor, planSplit } from "../domain/planner.js";

const NONE_OPTION = "해당 없음";

/* ------------------------------------------------------------- 날짜 헬퍼 */

export function addDays(iso, count) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

export function diffDays(from, to) {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

/** 해당 날짜가 속한 주의 월요일. */
export function weekStartOf(iso = null) {
  const base = iso ? new Date(`${iso}T00:00:00Z`) : new Date();
  const day = iso
    ? base
    : new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate()));
  const weekday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - weekday);
  return day.toISOString().slice(0, 10);
}

/* ----------------------------------------------------------- 마스터 조회 */

export function loadLibrary() {
  const rows = db
    .select({
      id: exercises.id,
      slug: exercises.slug,
      name: exercises.name,
      pattern: exercises.pattern,
      muscle: exercises.muscle,
      load: exercises.load,
      isHighImpact: exercises.isHighImpact,
      altSlug: exercises.altSlug,
      equipment: equipment.name,
    })
    .from(exercises)
    .leftJoin(equipment, eq(exercises.equipmentId, equipment.id))
    .all();

  if (rows.length === 0) return ExerciseLibrary.fromSeed();

  const risks = db
    .select({
      exerciseId: exerciseRisks.exerciseId,
      name: bodyParts.name,
    })
    .from(exerciseRisks)
    .innerJoin(bodyParts, eq(exerciseRisks.bodyPartId, bodyParts.id))
    .all();

  const riskMap = new Map();
  for (const row of risks) {
    if (!riskMap.has(row.exerciseId)) riskMap.set(row.exerciseId, []);
    riskMap.get(row.exerciseId).push(row.name);
  }

  return ExerciseLibrary.fromRows(
    rows.map((row) => ({ ...row, risk: riskMap.get(row.id) ?? [] })),
  );
}

const bodyPartMap = () =>
  new Map(db.select().from(bodyParts).all().map((row) => [row.name, row]));

const equipmentMap = () =>
  new Map(db.select().from(equipment).all().map((row) => [row.name, row]));

/* --------------------------------------------------------- 사용자와 설문 */

/** userId가 오면 신체 정보를 갱신하고, 없으면 새로 만든다. */
export function upsertUser(payload, userId = null) {
  const existing = userId
    ? db.select().from(users).where(eq(users.id, userId)).get()
    : null;

  const values = {
    sex: payload.sex,
    age: payload.age,
    heightCm: payload.height,
    weightKg: payload.weight,
    // 안 잰 값은 null로 남긴다. 0으로 채우면 "체지방 0%"가 되어 버린다.
    bodyFatPct: payload.bodyFat ?? null,
    muscleMassKg: payload.muscleMass ?? null,
  };

  if (!existing) {
    const inserted = db.insert(users).values({ ...values, createdAt: nowIso() }).returning().get();
    return inserted;
  }

  db.update(users).set(values).where(eq(users.id, existing.id)).run();
  return { ...existing, ...values };
}

/** 새 설문 버전을 저장하고 이전 버전은 비활성화한다. */
export function saveProfile(user, payload, findings) {
  db.update(profiles).set({ isActive: false }).where(eq(profiles.userId, user.id)).run();

  const profile = db
    .insert(profiles)
    .values({
      userId: user.id,
      goal: payload.goal,
      level: payload.level,
      frequency: payload.frequency,
      split: payload.split ?? AUTO_SPLIT,
      duration: payload.duration,
      style: payload.style,
      isActive: true,
      createdAt: nowIso(),
    })
    .returning()
    .get();

  const parts = bodyPartMap();
  for (const name of payload.injuries ?? []) {
    if (name === NONE_OPTION || !parts.has(name)) continue;
    db.insert(profileInjuries)
      .values({ profileId: profile.id, bodyPartId: parts.get(name).id })
      .run();
  }

  const gear = equipmentMap();
  for (const name of normalizeEquipment(payload.equipment)) {
    if (!gear.has(name)) continue;
    db.insert(profileEquipment)
      .values({ profileId: profile.id, equipmentId: gear.get(name).id })
      .run();
  }

  for (const finding of findings) {
    db.insert(safetyFlags)
      .values({
        profileId: profile.id,
        code: finding.code,
        severity: finding.severity,
        message: finding.message,
      })
      .run();
  }

  return profile;
}

export function activeProfile(userId) {
  return db
    .select()
    .from(profiles)
    .where(and(eq(profiles.userId, userId), eq(profiles.isActive, true)))
    .get();
}

export function getUser(userId) {
  return db.select().from(users).where(eq(users.id, userId)).get();
}

/** DB의 설문 행을 규칙 엔진이 쓰는 형태로 되돌린다. */
export function profilePayload(profile, user) {
  const injuries = db
    .select({ name: bodyParts.name })
    .from(profileInjuries)
    .innerJoin(bodyParts, eq(profileInjuries.bodyPartId, bodyParts.id))
    .where(eq(profileInjuries.profileId, profile.id))
    .all()
    .map((row) => row.name);

  const gear = db
    .select({ name: equipment.name })
    .from(profileEquipment)
    .innerJoin(equipment, eq(profileEquipment.equipmentId, equipment.id))
    .where(eq(profileEquipment.profileId, profile.id))
    .all()
    .map((row) => row.name);

  return {
    goal: profile.goal,
    level: profile.level,
    frequency: profile.frequency,
    split: profile.split ?? AUTO_SPLIT,
    duration: profile.duration,
    style: profile.style,
    injuries: injuries.length > 0 ? injuries : [NONE_OPTION],
    equipment: [...normalizeEquipment(gear)].sort(),
    sex: user.sex,
    age: user.age,
    height: user.heightCm,
    weight: user.weightKg,
    bodyFat: user.bodyFatPct ?? null,
    muscleMass: user.muscleMassKg ?? null,
  };
}

/* ------------------------------------------------------------------ 계획 */

function writeDays(planId, schedule) {
  const slugToId = new Map(
    db.select().from(exercises).all().map((row) => [row.slug, row.id]),
  );

  for (const dayDto of schedule) {
    const dayIndex = DAYS.indexOf(dayDto.day);
    const day = db
      .insert(planDays)
      .values({
        planId,
        dayIndex,
        isRest: Boolean(dayDto.isRestDay),
        intensity: dayDto.intensity ?? "moderate",
        focus: dayDto.workout.focus,
        note: dayDto.note ?? null,
        status: dayDto.status ?? null,
      })
      .returning()
      .get();

    const items = dayDto.workout.items;
    if (items && items.length > 0) {
      items.forEach((item, position) => {
        db.insert(planDayExercises)
          .values({
            planDayId: day.id,
            exerciseId: item.exerciseId ?? slugToId.get(item.slug) ?? null,
            displayName: item.name,
            muscle: item.muscle ?? "",
            prescription: item.prescription ?? "",
            position,
          })
          .run();
      });
    } else {
      // 휴식일처럼 마스터에 없는 안내 문구는 이름만 저장한다.
      dayDto.workout.exercises.forEach((text, position) => {
        db.insert(planDayExercises)
          .values({
            planDayId: day.id,
            exerciseId: null,
            displayName: text,
            muscle: "",
            prescription: "",
            position,
          })
          .run();
      });
    }

    const meal = dayDto.meal;
    db.insert(mealTargets)
      .values({
        planDayId: day.id,
        targetText: meal.target,
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat,
        breakfast: meal.breakfast ?? "",
        lunch: meal.lunch ?? "",
        dinner: meal.dinner ?? "",
        snack: meal.snack ?? "",
        note: meal.note ?? null,
      })
      .run();
  }
}

/** 생성된 계획을 정규화 테이블로 저장한다. */
export function savePlan(user, profile, planDto, weekStart = null) {
  const week = weekStart ?? weekStartOf();

  db.update(plans)
    .set({ isActive: false })
    .where(and(eq(plans.userId, user.id), eq(plans.isActive, true)))
    .run();

  const baseline = planDto.baseline;
  const plan = db
    .insert(plans)
    .values({
      userId: user.id,
      profileId: profile.id,
      variant: planDto.id,
      title: planDto.title,
      description: planDto.description,
      weekStart: week,
      baselineCalories: baseline.calories,
      baselineProtein: baseline.protein,
      baselineCarbs: baseline.carbs,
      baselineFat: baseline.fat,
      isActive: true,
      createdAt: nowIso(),
    })
    .returning()
    .get();

  writeDays(plan.id, planDto.schedule);
  return plan;
}

/** 재배치/보정 결과로 계획 요일을 통째로 다시 쓴다. */
export function replaceSchedule(plan, schedule) {
  const dayRows = db.select().from(planDays).where(eq(planDays.planId, plan.id)).all();
  const dayIds = dayRows.map((row) => row.id);

  if (dayIds.length > 0) {
    db.delete(planDayExercises).where(inArray(planDayExercises.planDayId, dayIds)).run();
    db.delete(mealTargets).where(inArray(mealTargets.planDayId, dayIds)).run();
    db.delete(planDays).where(eq(planDays.planId, plan.id)).run();
  }

  writeDays(plan.id, schedule);
  return plan;
}

export function loadPlan(planId) {
  return db.select().from(plans).where(eq(plans.id, planId)).get();
}

export function activePlan(userId) {
  return db
    .select()
    .from(plans)
    .where(and(eq(plans.userId, userId), eq(plans.isActive, true)))
    .orderBy(desc(plans.createdAt))
    .get();
}

/** 계획 하위 행(요일 + 동작 + 식단)을 한 번에 읽는다. */
export function planDaysOf(planId) {
  const days = db
    .select()
    .from(planDays)
    .where(eq(planDays.planId, planId))
    .orderBy(planDays.dayIndex)
    .all();

  const dayIds = days.map((day) => day.id);
  if (dayIds.length === 0) return [];

  const items = db
    .select()
    .from(planDayExercises)
    .where(inArray(planDayExercises.planDayId, dayIds))
    .orderBy(planDayExercises.position)
    .all();

  const meals = db
    .select()
    .from(mealTargets)
    .where(inArray(mealTargets.planDayId, dayIds))
    .all();

  const itemsByDay = new Map();
  for (const item of items) {
    if (!itemsByDay.has(item.planDayId)) itemsByDay.set(item.planDayId, []);
    itemsByDay.get(item.planDayId).push(item);
  }
  const mealByDay = new Map(meals.map((meal) => [meal.planDayId, meal]));

  return days.map((day) => ({
    ...day,
    items: itemsByDay.get(day.id) ?? [],
    meal: mealByDay.get(day.id) ?? null,
  }));
}

/** 거리 표기가 없던 시절에 저장된 휴식일 안내 문구를 지금 표기로 맞춘다. */
function restLine(text) {
  return text.startsWith("가벼운 걷기") ? LIGHT_WALK : text;
}

/** 계획 항목 + 추천 세트/횟수/중량. */
function planItem(item, slugById, user, profile, libraryBySlug = null) {
  const slug = slugById.get(item.exerciseId);
  const [sets, reps] = parsePrescription(item.prescription);
  const known = slug ? libraryBySlug?.get(slug) : null;
  const metric = known ? metricOf(known) : METRICS.REPS;

  // 거리 표기가 없던 시절에 만든 계획은 적힌 시간으로 거리를 되살린다.
  let prescription = item.prescription;
  let distanceKm = parseDistance(prescription);
  if (metric === METRICS.DISTANCE && distanceKm === null) {
    const minutes = minutesOf(prescription);
    distanceKm = distanceFor(slug, minutes);
    if (distanceKm) prescription = `${distanceKm}km(${minutes}분)`;
  }

  return {
    exerciseId: item.exerciseId,
    slug: slug ?? null,
    name: restLine(item.displayName),
    muscle: item.muscle,
    equipment: known?.equipment ?? null,
    prescription,
    sets,
    reps,
    metric,
    distanceKm,
    // 소모 열량 추정에 쓴다. 동작마다 다르다.
    met: metFor(known),
    speedKmh: slug ? speedOf(slug) : null,
    // 무게를 다루는 동작에만 추천 중량을 붙인다.
    recommendedWeight:
      slug && metric === METRICS.WEIGHT
        ? recommendedWeight(slug, user.weightKg, profile.level, profile.style)
        : null,
  };
}

/** DB의 계획을 프론트가 쓰던 형태로 되돌린다. */
export function planToDto(plan, profile, user) {
  const payload = profilePayload(profile, user);
  const slugById = new Map(
    db.select().from(exercises).all().map((row) => [row.id, row.slug]),
  );
  const libraryBySlug = new Map(loadLibrary().items.map((item) => [item.slug, item]));

  const schedule = planDaysOf(plan.id).map((day) => {
    const meal = day.meal;
    // 표기가 어긋나지 않게 항목을 먼저 만들고 텍스트 줄은 그것으로 조립한다.
    const items = day.items.map((item) => planItem(item, slugById, user, profile, libraryBySlug));
    return {
      day: DAYS[day.dayIndex],
      isRestDay: Boolean(day.isRest),
      intensity: day.intensity,
      intensityLabel: INTENSITY_LABEL[day.intensity] ?? day.intensity,
      status: day.status,
      note: day.note,
      workout: {
        focus: day.focus,
        exercises: items.map((item) =>
          item.muscle
            ? `${item.name}(${item.muscle}) ${item.prescription}`.trim()
            : `${item.name} ${item.prescription}`.trim(),
        ),
        items,
      },
      meal: {
        target: meal ? meal.targetText : "",
        calories: meal ? meal.calories : 0,
        protein: meal ? meal.protein : 0,
        carbs: meal ? meal.carbs : 0,
        fat: meal ? meal.fat : 0,
        breakfast: meal ? meal.breakfast : "",
        lunch: meal ? meal.lunch : "",
        dinner: meal ? meal.dinner : "",
        snack: meal ? meal.snack : "",
        note: meal ? meal.note : null,
      },
    };
  });

  const body = bodyProfile(payload);
  const baseline = {
    calories: plan.baselineCalories,
    protein: plan.baselineProtein,
    carbs: plan.baselineCarbs,
    fat: plan.baselineFat,
  };

  return {
    planId: plan.id,
    id: plan.variant,
    title: plan.title,
    variant: plan.variant,
    description: plan.description,
    weekStart: plan.weekStart,
    split: planSplit(payload, schedule.filter((day) => !day.isRestDay).length),
    bmi: body.bmi,
    bmiCategory: body.category,
    bodyType: body.typeLabel,
    bodyFat: body.bodyFat,
    muscleMass: body.muscleMass,
    preciseBody: body.precise,
    baseline,
    dailyTargets: baseline,
    schedule,
    weeklyNutrition: weeklyTotal(schedule),
    coaching: coachingFor(payload),
    guide: guideFor(plan.variant),
  };
}

/**
 * 계획 항목 하나를 다른 동작으로 바꾼다. 그 자리(요일·순서)만 갈아끼우고
 * 나머지 요일과 식단은 건드리지 않는다.
 */
export function swapPlanExercise(planId, dayIndex, position, item, prescription) {
  const day = db
    .select()
    .from(planDays)
    .where(and(eq(planDays.planId, planId), eq(planDays.dayIndex, dayIndex)))
    .get();
  if (!day) return null;

  const row = db
    .select()
    .from(planDayExercises)
    .where(
      and(eq(planDayExercises.planDayId, day.id), eq(planDayExercises.position, position)),
    )
    .get();
  if (!row) return null;

  const exerciseId =
    item.id ?? db.select().from(exercises).where(eq(exercises.slug, item.slug)).get()?.id ?? null;

  db.update(planDayExercises)
    .set({
      exerciseId,
      displayName: item.name,
      muscle: item.muscle,
      prescription,
    })
    .where(eq(planDayExercises.id, row.id))
    .run();

  return { previousName: row.displayName, dayId: day.id };
}

/** 주차 이동용 계획 목록. */
export function listPlans(userId) {
  return db
    .select()
    .from(plans)
    .where(eq(plans.userId, userId))
    .orderBy(desc(plans.weekStart))
    .all()
    .map((row) => ({
      planId: row.id,
      weekStart: row.weekStart,
      title: row.title,
      variant: row.variant,
      isActive: Boolean(row.isActive),
    }));
}

export function setActivePlan(userId, planId) {
  db.update(plans).set({ isActive: false }).where(eq(plans.userId, userId)).run();
  db.update(plans).set({ isActive: true }).where(eq(plans.id, planId)).run();
}

/** 기간과 겹치는 계획들. 달력에 요일별 계획을 겹쳐 보여줄 때 쓴다. */
export function plansOverlapping(userId, start, end) {
  return db
    .select()
    .from(plans)
    .where(and(eq(plans.userId, userId), lte(plans.weekStart, end)))
    .orderBy(plans.weekStart)
    .all();
}

export function logAdjustment(plan, kind, dayIndex, message) {
  db.insert(adjustments)
    .values({ planId: plan.id, kind, dayIndex, message, createdAt: nowIso() })
    .run();
}

export function logDiningEvent(userId, planId, event, rebalance) {
  db.insert(diningEvents)
    .values({
      userId,
      planId,
      dayIndex: DAYS.indexOf(event.day),
      eventType: event.type,
      cuisine: event.cuisine ?? "",
      alcohol: event.alcohol ?? "없음",
      surplusKcal: rebalance.surplus ?? 0,
      appliedKcal: rebalance.applied ?? 0,
      createdAt: nowIso(),
    })
    .run();
}

/* ------------------------------------------------------------------ 기록 */

/** 같은 날짜에는 기록 하나만 유지한다. */
export function upsertWorkoutLog(userId, payload) {
  let log = db
    .select()
    .from(workoutLogs)
    .where(and(eq(workoutLogs.userId, userId), eq(workoutLogs.logDate, payload.date)))
    .get();

  const values = {
    status: payload.status,
    planDayId: payload.planDayId ?? null,
    durationMin: payload.durationMin ?? null,
    rpe: payload.rpe ?? null,
    note: payload.note ?? null,
  };

  if (!log) {
    log = db
      .insert(workoutLogs)
      .values({ userId, logDate: payload.date, ...values, createdAt: nowIso() })
      .returning()
      .get();
  } else {
    db.update(workoutLogs).set(values).where(eq(workoutLogs.id, log.id)).run();
    log = { ...log, ...values };
  }

  db.delete(setLogs).where(eq(setLogs.workoutLogId, log.id)).run();

  const rows = db.select().from(exercises).all();
  const slugToId = new Map(rows.map((row) => [row.slug, row.id]));
  const nameToId = new Map(rows.map((row) => [row.name, row.id]));

  // 화면은 '운동 한 줄 + 세트 수'로 입력받지만, 저장은 세트 단위로 펼친다.
  for (const entry of payload.sets ?? []) {
    // 화면에는 '덤벨 로우(등)'처럼 부위가 붙어 있다. 그대로 못 찾으면 떼고 다시 찾는다.
    const bareName = (entry.exerciseName ?? "").replace(/\s*\([^)]*\)\s*$/, "");
    const exerciseId =
      entry.exerciseId ??
      slugToId.get(entry.slug ?? "") ??
      nameToId.get(entry.exerciseName) ??
      nameToId.get(bareName) ??
      null;
    const count = Math.max(Number(entry.sets ?? 1), 1);

    for (let setNo = 1; setNo <= count; setNo += 1) {
      db.insert(setLogs)
        .values({
          workoutLogId: log.id,
          exerciseId,
          exerciseName: entry.exerciseName,
          setNo,
          weightKg: entry.weightKg ?? 0,
          reps: entry.reps ?? 0,
          distanceKm: entry.distanceKm ?? 0,
        })
        .run();
    }
  }

  return { ...log, sets: setsOf(log.id) };
}

export function setsOf(workoutLogId) {
  return db.select().from(setLogs).where(eq(setLogs.workoutLogId, workoutLogId)).all();
}

/** 세트 행 → 운동 한 줄. 화면 입력 형태로 되돌린다. */
export function collapseSets(sets) {
  const grouped = [];
  const index = new Map();

  for (const entry of [...sets].sort((a, b) => a.id - b.id)) {
    const key = `${entry.exerciseName}|${entry.weightKg}|${entry.reps}|${entry.distanceKm}`;
    if (index.has(key)) {
      grouped[index.get(key)].sets += 1;
      continue;
    }
    index.set(key, grouped.length);
    grouped.push({
      exerciseName: entry.exerciseName,
      sets: 1,
      weightKg: entry.weightKg,
      reps: entry.reps,
      distanceKm: entry.distanceKm ?? 0,
    });
  }

  return grouped;
}

/* ------------------------------------------------------- 음악 플레이리스트 */

export function musicLinksOf(userId) {
  return db
    .select()
    .from(musicLinks)
    .where(eq(musicLinks.userId, userId))
    .orderBy(desc(musicLinks.id))
    .all()
    .map((row) => ({ id: row.id, label: row.label, url: row.url }));
}

export function addMusicLink(userId, label, url) {
  return db
    .insert(musicLinks)
    .values({ userId, label, url, createdAt: nowIso() })
    .returning()
    .get();
}

export function deleteMusicLink(userId, linkId) {
  const row = db.select().from(musicLinks).where(eq(musicLinks.id, linkId)).get();
  if (!row || row.userId !== userId) return false;

  db.delete(musicLinks).where(eq(musicLinks.id, linkId)).run();
  return true;
}

export function addMealLog(userId, payload) {
  return db
    .insert(mealLogs)
    .values({
      userId,
      logDate: payload.date,
      mealType: payload.mealType,
      description: payload.description ?? "",
      calories: payload.calories ?? 0,
      protein: payload.protein ?? 0,
      carbs: payload.carbs ?? 0,
      fat: payload.fat ?? 0,
      createdAt: nowIso(),
    })
    .returning()
    .get();
}

export function deleteMealLog(userId, logId) {
  const row = db.select().from(mealLogs).where(eq(mealLogs.id, logId)).get();
  if (!row || row.userId !== userId) return false;
  db.delete(mealLogs).where(eq(mealLogs.id, logId)).run();
  return true;
}

export function workoutLogsBetween(userId, start, end) {
  const logs = db
    .select()
    .from(workoutLogs)
    .where(
      and(
        eq(workoutLogs.userId, userId),
        gte(workoutLogs.logDate, start),
        lte(workoutLogs.logDate, end),
      ),
    )
    .orderBy(workoutLogs.logDate)
    .all();

  return logs.map((log) => ({ ...log, sets: setsOf(log.id) }));
}

export function mealLogsBetween(userId, start, end) {
  return db
    .select()
    .from(mealLogs)
    .where(
      and(eq(mealLogs.userId, userId), gte(mealLogs.logDate, start), lte(mealLogs.logDate, end)),
    )
    .orderBy(mealLogs.logDate, mealLogs.id)
    .all();
}

export function weekWorkoutLogs(userId, start) {
  return workoutLogsBetween(userId, start, addDays(start, 6));
}

export function weekMealLogs(userId, start) {
  return mealLogsBetween(userId, start, addDays(start, 6));
}

/* ------------------------------------------------------- 소셜 로그인 계정 */

/** 이 소셜 계정에 묶인 사용자. 없으면 undefined. */
export function userBySupabaseId(supabaseUserId) {
  return db.select().from(users).where(eq(users.supabaseUserId, supabaseUserId)).get();
}

/**
 * 사용자 행을 소셜 계정에 묶는다.
 * 게스트로 쓰던 사람이 로그인하면 그때까지의 기록을 그대로 이어받게 하려고,
 * 새 행을 만들지 않고 쓰던 행에 계정을 붙인다.
 */
export function linkUserToSupabase(userId, { supabaseUserId, email, displayName }) {
  const values = { supabaseUserId };
  if (email) values.email = email;
  // 이름은 이미 있으면 덮어쓰지 않는다. 설문에서 적은 이름이 우선이다.
  const existing = db.select().from(users).where(eq(users.id, userId)).get();
  if (displayName && !existing?.displayName) values.displayName = displayName;

  db.update(users).set(values).where(eq(users.id, userId)).run();
  return { ...existing, ...values };
}

/* --------------------------------------------------- 동작별 지난 기록 */

/**
 * 동작 이름 → 마지막으로 한 무게·횟수·거리와 그 날짜, 그리고 최고 기록.
 *
 * 기록 화면에서 계획의 추천 수치 대신 "지난번에 실제로 든 무게"를 미리 채우려고
 * 쓴다. 계획을 바꿔도 이 기록은 그대로 남으므로, 플랜을 갈아타도 이어서 든다.
 */
export function exerciseHistory(userId) {
  const logs = db
    .select()
    .from(workoutLogs)
    .where(eq(workoutLogs.userId, userId))
    .orderBy(workoutLogs.logDate)
    .all();

  if (logs.length === 0) return {};

  const dateOf = new Map(logs.map((log) => [log.id, log.logDate]));
  const rows = db
    .select()
    .from(setLogs)
    .where(inArray(setLogs.workoutLogId, logs.map((log) => log.id)))
    .all();

  const history = {};
  // 세트 행은 날짜 순으로 오지 않는다. 날짜를 모아 두고 마지막에 센다.
  const datesSeen = new Map();

  for (const row of rows) {
    const date = dateOf.get(row.workoutLogId);
    if (!date) continue;

    const entry = (history[row.exerciseName] ??= {
      exerciseName: row.exerciseName,
      lastDate: null,
      lastWeightKg: 0,
      lastReps: 0,
      lastDistanceKm: 0,
      lastSets: 0,
      bestWeightKg: 0,
      bestDistanceKm: 0,
      sessions: 0,
    });

    if (!datesSeen.has(row.exerciseName)) datesSeen.set(row.exerciseName, new Set());
    datesSeen.get(row.exerciseName).add(date);

    entry.bestWeightKg = Math.max(entry.bestWeightKg, row.weightKg ?? 0);
    entry.bestDistanceKm = Math.max(entry.bestDistanceKm, row.distanceKm ?? 0);

    // 날짜가 같으면 세트 수만 늘리고, 더 최근이면 통째로 갈아끼운다.
    if (entry.lastDate === date) {
      entry.lastSets += 1;
      continue;
    }
    if (entry.lastDate && entry.lastDate > date) continue;

    entry.lastDate = date;
    entry.lastWeightKg = row.weightKg ?? 0;
    entry.lastReps = row.reps ?? 0;
    entry.lastDistanceKm = row.distanceKm ?? 0;
    entry.lastSets = 1;
  }

  for (const [name, dates] of datesSeen) history[name].sessions = dates.size;

  return history;
}
