/**
 * 게이미피케이션: 포인트 원장과 뱃지.
 *
 * 포인트는 기록에서 매번 다시 계산한다. (사용자, 날짜, 종류)에 유일 제약이 있어
 * 몇 번을 재계산해도 중복 지급되지 않는다.
 */

import { and, eq, inArray } from "drizzle-orm";

import { db } from "../core/db.js";
import {
  mealLogs,
  pointEvents,
  setLogs,
  userBadges,
  workoutLogs,
} from "../db/schema.js";
import { isoOut, nowIso } from "../core/num.js";
import { LEVELS, POINTS } from "./data/gamification.data.js";

export { POINTS, LEVELS };

/** 뱃지 카탈로그. metric은 stats를 받아 [현재값, 목표값]을 돌려준다. */
export const BADGES = [
  {
    code: "first_step",
    name: "첫 걸음",
    icon: "🏁",
    description: "첫 운동 기록을 남겼습니다.",
    metric: (s) => [s.workoutDays, 1],
  },
  {
    code: "streak_3",
    name: "3일 연속",
    icon: "🔥",
    description: "3일 연속으로 기록했습니다.",
    metric: (s) => [s.bestStreak, 3],
  },
  {
    code: "streak_7",
    name: "일주일 완주",
    icon: "🔥",
    description: "7일 연속으로 기록했습니다.",
    metric: (s) => [s.bestStreak, 7],
  },
  {
    code: "volume_10k",
    name: "1만 kg",
    icon: "🏋️",
    description: "누적 볼륨 10,000kg을 들어올렸습니다.",
    metric: (s) => [s.totalVolume, 10000],
  },
  {
    code: "volume_50k",
    name: "5만 kg",
    icon: "🏔️",
    description: "누적 볼륨 50,000kg을 넘겼습니다.",
    metric: (s) => [s.totalVolume, 50000],
  },
  {
    code: "protein_5",
    name: "단백질 수호자",
    icon: "🥩",
    description: "단백질 목표를 90% 이상 채운 날이 5일입니다.",
    metric: (s) => [s.proteinDays, 5],
  },
  {
    code: "meal_30",
    name: "기록 습관",
    icon: "🍽️",
    description: "식단을 30끼 기록했습니다.",
    metric: (s) => [s.mealCount, 30],
  },
  {
    code: "comeback",
    name: "다시 시작",
    icon: "💪",
    description: "빠진 다음 날 바로 복귀했습니다.",
    metric: (s) => [s.comebacks, 1],
  },
  {
    code: "honest_logger",
    name: "정직한 기록자",
    icon: "📝",
    description: "체감 강도(RPE)를 5회 이상 남겼습니다.",
    metric: (s) => [s.rpeLogs, 5],
  },
];

function levelFor(points) {
  let title = LEVELS[0][1];
  let level = 1;
  let nextAt = LEVELS[1][0];

  LEVELS.forEach(([threshold, name], index) => {
    if (points >= threshold) {
      level = index + 1;
      title = name;
      nextAt = index + 1 < LEVELS.length ? LEVELS[index + 1][0] : null;
    }
  });

  return { level, title, nextAt };
}

function dayNumber(iso) {
  return Math.round(new Date(`${iso}T00:00:00Z`).getTime() / 86400000);
}

function shiftDate(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 연속 기록일: [현재 연속, 최고 연속] */
function streaks(dates) {
  if (dates.length === 0) return [0, 0];

  const ordered = [...dates].sort();
  let best = 1;
  let run = 1;

  for (let i = 1; i < ordered.length; i += 1) {
    if (dayNumber(ordered[i]) - dayNumber(ordered[i - 1]) === 1) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }

  // 마지막 구간이 현재 연속이다.
  return [run, best];
}

export function collectStats(userId, proteinTarget) {
  const workouts = db
    .select()
    .from(workoutLogs)
    .where(eq(workoutLogs.userId, userId))
    .orderBy(workoutLogs.logDate)
    .all();

  const meals = db.select().from(mealLogs).where(eq(mealLogs.userId, userId)).all();

  const workoutIds = workouts.map((log) => log.id);
  const sets = workoutIds.length
    ? db.select().from(setLogs).where(inArray(setLogs.workoutLogId, workoutIds)).all()
    : [];

  const totalVolume = sets.reduce((sum, e) => sum + e.weightKg * e.reps, 0);

  const proteinByDate = new Map();
  for (const meal of meals) {
    proteinByDate.set(
      meal.logDate,
      (proteinByDate.get(meal.logDate) ?? 0) + meal.protein,
    );
  }

  const proteinDays = [...proteinByDate.values()].filter(
    (value) => proteinTarget && value >= proteinTarget * 0.9,
  ).length;

  const logDates = new Set([
    ...workouts.filter((log) => log.status !== "missed").map((log) => log.logDate),
    ...proteinByDate.keys(),
  ]);
  const [currentStreak, bestStreak] = streaks([...logDates]);

  // 미수행 다음 날 완료 = 복귀
  const byDate = new Map(workouts.map((log) => [log.logDate, log.status]));
  let comebacks = 0;
  for (const [logDate, status] of byDate) {
    if (status === "missed" && byDate.get(shiftDate(logDate, 1)) === "done") comebacks += 1;
  }

  return {
    workouts,
    meals,
    workoutDays: workouts.filter((log) => ["done", "partial"].includes(log.status)).length,
    doneDays: workouts.filter((log) => log.status === "done").length,
    totalVolume: Math.round(totalVolume),
    mealCount: meals.length,
    proteinDays,
    proteinByDate,
    currentStreak,
    bestStreak,
    comebacks,
    rpeLogs: workouts.filter((log) => log.rpe).length,
  };
}

/** 기록에서 포인트 원장을 다시 만든다. 이미 있는 항목은 금액만 맞춘다. */
export function syncPoints(userId, stats, proteinTarget) {
  const existing = new Map(
    db
      .select()
      .from(pointEvents)
      .where(eq(pointEvents.userId, userId))
      .all()
      .map((row) => [`${row.logDate}|${row.kind}`, row]),
  );

  const wanted = new Map();

  for (const log of stats.workouts) {
    if (log.status === "done") {
      wanted.set(`${log.logDate}|workout`, [POINTS.workout_done, "운동 완료"]);
    } else if (log.status === "partial") {
      wanted.set(`${log.logDate}|workout`, [POINTS.workout_partial, "운동 부분 수행"]);
    }
  }

  const mealsByDate = new Map();
  for (const meal of stats.meals) {
    mealsByDate.set(meal.logDate, (mealsByDate.get(meal.logDate) ?? 0) + 1);
  }
  for (const [logDate, count] of mealsByDate) {
    const amount = Math.min(count * POINTS.meal_per_log, POINTS.meal_daily_cap);
    wanted.set(`${logDate}|meal`, [amount, `식단 ${count}끼 기록`]);
  }

  if (proteinTarget) {
    for (const [logDate, protein] of stats.proteinByDate) {
      if (protein >= proteinTarget * 0.9) {
        wanted.set(`${logDate}|protein`, [POINTS.protein_hit, "단백질 목표 달성"]);
      }
    }
  }

  for (const [key, [amount, reason]] of wanted) {
    const [logDate, kind] = key.split("|");
    const row = existing.get(key);

    if (!row) {
      db.insert(pointEvents).values({ userId, logDate, kind, amount, reason, createdAt: nowIso() }).run();
    } else if (row.amount !== amount) {
      db.update(pointEvents).set({ amount, reason }).where(eq(pointEvents.id, row.id)).run();
    }
  }

  // 기록이 사라진 항목은 원장에서도 지운다.
  for (const [key, row] of existing) {
    if (!wanted.has(key)) db.delete(pointEvents).where(eq(pointEvents.id, row.id)).run();
  }

  return [...wanted.values()].reduce((sum, [amount]) => sum + amount, 0);
}

export function syncBadges(userId, stats) {
  const owned = new Map(
    db
      .select()
      .from(userBadges)
      .where(eq(userBadges.userId, userId))
      .all()
      .map((row) => [row.code, row]),
  );

  const result = [];
  for (const badge of BADGES) {
    const [current, target] = badge.metric(stats);
    const earned = current >= target;

    if (earned && !owned.has(badge.code)) {
      const row = db
        .insert(userBadges)
        .values({ userId, code: badge.code, earnedAt: nowIso() })
        .returning()
        .get();
      owned.set(badge.code, row);
    }

    result.push({
      code: badge.code,
      name: badge.name,
      icon: badge.icon,
      description: badge.description,
      earned: owned.has(badge.code) || earned,
      progress: { current: Math.min(current, target), target },
      earnedAt: isoOut(owned.get(badge.code)?.earnedAt),
    });
  }

  return result;
}

export function buildSummary(userId, proteinTarget) {
  const stats = collectStats(userId, proteinTarget);
  const points = syncPoints(userId, stats, proteinTarget);
  const badges = syncBadges(userId, stats);

  const recent = db
    .select()
    .from(pointEvents)
    .where(eq(pointEvents.userId, userId))
    .all()
    .sort((a, b) => (a.logDate < b.logDate ? 1 : a.logDate > b.logDate ? -1 : b.id - a.id))
    .slice(0, 8);

  return {
    points,
    ...levelFor(points),
    currentStreak: stats.currentStreak,
    bestStreak: stats.bestStreak,
    totalVolume: stats.totalVolume,
    workoutDays: stats.workoutDays,
    mealCount: stats.mealCount,
    badges,
    earnedCount: badges.filter((badge) => badge.earned).length,
    recent: recent.map((row) => ({
      date: row.logDate,
      kind: row.kind,
      amount: row.amount,
      reason: row.reason,
    })),
  };
}

export { and };
