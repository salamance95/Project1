/** 열량/매크로 계산과 운동 강도별 하루 영양 목표. */

import { pyRound } from "../core/num.js";
import { clampCalories } from "./safety.js";
import {
  ACTIVITY_BY_FREQUENCY,
  DURATION_BONUS,
  GOAL_PROFILE,
  INTENSITY_FACTOR,
  INTENSITY_LABEL,
  MEAL_TEMPLATES,
} from "./data/nutrition.data.js";

export { INTENSITY_LABEL, MEAL_TEMPLATES };

/** Mifflin-St Jeor 기초대사량. */
export function bmrMifflin(sex, age, heightCm, weightKg) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "남성" ? base + 5 : base - 161;
}

/** 온보딩 응답 → 하루 기준 열량과 매크로. */
export function dailyBaseline(profile, restrictions = {}) {
  const bmr = bmrMifflin(profile.sex, profile.age, profile.height, profile.weight);

  let activity = ACTIVITY_BY_FREQUENCY[profile.frequency] ?? 1.45;
  activity += DURATION_BONUS[profile.duration] ?? 0;
  const tdee = bmr * activity;

  const goal = GOAL_PROFILE[profile.goal] ?? GOAL_PROFILE["기초 체력 향상"];
  let factor = goal.calorie_factor;
  if (restrictions.no_deficit) factor = Math.max(factor, 1.0);

  let calories = tdee * factor;
  // 성별 하한선과 기초대사량 아래로는 내려가지 않게 막는다.
  calories = Math.max(clampCalories(calories, profile, restrictions), bmr);

  const proteinG = profile.weight * goal.protein_per_kg;
  const fatG = (calories * goal.fat_ratio) / 9;
  const carbsG = Math.max((calories - proteinG * 4 - fatG * 9) / 4, 60);

  return {
    bmr: pyRound(bmr),
    tdee: pyRound(tdee),
    calories: pyRound(calories),
    protein: pyRound(proteinG),
    carbs: pyRound(carbsG),
    fat: pyRound(fatG),
  };
}

/** 강도별 하루 목표. 단백질 고정, 탄수화물을 순환시키고 지방으로 열량을 맞춘다. */
export function macrosForIntensity(baseline, intensity) {
  const factor = INTENSITY_FACTOR[intensity] ?? INTENSITY_FACTOR.moderate;
  const calories = baseline.calories * factor.calories;
  const protein = baseline.protein;
  const carbs = baseline.carbs * factor.carbs;
  const fat = Math.max(
    (calories - protein * 4 - carbs * 4) / 9,
    baseline.fat * 0.6,
  );

  return {
    calories: pyRound(protein * 4 + carbs * 4 + fat * 9),
    protein: pyRound(protein),
    carbs: pyRound(carbs),
    fat: pyRound(fat),
  };
}

export function weeklyTotal(schedule) {
  const total = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const day of schedule) {
    for (const key of Object.keys(total)) total[key] += day.meal[key];
  }
  return total;
}

export function mealForDay(baseline, intensity) {
  return { ...MEAL_TEMPLATES[intensity], ...macrosForIntensity(baseline, intensity) };
}
