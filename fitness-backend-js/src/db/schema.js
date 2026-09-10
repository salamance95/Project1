/**
 * Drizzle 스키마. 파이썬 SQLAlchemy 모델(app/persistence/models.py)과 1:1로 맞춘다.
 *
 * 같은 SQLite 파일을 두 백엔드가 함께 읽으므로 컬럼 이름과 타입이 정확히 일치해야 한다.
 * SQLAlchemy가 만든 DATE는 'YYYY-MM-DD' 문자열, DATETIME은 ISO 문자열로 들어가 있어
 * 여기서도 text 모드로 다룬다.
 */

import { sql } from "drizzle-orm";
import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`CURRENT_TIMESTAMP`;

/* ----------------------------------------------------------- 마스터 데이터 */

export const bodyParts = sqliteTable("body_parts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

export const equipment = sqliteTable("equipment", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

export const exercises = sqliteTable("exercises", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  pattern: text("pattern").notNull(),
  muscle: text("muscle").notNull().default("전신"),
  equipmentId: integer("equipment_id"),
  load: integer("load").notNull().default(1),
  isHighImpact: integer("is_high_impact", { mode: "boolean" })
    .notNull()
    .default(false),
  altSlug: text("alt_slug"),
});

export const exerciseRisks = sqliteTable(
  "exercise_risks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    exerciseId: integer("exercise_id").notNull(),
    bodyPartId: integer("body_part_id").notNull(),
  },
  (table) => ({
    pair: uniqueIndex("uq_exercise_risk").on(table.exerciseId, table.bodyPartId),
  }),
);

/* ----------------------------------------------------------- 사용자와 설문 */

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  displayName: text("display_name"),
  // 소셜 로그인 계정. 게스트로 시작하면 비어 있고, 로그인할 때 채워진다.
  supabaseUserId: text("supabase_user_id"),
  email: text("email"),
  sex: text("sex").notNull(),
  age: integer("age").notNull(),
  heightCm: real("height_cm").notNull(),
  weightKg: real("weight_kg").notNull(),
  bodyFatPct: real("body_fat_pct"),
  muscleMassKg: real("muscle_mass_kg"),
  createdAt: text("created_at").notNull().default(now),
});

export const profiles = sqliteTable("profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  goal: text("goal").notNull(),
  level: text("level").notNull(),
  frequency: text("frequency").notNull(),
  split: text("split"),
  duration: text("duration").notNull(),
  style: text("style").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(now),
});

export const profileInjuries = sqliteTable(
  "profile_injuries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id").notNull(),
    bodyPartId: integer("body_part_id").notNull(),
  },
  (table) => ({
    pair: uniqueIndex("uq_profile_injury").on(table.profileId, table.bodyPartId),
  }),
);

export const profileEquipment = sqliteTable(
  "profile_equipment",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id").notNull(),
    equipmentId: integer("equipment_id").notNull(),
  },
  (table) => ({
    pair: uniqueIndex("uq_profile_equipment").on(
      table.profileId,
      table.equipmentId,
    ),
  }),
);

export const safetyFlags = sqliteTable("safety_flags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileId: integer("profile_id").notNull(),
  code: text("code").notNull(),
  severity: text("severity").notNull(),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull().default(now),
});

/* --------------------------------------------------------------------- 계획 */

export const plans = sqliteTable("plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  profileId: integer("profile_id").notNull(),
  variant: text("variant").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  weekStart: text("week_start").notNull(),
  baselineCalories: integer("baseline_calories").notNull(),
  baselineProtein: integer("baseline_protein").notNull(),
  baselineCarbs: integer("baseline_carbs").notNull(),
  baselineFat: integer("baseline_fat").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(now),
});

export const planDays = sqliteTable(
  "plan_days",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    planId: integer("plan_id").notNull(),
    dayIndex: integer("day_index").notNull(),
    isRest: integer("is_rest", { mode: "boolean" }).notNull().default(false),
    intensity: text("intensity").notNull(),
    focus: text("focus").notNull(),
    note: text("note"),
    status: text("status"),
  },
  (table) => ({
    pair: uniqueIndex("uq_plan_day").on(table.planId, table.dayIndex),
  }),
);

export const planDayExercises = sqliteTable("plan_day_exercises", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  planDayId: integer("plan_day_id").notNull(),
  exerciseId: integer("exercise_id"),
  displayName: text("display_name").notNull(),
  muscle: text("muscle").notNull().default(""),
  prescription: text("prescription").notNull().default(""),
  position: integer("position").notNull().default(0),
});

export const mealTargets = sqliteTable("meal_targets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  planDayId: integer("plan_day_id").notNull().unique(),
  targetText: text("target_text").notNull(),
  calories: integer("calories").notNull(),
  protein: integer("protein").notNull(),
  carbs: integer("carbs").notNull(),
  fat: integer("fat").notNull(),
  breakfast: text("breakfast").notNull().default(""),
  lunch: text("lunch").notNull().default(""),
  dinner: text("dinner").notNull().default(""),
  snack: text("snack").notNull().default(""),
  note: text("note"),
});

/* --------------------------------------------------------------------- 기록 */

export const workoutLogs = sqliteTable(
  "workout_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    planDayId: integer("plan_day_id"),
    logDate: text("log_date").notNull(),
    status: text("status").notNull(),
    durationMin: integer("duration_min"),
    rpe: integer("rpe"),
    note: text("note"),
    createdAt: text("created_at").notNull().default(now),
  },
  (table) => ({
    pair: uniqueIndex("uq_workout_log").on(table.userId, table.logDate),
  }),
);

export const setLogs = sqliteTable("set_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workoutLogId: integer("workout_log_id").notNull(),
  exerciseId: integer("exercise_id"),
  exerciseName: text("exercise_name").notNull(),
  setNo: integer("set_no").notNull().default(1),
  weightKg: real("weight_kg").notNull().default(0),
  reps: integer("reps").notNull().default(0),
  // 걷기·자전거처럼 거리로 재는 운동만 채운다.
  distanceKm: real("distance_km").notNull().default(0),
});

export const mealLogs = sqliteTable("meal_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  logDate: text("log_date").notNull(),
  mealType: text("meal_type").notNull(),
  description: text("description").notNull().default(""),
  calories: integer("calories").notNull().default(0),
  protein: integer("protein").notNull().default(0),
  carbs: integer("carbs").notNull().default(0),
  fat: integer("fat").notNull().default(0),
  createdAt: text("created_at").notNull().default(now),
});

export const diningEvents = sqliteTable("dining_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  planId: integer("plan_id"),
  dayIndex: integer("day_index").notNull(),
  eventType: text("event_type").notNull(),
  cuisine: text("cuisine").notNull(),
  alcohol: text("alcohol").notNull(),
  surplusKcal: integer("surplus_kcal").notNull().default(0),
  appliedKcal: integer("applied_kcal").notNull().default(0),
  createdAt: text("created_at").notNull().default(now),
});

export const adjustments = sqliteTable("adjustments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  planId: integer("plan_id").notNull(),
  kind: text("kind").notNull(),
  dayIndex: integer("day_index"),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull().default(now),
});

/* --------------------------------------------------------- 게이미피케이션 */

export const pointEvents = sqliteTable(
  "point_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    logDate: text("log_date").notNull(),
    kind: text("kind").notNull(),
    amount: integer("amount").notNull().default(0),
    reason: text("reason").notNull().default(""),
    createdAt: text("created_at").notNull().default(now),
  },
  (table) => ({
    triple: uniqueIndex("uq_point_event").on(
      table.userId,
      table.logDate,
      table.kind,
    ),
  }),
);

export const userBadges = sqliteTable(
  "user_badges",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    code: text("code").notNull(),
    earnedAt: text("earned_at").notNull().default(now),
  },
  (table) => ({
    pair: uniqueIndex("uq_user_badge").on(table.userId, table.code),
  }),
);

/* ------------------------------------------------------------- A/B 테스트 */

export const experimentAssignments = sqliteTable(
  "experiment_assignments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    experiment: text("experiment").notNull(),
    variant: text("variant").notNull(),
    assignedAt: text("assigned_at").notNull().default(now),
  },
  (table) => ({
    pair: uniqueIndex("uq_experiment_assignment").on(
      table.userId,
      table.experiment,
    ),
  }),
);

/** 사용자가 직접 저장한 플레이리스트 링크. 음원이 아니라 링크만 갖는다. */
export const musicLinks = sqliteTable("music_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  label: text("label").notNull(),
  url: text("url").notNull(),
  createdAt: text("created_at").notNull().default(now),
});

export const experimentEvents = sqliteTable("experiment_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  experiment: text("experiment").notNull(),
  variant: text("variant").notNull(),
  event: text("event").notNull(),
  value: real("value").notNull().default(1),
  createdAt: text("created_at").notNull().default(now),
});
