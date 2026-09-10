/** 요청 검증 스키마. 파이썬 Pydantic 모델과 같은 형태를 zod로 옮겼다. */

import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다.");

/** 빈 문자열은 "값 없음"으로 본다. 폼에서 지운 칸이 ""로 올 수 있다. */
const emptyToNull = (schema) =>
  z.preprocess((value) => (value === "" ? null : value), schema);

export const onboardingSchema = z.object({
  goal: z.string(),
  level: z.string(),
  frequency: z.string(),
  split: z.string().default("자동 추천"),
  duration: z.string(),
  style: z.string(),
  injuries: z.array(z.string()).default([]),
  redFlags: z.array(z.string()).default([]),
  equipment: z.array(z.string()).default([]),
  sex: z.string().default("남성"),
  age: z.number().int().min(10).max(100).default(30),
  height: z.number().gt(100).lt(250).default(172),
  weight: z.number().gt(25).lt(300).default(70),
  // 체성분 측정값. 없으면 키·체중만으로 판단한다.
  // 빈 칸("")은 "안 잰 값"으로 본다. 폼에서 지운 값이 그대로 올 수 있다.
  bodyFat: emptyToNull(z.number().gt(3).lt(70).nullable().optional()),
  muscleMass: emptyToNull(z.number().gt(10).lt(80).nullable().optional()),
  userId: z.number().int().nullable().optional(),
});

export const planSelectSchema = z.object({
  userId: z.number().int(),
  plan: z.record(z.any()),
  weekStart: isoDate.nullable().optional(),
});

export const swapExerciseSchema = z.object({
  userId: z.number().int(),
  planId: z.number().int(),
  day: z.string(),
  position: z.number().int().min(0),
  slug: z.string(),
});

export const rescheduleSchema = z.object({
  userId: z.number().int(),
  planId: z.number().int(),
  missedDay: z.string(),
  completedDays: z.array(z.string()).default([]),
});

export const diningSchema = z.object({
  userId: z.number().int(),
  planId: z.number().int(),
  event: z.object({
    day: z.string(),
    type: z.string().default("회식"),
    cuisine: z.string().default("한식(백반/찌개)"),
    alcohol: z.string().default("없음"),
  }),
});

export const setEntrySchema = z.object({
  exerciseId: z.number().int().nullable().optional(),
  slug: z.string().nullable().optional(),
  exerciseName: z.string(),
  sets: z.number().int().default(1),
  setNo: z.number().int().default(1),
  weightKg: z.number().default(0),
  reps: z.number().int().default(0),
  // 거리로 재는 유산소만 채운다.
  distanceKm: z.number().default(0),
});

export const workoutLogSchema = z.object({
  userId: z.number().int(),
  date: isoDate,
  planDayId: z.number().int().nullable().optional(),
  status: z.string().default("done"),
  durationMin: z.number().int().nullable().optional(),
  rpe: z.number().int().min(1).max(10).nullable().optional(),
  note: z.string().nullable().optional(),
  sets: z.array(setEntrySchema).default([]),
});

export const mealLogSchema = z.object({
  userId: z.number().int(),
  date: isoDate,
  mealType: z.string(),
  description: z.string().default(""),
  calories: z.number().int().default(0),
  protein: z.number().int().default(0),
  carbs: z.number().int().default(0),
  fat: z.number().int().default(0),
});

export const estimateSchema = z.object({ text: z.string() });

export const musicLinkSchema = z.object({
  userId: z.number().int(),
  label: z.string().trim().min(1).max(60),
  // 링크를 화면에서 그대로 여는 만큼 http(s)만 받는다.
  url: z
    .string()
    .trim()
    .max(500)
    .refine((value) => /^https?:\/\//i.test(value), "http 또는 https 주소만 넣을 수 있습니다."),
});

export const regenerateSchema = z.object({
  userId: z.number().int(),
  weekStart: isoDate.nullable().optional(),
  apply: z.boolean().default(true),
});

export const experimentEventSchema = z.object({
  userId: z.number().int(),
  experiment: z.string(),
  event: z.string(),
  value: z.number().default(1),
});

export const coachSchema = z.object({
  userId: z.number().int(),
  model: z.string().nullable().optional(),
  question: z.string().nullable().optional(),
  includeReport: z.boolean().default(true),
});

/** zod 결과를 FastAPI와 비슷한 422 형태로 바꾼다. */
export function parseBody(schema, body) {
  const result = schema.safeParse(body);
  if (result.success) return result.data;

  // FastAPI(Pydantic)의 422 detail 모양을 그대로 흉내낸다.
  const detail = result.error.issues.map((issue) => {
    const missing = issue.code === "invalid_type" && issue.received === "undefined";
    return {
      type: missing ? "missing" : issue.code,
      loc: ["body", ...issue.path],
      msg: missing ? "Field required" : issue.message,
      input: body,
    };
  });
  const error = new Error("요청 형식이 올바르지 않습니다.");
  error.status = 422;
  error.detail = detail;
  throw error;
}
