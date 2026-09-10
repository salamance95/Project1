/** 온보딩 응답 → 1주일 루틴 후보 생성. */

import { bodyProfile } from "./body.js";
import { ExerciseLibrary, LIGHT_WALK, buildSession, metricOf, speedOf } from "./exercises.js";
import { metFor, parseDistance } from "./energy.js";
import { INTENSITY_LABEL, dailyBaseline, mealForDay, weeklyTotal } from "./nutrition.js";
import {
  AUTO_SPLIT,
  COACHING_BY_GOAL,
  DAYS,
  EXERCISE_COUNT,
  LEVEL_SPLIT_CAP,
  SPLIT_OPTIONS,
  SPLIT_SESSIONS,
  TRAINING_DAYS,
  VARIANTS,
} from "./data/planner.data.js";

export { AUTO_SPLIT, DAYS, SPLIT_OPTIONS, TRAINING_DAYS, VARIANTS };

const NONE_OPTION = "해당 없음";
const FULL_BODY = "무분할(전신)";

function restMealNote(profile) {
  if (profile.goal === "체중 감량") return "휴식일에도 단백질은 유지하고 탄수화물만 줄이세요.";
  if (profile.goal === "근육량 증가") return "휴식일은 회복일입니다. 열량을 과하게 줄이지 마세요.";
  return "휴식일에는 수분과 수면을 우선하세요.";
}

/** 분할 이름 → 한 사이클 세션 수. 모르는 값이면 0(= 자동). */
export function splitSize(split) {
  const option = SPLIT_OPTIONS.find((item) => item.id === split);
  return option ? option.sessions : 0;
}

/**
 * 경력·훈련일·BMI로 분할을 고른다.
 * 경력이 짧거나 체중 부담이 크면 같은 부위를 자주 쓰도록 분할 수를 낮춘다.
 */
export function recommendSplit(profile, trainingDayCount, body = null) {
  const bmi = body ?? bodyProfile(profile);
  if (trainingDayCount <= 2) return FULL_BODY;

  let cap = Math.min(
    LEVEL_SPLIT_CAP[profile.level] ?? 1,
    bmi.splitCap,
    trainingDayCount,
  );
  // 체중 감량은 부위별 볼륨보다 주당 운동 빈도가 중요하다.
  if (profile.goal === "체중 감량") cap = Math.min(cap, 3);

  return cap <= 1 ? FULL_BODY : `${cap}분할`;
}

/** 요청한 분할이 훈련일 수를 넘으면 가능한 만큼으로 줄인다. */
function resolveSplit(profile, trainingDayCount, body) {
  const requested = profile.split ?? AUTO_SPLIT;

  if (requested === AUTO_SPLIT || !SPLIT_SESSIONS[requested]) {
    return {
      split: recommendSplit(profile, trainingDayCount, body),
      auto: true,
      adjusted: false,
    };
  }

  if (splitSize(requested) > trainingDayCount) {
    const fallback = trainingDayCount <= 2 ? FULL_BODY : `${trainingDayCount}분할`;
    return { split: fallback, auto: false, adjusted: true };
  }
  return { split: requested, auto: false, adjusted: false };
}

/** 분할 세션을 훈련일 수만큼 돌린다. 사이클보다 날이 많으면 처음부터 다시 돈다. */
function sessionsForSplit(split, trainingDayCount) {
  const cycle = SPLIT_SESSIONS[split] ?? SPLIT_SESSIONS[FULL_BODY];
  return Array.from(
    { length: trainingDayCount },
    (_, index) => cycle[index % cycle.length],
  );
}

/** 유산소를 세션 앞쪽(동작 수를 줄여도 남는 자리)으로 당긴다. */
function cardioFirst(patterns) {
  const index = patterns.indexOf("cardio");
  if (index < 0 || index <= 2) return patterns;

  const rest = patterns.filter((pattern) => pattern !== "cardio");
  return [...rest.slice(0, 2), "cardio", ...rest.slice(2)];
}

/** 목표와 부상 부위, 체형에 맞춘 코칭 문구. */
export function coachingFor(profile, body = null) {
  const coaching = [...(COACHING_BY_GOAL[profile.goal] ?? COACHING_BY_GOAL["기초 체력 향상"])];
  const injuries = (profile.injuries ?? []).filter((item) => item !== NONE_OPTION);

  if (injuries.length > 0) {
    coaching.push(
      `${injuries.join(", ")}에 부담이 큰 동작은 대체 동작으로 이미 교체했습니다. ` +
        "통증이 3일 이상 이어지면 해당 부위 운동을 멈추고 전문가 상담을 받으세요.",
    );
  }

  const info = body ?? bodyProfile(profile);
  if (info.bmi !== null) {
    // 체성분을 쟀으면 어떤 체형으로 봤는지까지 밝힌다.
    const head = info.precise
      ? `BMI ${info.bmi} · 체지방 ${info.bodyFat ?? "-"}% · ${info.typeLabel ?? info.category}`
      : `BMI ${info.bmi}(${info.category})`;
    coaching.push(`${head} · ${info.coaching}`);
  }
  return coaching;
}

/** 저장된 설문으로 실제 적용될 분할 이름을 되돌린다. */
export function planSplit(profile, trainingDayCount) {
  return resolveSplit(profile, trainingDayCount, bodyProfile(profile)).split;
}

export function guideFor(variantId) {
  const variant = VARIANTS.find((item) => item.id === variantId);
  return (variant ?? VARIANTS[0]).guide;
}

export function buildPlan(profile, variant, library = null, restrictions = {}, overrides = {}) {
  const lib = library ?? ExerciseLibrary.fromSeed();
  const baseline = dailyBaseline(profile, restrictions);
  const body = bodyProfile(profile);

  const frequency = overrides.frequency || profile.frequency;
  const trainingDays =
    overrides.trainingDays || TRAINING_DAYS[frequency] || TRAINING_DAYS["주 3일"];

  const { split, auto, adjusted } = resolveSplit(profile, trainingDays.length, body);
  const sessions = sessionsForSplit(split, trainingDays.length);

  // BMI가 높으면 관절 부담이 큰 동작을 빼고 강도를 한 단계 낮춘다.
  const limits = {
    ...restrictions,
    no_impact: Boolean(restrictions.no_impact || body.adjustments.noImpact),
  };

  let count = (EXERCISE_COUNT[profile.duration] ?? 4) + variant.count_offset;
  count += overrides.countOffset ?? 0;
  count += body.adjustments.countOffset;
  count = Math.max(3, Math.min(count, 5));

  const sessionByDay = new Map(trainingDays.map((day, index) => [day, sessions[index]]));
  const schedule = [];

  for (const day of DAYS) {
    if (!sessionByDay.has(day)) {
      const meal = mealForDay(baseline, "rest");
      schedule.push({
        day,
        isRestDay: true,
        intensity: "rest",
        intensityLabel: INTENSITY_LABEL.rest,
        workout: {
          focus: "휴식 및 회복",
          exercises: [LIGHT_WALK, "전신 스트레칭 10분"],
          items: [],
        },
        meal: { ...meal, note: restMealNote(profile) },
      });
      continue;
    }

    const [focus, rawPatterns, rawIntensity] = sessionByDay.get(day);
    // 안전 점검이나 BMI 보정으로 고강도 제한이 걸리면 강도를 한 단계 낮춘다.
    const capHigh =
      limits.no_high_intensity || body.adjustments.capHighIntensity || variant.ease_intensity;
    const intensity = capHigh && rawIntensity === "high" ? "moderate" : rawIntensity;

    const patterns =
      body.adjustments.cardioFirst || variant.cardio_first
        ? cardioFirst(rawPatterns)
        : rawPatterns;
    const session = buildSession(patterns.slice(0, count), profile, lib, limits);

    schedule.push({
      day,
      isRestDay: false,
      intensity,
      intensityLabel: INTENSITY_LABEL[intensity],
      workout: {
        focus,
        exercises: session.map(({ item, name, reps }) => `${name}(${item.muscle}) ${reps}`),
        items: session.map(({ item, name, reps }) => ({
          exerciseId: item.id ?? null,
          slug: item.slug,
          name,
          muscle: item.muscle,
          equipment: item.equipment,
          prescription: reps,
          // 무엇으로 재는 운동인가. 화면의 입력 칸이 이 값을 보고 달라진다.
          metric: metricOf(item),
          distanceKm: parseDistance(reps),
          // 소모 열량 추정에 쓴다. 동작마다 다르다.
          met: metFor(item),
          speedKmh: speedOf(item.slug),
        })),
      },
      meal: mealForDay(baseline, intensity),
    });
  }

  const dailyTargets = {
    calories: baseline.calories,
    protein: baseline.protein,
    carbs: baseline.carbs,
    fat: baseline.fat,
  };

  return {
    id: variant.id,
    title: `${profile.goal} · ${variant.title} 1주 루틴`,
    variant: variant.title,
    description: variant.description,
    trainingDays,
    frequency,
    split,
    splitAuto: auto,
    splitAdjusted: adjusted,
    bmi: body.bmi,
    bmiCategory: body.category,
    bmiNote: body.routineNote,
    bodyType: body.typeLabel,
    bodyFat: body.bodyFat,
    muscleMass: body.muscleMass,
    // 체성분 수치로 판단했는가. false면 키·체중만 본 것이다.
    preciseBody: body.precise,
    countOffset: overrides.countOffset ?? 0,
    baseline,
    dailyTargets,
    schedule,
    weeklyNutrition: weeklyTotal(schedule),
    coaching: coachingFor(profile, body),
    guide: variant.guide,
  };
}

export function buildPlans(profile, library = null, restrictions = {}, overrides = {}) {
  return VARIANTS.map((variant) =>
    buildPlan(profile, variant, library, restrictions, overrides),
  );
}
