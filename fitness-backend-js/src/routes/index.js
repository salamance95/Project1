/** 29개 엔드포인트. 파이썬 app/main.py와 경로·응답 형태가 같다. */

import express from "express";
import multer from "multer";

import * as ai from "../ai/registry.js";
import { cache, invalidateUser, makeKey } from "../core/cache.js";
import { nowIso } from "../core/num.js";
import { db } from "../core/db.js";
import { applyEvent, reschedule } from "../domain/coaching.js";
import { defaultMinutes } from "../domain/energy.js";
import {
  EQUIPMENT,
  alternativesFor,
  normalizeEquipment,
  prescriptionForItem,
} from "../domain/exercises.js";
import * as exerciseGuide from "../domain/exerciseGuide.js";
import * as experiments from "../domain/experiments.js";
import * as foods from "../domain/foods.js";
import * as gamification from "../domain/gamification.js";
import { normalizeBodyReading } from "../domain/body.js";
import { INTENSITY_LABEL, dailyBaseline, weeklyTotal } from "../domain/nutrition.js";
import {
  DURATIONS,
  durationForSession,
  mixListsFor,
  playlistForIntensity,
  reasonFor,
  playlistVideosFor,
  themeById,
  withLinks,
} from "../domain/music.js";
import { DAYS, SPLIT_OPTIONS, buildPlan, buildPlans } from "../domain/planner.js";
import { analyze, variantById } from "../domain/progression.js";
import { buildWeeklyReport } from "../domain/reports.js";
import { RED_FLAGS, checkProfile, summarize } from "../domain/safety.js";
import { experimentAssignments, experimentEvents } from "../db/schema.js";
import * as crud from "../persistence/crud.js";
import { isAuthConfigured, verifyAccessToken } from "../core/supabaseAuth.js";
import {
  coachSchema,
  diningSchema,
  estimateSchema,
  experimentEventSchema,
  mealLogSchema,
  onboardingSchema,
  parseBody,
  musicLinkSchema,
  planSelectSchema,
  regenerateSchema,
  swapExerciseSchema,
  rescheduleSchema,
  workoutLogSchema,
} from "../schemas/index.js";
import {
  HttpError,
  burnedFor,
  dailySummary,
  planDayFor,
  planForReport,
  profileContext,
} from "./services.js";

/** 1곡 모드에서 보여줄 후보 곡 수. */
const SINGLE_TRACK_CHOICES = 8;

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
});

/** async 라우트에서 던진 오류를 express 오류 처리로 넘긴다. */
const wrap = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

export const router = express.Router();

/* ------------------------------------------------------------------ 기본 */

router.get("/health", (req, res) => res.json({ status: "ok" }));

router.get("/safety/questions", (req, res) => res.json({ redFlags: RED_FLAGS }));

router.get("/onboarding/options", (req, res) =>
  res.json({
    redFlags: RED_FLAGS,
    equipment: EQUIPMENT,
    equipmentNote: "맨몸 운동은 항상 포함됩니다.",
    splits: SPLIT_OPTIONS,
  }),
);

/* --------------------------------------------------- 1) 안전장치 + 설문 */

router.post(
  "/onboarding",
  wrap((req, res) => {
    const data = parseBody(onboardingSchema, req.body);
    const { findings, restrictions, blocked } = checkProfile(data);

    const user = crud.upsertUser(data, data.userId ?? null);
    const profile = crud.saveProfile(user, data, findings);
    const baseline = blocked ? null : dailyBaseline(data, restrictions);

    res.json({
      status: blocked ? "blocked" : "success",
      message: summarize(findings),
      userId: user.id,
      profileId: profile.id,
      data,
      baseline,
      safety: { findings, restrictions, blocked, summary: summarize(findings) },
    });
  }),
);

/* ------------------------------------------------------------ 2) 루틴 추천 */

router.post(
  "/recommend-routines",
  wrap((req, res) => {
    const profile = parseBody(onboardingSchema, req.body);
    const { findings, restrictions, blocked } = checkProfile(profile);

    if (blocked) {
      // 안전 관문에서 막히면 계획을 만들지 않는다.
      return res.json({
        plans: [],
        safety: { findings, restrictions, blocked: true, summary: summarize(findings) },
      });
    }

    // 같은 설문이면 결과가 같으므로 캐시한다.
    const { userId, ...cacheable } = profile;
    const key = makeKey("routines", cacheable);
    let plans = cache.get(key);
    const wasCached = plans !== null;

    if (!wasCached) {
      plans = buildPlans(profile, crud.loadLibrary(), restrictions);
      cache.set(key, plans, 3600);
    }

    // A/B: 어떤 플랜을 첫 카드로 둘 때 선택률이 높은가
    let variant = null;
    if (userId) {
      variant = recordExperiment(userId, "recommendation_order", "recommend_view", 1, true);
      if (variant === "sustainable_first") {
        plans = [...plans].sort(
          (a, b) => Number(a.id !== "sustainable") - Number(b.id !== "sustainable"),
        );
      }
    }

    return res.json({
      plans,
      cached: wasCached,
      experiment: variant ? { recommendation_order: variant } : {},
      safety: { findings, restrictions, blocked: false, summary: summarize(findings) },
    });
  }),
);

router.post(
  "/plans/select",
  wrap((req, res) => {
    const payload = parseBody(planSelectSchema, req.body);
    const profile = crud.activeProfile(payload.userId);
    if (!profile) throw new HttpError(404, "설문 정보를 찾을 수 없습니다.");

    const user = crud.getUser(profile.userId);
    const plan = crud.savePlan(user, profile, payload.plan, payload.weekStart ?? null);
    recordGoal(payload.userId, "plan_selected");

    res.json({
      plan: crud.planToDto(plan, profile, user),
      profile: crud.profilePayload(profile, user),
    });
  }),
);

router.get(
  "/plans/active",
  wrap((req, res) => {
    const userId = Number(req.query.user_id);
    const plan = crud.activePlan(userId);
    const profile = crud.activeProfile(userId);

    if (!plan || !profile) return res.json({ plan: null, profile: null });

    const user = crud.getUser(profile.userId);
    return res.json({
      plan: crud.planToDto(plan, profile, user),
      profile: crud.profilePayload(profile, user),
    });
  }),
);

/* -------------------------------------------------- 동작별 지난 기록 */

router.get(
  "/logs/exercise-history",
  wrap((req, res) =>
    res.json({ history: crud.exerciseHistory(Number(req.query.user_id)) }),
  ),
);

/* ------------------------------------------------------------- 소셜 로그인 */

router.get("/auth/config", (req, res) =>
  res.json({ configured: isAuthConfigured() }),
);

/**
 * 소셜 계정과 앱 사용자를 잇는다.
 *
 * 게스트로 쓰다가 로그인한 경우 그때까지의 기록을 잃지 않도록, 새 사용자를
 * 만들지 않고 쓰던 행에 계정을 붙인다(claimUserId). 이미 다른 계정에 묶인
 * 행이면 그 요청은 거절한다 — 남의 기록을 가져가는 길이 되면 안 된다.
 */
router.post(
  "/auth/supabase/link",
  wrap(async (req, res) => {
    const { accessToken, claimUserId } = req.body ?? {};
    const result = await verifyAccessToken(accessToken);

    if (!result.ok) {
      throw new HttpError(result.configured ? 401 : 503, result.reason);
    }

    const { account } = result;
    const linked = crud.userBySupabaseId(account.supabaseUserId);

    if (linked) {
      // 이미 이 계정으로 쓰던 사람. 게스트 기록이 따로 있어도 합치지 않는다 —
      // 어느 쪽 기록이 진짜인지 서버가 판단할 근거가 없다.
      return res.json({
        userId: linked.id,
        claimed: false,
        email: account.email,
        displayName: linked.displayName ?? account.displayName,
      });
    }

    const claimId = Number(claimUserId);
    const claimable = Number.isInteger(claimId) && claimId > 0 ? crud.getUser(claimId) : null;

    if (!claimable) {
      // 설문을 아직 안 한 새 계정. 설문을 마치면 그때 이 계정으로 묶인다.
      return res.json({
        userId: null,
        claimed: false,
        email: account.email,
        displayName: account.displayName,
      });
    }

    if (claimable.supabaseUserId) {
      throw new HttpError(409, "이 기록은 이미 다른 계정에 연결되어 있습니다.");
    }

    const user = crud.linkUserToSupabase(claimable.id, account);
    invalidateUser(user.id);

    return res.json({
      userId: user.id,
      claimed: true,
      email: account.email,
      displayName: user.displayName ?? account.displayName,
    });
  }),
);

router.get(
  "/plans",
  wrap((req, res) => res.json({ plans: crud.listPlans(Number(req.query.user_id)) })),
);

router.post(
  "/plans/:planId/activate",
  wrap((req, res) => {
    const userId = Number(req.query.user_id);
    const planId = Number(req.params.planId);

    const profile = crud.activeProfile(userId);
    const plan = crud.loadPlan(planId);
    if (!plan || !profile || plan.userId !== userId) {
      throw new HttpError(404, "계획을 찾을 수 없습니다.");
    }

    crud.setActivePlan(userId, planId);
    invalidateUser(userId);

    const user = crud.getUser(profile.userId);
    res.json({ plan: crud.planToDto(plan, profile, user) });
  }),
);

/* ------------------------------------------- 4) 일정 재조정 / 5) 치트데이 */

router.post(
  "/reschedule",
  wrap((req, res) => {
    const payload = parseBody(rescheduleSchema, req.body);
    const { user, profile, payload: profileData, restrictions } = profileContext(payload.userId);

    const plan = crud.loadPlan(payload.planId);
    if (!plan || plan.userId !== user.id) throw new HttpError(404, "계획을 찾을 수 없습니다.");

    const current = crud.planToDto(plan, profile, user);
    const baseline = dailyBaseline(profileData, restrictions);

    const [schedule, message] = reschedule(
      current.schedule,
      baseline,
      payload.missedDay,
      payload.completedDays,
    );

    crud.replaceSchedule(plan, schedule);
    crud.logAdjustment(plan, "missed", DAYS.indexOf(payload.missedDay), message);
    invalidateUser(payload.userId);

    res.json({ schedule, message, weeklyNutrition: weeklyTotal(schedule) });
  }),
);

router.post(
  "/dining-out",
  wrap((req, res) => {
    const payload = parseBody(diningSchema, req.body);
    const { user, profile, payload: profileData, restrictions } = profileContext(payload.userId);

    const plan = crud.loadPlan(payload.planId);
    if (!plan || plan.userId !== user.id) throw new HttpError(404, "계획을 찾을 수 없습니다.");

    const current = crud.planToDto(plan, profile, user);
    const baseline = dailyBaseline(profileData, restrictions);
    const event = payload.event;

    const [schedule, rebalance, tactics] = applyEvent(current.schedule, baseline, event);

    crud.replaceSchedule(plan, schedule);
    crud.logDiningEvent(user.id, plan.id, event, rebalance);
    crud.logAdjustment(
      plan,
      "event",
      DAYS.indexOf(event.day),
      `${event.day}요일 ${event.type}(${event.cuisine}) 반영, ` +
        `초과 ${rebalance.surplus}kcal 중 ${rebalance.applied ?? 0}kcal 보정`,
    );
    invalidateUser(payload.userId);

    res.json({ schedule, rebalance, tactics, weeklyNutrition: weeklyTotal(schedule) });
  }),
);

/* -------------------------------------------------- 3) 운동 / 식단 로깅 */

router.post(
  "/logs/workout",
  wrap((req, res) => {
    const payload = parseBody(workoutLogSchema, req.body);
    const log = crud.upsertWorkoutLog(payload.userId, payload);

    invalidateUser(payload.userId);
    if (["done", "partial"].includes(payload.status)) {
      recordGoal(payload.userId, "workout_logged");
    }

    res.json({
      id: log.id,
      date: log.logDate,
      status: log.status,
      setCount: log.sets.length,
      volume: Math.round(log.sets.reduce((sum, e) => sum + e.weightKg * e.reps, 0)),
      energy: burnedFor(payload.userId, log),
    });
  }),
);

router.post(
  "/logs/meal",
  wrap((req, res) => {
    let payload = parseBody(mealLogSchema, req.body);

    // 열량을 주지 않으면 먹은 음식 텍스트에서 추정해 채운다.
    let estimation = null;
    if (payload.calories === 0 && payload.protein === 0 && payload.description) {
      estimation = foods.estimate(payload.description);
      payload = { ...payload, ...estimation.total };
    }

    const log = crud.addMealLog(payload.userId, payload);
    invalidateUser(payload.userId);

    res.json({
      id: log.id,
      date: log.logDate,
      mealType: log.mealType,
      calories: log.calories,
      protein: log.protein,
      carbs: log.carbs,
      fat: log.fat,
      estimation,
    });
  }),
);

router.delete(
  "/logs/meal/:logId",
  wrap((req, res) => {
    const userId = Number(req.query.user_id);
    if (!crud.deleteMealLog(userId, Number(req.params.logId))) {
      throw new HttpError(404, "기록을 찾을 수 없습니다.");
    }
    invalidateUser(userId);
    res.json({ status: "deleted" });
  }),
);

router.get(
  "/logs",
  wrap((req, res) => {
    const userId = Number(req.query.user_id);
    const weekStart = req.query.week_start ?? null;
    const start = req.query.start ?? null;
    const end = req.query.end ?? null;

    // 기본은 주 단위. start/end를 주면 그 기간 전체를 돌려준다(달력용).
    const rangeStart = start && end ? start : (weekStart ?? crud.weekStartOf());
    const rangeEnd = start && end ? end : crud.addDays(rangeStart, 6);

    const workouts = crud.workoutLogsBetween(userId, rangeStart, rangeEnd);
    const meals = crud.mealLogsBetween(userId, rangeStart, rangeEnd);

    res.json({
      weekStart: weekStart ?? rangeStart,
      start: rangeStart,
      end: rangeEnd,
      daily: dailySummary(userId, rangeStart, rangeEnd, workouts, meals),
      workouts: workouts.map((log) => ({
        id: log.id,
        date: log.logDate,
        status: log.status,
        durationMin: log.durationMin,
        rpe: log.rpe,
        note: log.note,
        energy: burnedFor(userId, log),
        exercises: crud.collapseSets(log.sets),
        sets: log.sets.map((entry) => ({
          exerciseName: entry.exerciseName,
          setNo: entry.setNo,
          weightKg: entry.weightKg,
          reps: entry.reps,
        })),
      })),
      meals: meals.map((log) => ({
        id: log.id,
        date: log.logDate,
        mealType: log.mealType,
        description: log.description,
        calories: log.calories,
        protein: log.protein,
        carbs: log.carbs,
        fat: log.fat,
      })),
    });
  }),
);

/* --------------------------------------------------------------- 영양 */

router.post(
  "/nutrition/estimate",
  wrap((req, res) => res.json(foods.estimate(parseBody(estimateSchema, req.body).text))),
);

router.post(
  "/nutrition/photo",
  upload.single("photo"),
  wrap(async (req, res) => {
    const file = req.file;
    if (!file) throw new HttpError(400, "사진이 필요합니다.");
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      throw new HttpError(400, "JPG, PNG, WebP 이미지만 올릴 수 있습니다.");
    }
    if (file.size === 0) throw new HttpError(400, "빈 파일입니다.");

    const result = await ai.analyzeMealPhoto(file.buffer, file.mimetype);
    // 아는 음식은 음식 DB 값으로, 모르는 음식만 모델이 어림한 값으로 채운다.
    const estimate = result.foods?.length
      ? foods.estimateFromPhoto(result.foods)
      : result.text
        ? foods.estimate(result.text)
        : null;

    res.json({
      available: result.available,
      model: result.model,
      reason: result.reason,
      text: result.text,
      confidence: result.confidence ?? null,
      note: result.note ?? "",
      estimate,
    });
  }),
);

router.get("/nutrition/foods", (req, res) => res.json({ foods: foods.knownFoods() }));

/* ------------------------------------------------------- 체성분 결과지 사진 */

router.post(
  "/body/photo",
  upload.single("photo"),
  wrap(async (req, res) => {
    const file = req.file;
    if (!file) throw new HttpError(400, "사진이 필요합니다.");
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      throw new HttpError(400, "JPG, PNG, WebP 이미지만 올릴 수 있습니다.");
    }
    if (file.size === 0) throw new HttpError(400, "빈 파일입니다.");

    const result = await ai.analyzeBodyPhoto(file.buffer, file.mimetype);
    // 모델이 읽은 숫자는 규칙으로 한 번 걸러서 내보낸다.
    const reading = result.available ? normalizeBodyReading(result.reading) : null;

    res.json({
      available: result.available,
      model: result.model,
      reason: result.reason,
      reading,
      confidence: result.reading?.confidence ?? null,
      note: result.reading?.note ?? "",
      measuredAt: result.reading?.measuredAt ?? null,
    });
  }),
);

/* ---------------------------------------------------------- 운동 가이드 */

router.get(
  "/exercises",
  wrap(async (req, res) => {
    const query = (req.query.q ?? "").trim();
    const library = crud.loadLibrary();
    const catalog = library.items;

    const shape = (item, reason = "") => ({
      slug: item.slug,
      name: item.name,
      muscle: item.muscle,
      equipment: item.equipment,
      pattern: item.pattern,
      risk: item.risk,
      reason,
    });

    if (!query) {
      const sorted = [...catalog].sort(
        (a, b) => a.muscle.localeCompare(b.muscle) || a.name.localeCompare(b.name),
      );
      return res.json({
        exercises: sorted.map((item) => shape(item)),
        total: sorted.length,
        search: null,
      });
    }

    const found = await ai.searchExercises(query, catalog, req.query.model ?? null);
    const bySlug = new Map(catalog.map((item) => [item.slug, item]));

    const results = found.matches
      .filter((match) => bySlug.has(match.slug))
      .map((match) => shape(bySlug.get(match.slug), match.reason ?? ""));

    return res.json({
      exercises: results,
      total: results.length,
      search: {
        summary: found.summary,
        model: found.model,
        fallbackFrom: found.fallbackFrom,
        fallbackReason: found.fallbackReason,
      },
    });
  }),
);

router.get(
  "/exercises/:slug",
  wrap((req, res) => {
    const library = crud.loadLibrary();
    const item = library.bySlug.get(req.params.slug);
    if (!item) throw new HttpError(404, "운동을 찾을 수 없습니다.");

    const alt = item.alt ? library.bySlug.get(item.alt) : null;

    res.json({
      exercise: {
        slug: item.slug,
        name: item.name,
        muscle: item.muscle,
        equipment: item.equipment,
        pattern: item.pattern,
        risk: item.risk,
        isHighImpact: item.impact,
        alternative: alt ? { slug: alt.slug, name: alt.name } : null,
      },
      guide: exerciseGuide.guideFor(item.slug, item.name),
    });
  }),
);

router.get(
  "/exercises/:slug/alternatives",
  wrap((req, res) => {
    const library = crud.loadLibrary();
    const item = library.bySlug.get(req.params.slug);
    if (!item) throw new HttpError(404, "운동을 찾을 수 없습니다.");

    // 설문이 있으면 그 사람의 부상·보유 기구를 반영하고, 없으면 맨몸 기준으로 본다.
    const userId = Number(req.query.user_id);
    let profile = { injuries: [], equipment: [] };
    let restrictions = {};
    if (userId) {
      const context = profileContext(userId);
      profile = context.payload;
      restrictions = context.restrictions;
    }

    res.json({
      origin: {
        slug: item.slug,
        name: item.name,
        muscle: item.muscle,
        equipment: item.equipment,
        pattern: item.pattern,
        owned: [...normalizeEquipment(profile.equipment)].includes(item.equipment),
      },
      alternatives: alternativesFor(req.params.slug, profile, library, restrictions),
    });
  }),
);

/* --------------------------------------------------- 계획 속 동작 교체 */

router.post(
  "/plans/swap-exercise",
  wrap((req, res) => {
    const payload = parseBody(swapExerciseSchema, req.body);
    const { user, profile, payload: profileData, restrictions } = profileContext(payload.userId);

    const plan = crud.loadPlan(payload.planId);
    if (!plan || plan.userId !== user.id) throw new HttpError(404, "계획을 찾을 수 없습니다.");

    const library = crud.loadLibrary();
    const item = library.bySlug.get(payload.slug);
    if (!item) throw new HttpError(404, "바꿀 운동을 찾을 수 없습니다.");

    const dayIndex = DAYS.indexOf(payload.day);
    if (dayIndex < 0) throw new HttpError(422, "요일이 올바르지 않습니다.");

    const prescription = prescriptionForItem(item, profileData, restrictions);
    const result = crud.swapPlanExercise(plan.id, dayIndex, payload.position, item, prescription);
    if (!result) throw new HttpError(404, "바꿀 자리를 찾을 수 없습니다.");

    const message = `${payload.day}요일 ${result.previousName} → ${item.name}(${item.equipment})`;
    crud.logAdjustment(plan, "swap", dayIndex, message);
    invalidateUser(payload.userId);

    const updated = crud.planToDto(crud.loadPlan(plan.id), profile, user);
    res.json({ schedule: updated.schedule, message });
  }),
);

/* ------------------------------------------------------- 음악 플레이리스트 */

router.get(
  "/music",
  wrap((req, res) => {
    const userId = Number(req.query.user_id);
    const date = req.query.date ?? null;

    // 그날 계획된 세션의 강도에 맞춰 하나를 앞세운다.
    let day = null;
    if (userId && date) {
      const found = planDayFor(userId, date);
      if (found.day) {
        day = {
          day: DAYS[found.day.dayIndex],
          focus: found.day.focus,
          isRestDay: Boolean(found.day.isRest),
          intensity: found.day.intensity,
          intensityLabel: INTENSITY_LABEL[found.day.intensity] ?? found.day.intensity,
        };
      }
    }

    // 설문의 하루 운동 시간에 맞춰 길이를 기본값으로 잡아 둔다.
    const profile = userId ? crud.activeProfile(userId) : null;
    const duration = durationForSession(profile ? profile.duration : null);

    res.json({
      today: {
        date,
        session: day,
        reason: reasonFor(day),
        playlist: playlistForIntensity(day ? day.intensity : "moderate"),
        duration,
      },
      durations: DURATIONS,
      // 장르 x 길이 조합. 1시간을 고르면 1시간짜리들이 나온다.
      mixLists: mixListsFor(playlistForIntensity(day ? day.intensity : "moderate").id),
      // 사용자가 직접 저장해 둔 링크
      myLinks: userId ? crud.musicLinksOf(userId) : [],
      note: "음원을 재생하지 않고 유튜브·스포티파이 검색으로 연결합니다. BPM은 대략치입니다.",
    });
  }),
);

router.get(
  "/music/tracks",
  wrap(async (req, res) => {
    const theme = themeById(req.query.theme ?? "");
    const duration = DURATIONS.find((item) => item.id === req.query.duration);
    if (!theme || !duration) throw new HttpError(422, "장르와 길이를 확인해 주세요.");

    const head = {
      theme: { id: theme.id, label: theme.label, note: theme.note },
      duration,
    };

    // 30분·1시간·2시간은 그 길이짜리 플레이리스트 영상들을 나열한다.
    // 곡을 하나씩 트는 게 아니라 통째로 틀어 둘 영상이 필요해서다.
    if (duration.id !== "1song") {
      return res.json({
        ...head,
        mode: "playlists",
        items: playlistVideosFor(theme, duration),
        source: "search",
      });
    }

    // 1곡은 후보 곡을 여러 개 뽑아 그중 하나를 고르게 한다.
    const count = SINGLE_TRACK_CHOICES;
    const key = makeKey("music-tracks", { theme: theme.id, duration: duration.id });

    // 같은 장르면 결과가 같아도 되므로 캐시한다. 모델 호출이 비싸다.
    let payload = cache.get(key);
    if (payload === null) {
      const result = await ai.buildPlaylist({
        genre: theme.label,
        bpm: theme.bpm ?? "",
        minutes: duration.minutes * count,
        count,
      });

      // 모델이 없거나 실패하면 내장 대표 곡으로 내려간다.
      const picked = result.available && result.tracks.length > 0 ? result.tracks : theme.tracks;

      payload = {
        ...head,
        mode: "tracks",
        items: withLinks(picked.slice(0, count)),
        source: result.available && result.tracks.length > 0 ? "ai" : "basic",
        model: result.model,
        reason: result.reason,
      };
      // 성공한 목록만 오래 남긴다. 모델이 잠깐 죽어서 내려간 결과를
      // 6시간 동안 물고 있으면 복구돼도 계속 기본 목록만 보인다.
      cache.set(key, payload, payload.source === "ai" ? 21600 : 60);
    }

    return res.json(payload);
  }),
);

router.post(
  "/music/links",
  wrap((req, res) => {
    const payload = parseBody(musicLinkSchema, req.body);
    crud.addMusicLink(payload.userId, payload.label, payload.url);
    res.json({ links: crud.musicLinksOf(payload.userId) });
  }),
);

router.delete(
  "/music/links/:id",
  wrap((req, res) => {
    const userId = Number(req.query.user_id);
    const linkId = Number(req.params.id);
    if (!userId) throw new HttpError(422, "user_id가 필요합니다.");

    const removed = crud.deleteMusicLink(userId, linkId);
    if (!removed) throw new HttpError(404, "링크를 찾을 수 없습니다.");

    res.json({ links: crud.musicLinksOf(userId) });
  }),
);

/* ------------------------------------------------------------ 주간 리포트 */

router.get(
  "/reports/weekly",
  wrap((req, res) => {
    const userId = Number(req.query.user_id);
    const plan = crud.activePlan(userId);
    if (!plan) throw new HttpError(404, "활성 계획이 없습니다.");

    const start = req.query.week_start ?? plan.weekStart;

    // A/B: 경고를 먼저 보여줄 것인가, 잘한 점을 먼저 보여줄 것인가
    const tone = recordExperiment(userId, "insight_tone", "report_view", 1, true);

    // 변형마다 결과가 다르므로 캐시 키에 변형을 넣는다.
    const key = `report:${userId}:${start}:${tone}`;
    let report = cache.get(key);

    if (report === null) {
      const workouts = crud.weekWorkoutLogs(userId, start);
      const meals = crud.weekMealLogs(userId, start);
      // 볼륨은 한 주 숫자만으로는 의미가 없어 지난주와 비교한다.
      const prev = crud.weekWorkoutLogs(userId, crud.addDays(start, -7));
      report = buildWeeklyReport(planForReport(plan), workouts, meals, start, tone, prev);
      cache.set(key, report, 600);
    }

    res.json({ report, experiment: { insight_tone: tone } });
  }),
);

/* ------------------------------------------------------- 자동 루틴 재생성 */

router.post(
  "/plans/regenerate",
  wrap((req, res) => {
    const payload = parseBody(regenerateSchema, req.body);
    const { user, profile, payload: profileData, restrictions } = profileContext(payload.userId);

    const plan = crud.activePlan(payload.userId);
    if (!plan) throw new HttpError(404, "활성 계획이 없습니다.");

    const start = payload.weekStart ?? plan.weekStart;
    const workouts = crud.weekWorkoutLogs(payload.userId, start);
    const meals = crud.weekMealLogs(payload.userId, start);
    const report = buildWeeklyReport(planForReport(plan), workouts, meals, start);

    const adjustment = analyze(report, profileData, plan.variant);
    const variant = variantById(adjustment.variantId);

    const nextPlan = buildPlan(profileData, variant, crud.loadLibrary(), restrictions, {
      frequency: adjustment.frequency,
      trainingDays: adjustment.trainingDays,
      countOffset: adjustment.countOffset,
    });

    if (!payload.apply) {
      return res.json({ adjustment, preview: nextPlan, applied: false });
    }

    const saved = crud.savePlan(user, profile, nextPlan, crud.addDays(start, 7));
    invalidateUser(payload.userId);

    return res.json({
      adjustment,
      plan: crud.planToDto(saved, profile, user),
      applied: true,
    });
  }),
);

/* ----------------------------------------------------- 게이미피케이션 */

router.get(
  "/gamification",
  wrap((req, res) => {
    const userId = Number(req.query.user_id);
    const key = `game:${userId}`;
    const cached = cache.get(key);
    if (cached !== null) return res.json({ summary: cached, cached: true });

    const plan = crud.activePlan(userId);
    const summary = gamification.buildSummary(userId, plan ? plan.baselineProtein : 0);
    cache.set(key, summary, 300);

    return res.json({ summary, cached: false });
  }),
);

router.get("/cache/stats", (req, res) => res.json(cache.stats()));

/* ------------------------------------------------------------ A/B 테스트 */

/** 이벤트를 남긴다. once=true면 사용자당 한 번만 기록한다(노출용). */
function recordExperiment(userId, experiment, event, value = 1, once = false) {
  if (!(experiment in experiments.EXPERIMENTS)) return null;
  const variant = assignExperiment(userId, experiment);

  if (once) {
    const existing = db
      .select()
      .from(experimentEvents)
      .all()
      .find(
        (row) =>
          row.userId === userId && row.experiment === experiment && row.event === event,
      );
    if (existing) return variant;
  }

  db.insert(experimentEvents)
    .values({ userId, experiment, variant, event, value, createdAt: nowIso() })
    .run();
  return variant;
}

/** 배정을 조회하거나 새로 만든다. */
function assignExperiment(userId, experiment) {
  if (!(experiment in experiments.EXPERIMENTS)) return null;

  const row = db
    .select()
    .from(experimentAssignments)
    .all()
    .find((item) => item.userId === userId && item.experiment === experiment);
  if (row) return row.variant;

  const variant = experiments.pickVariant(userId, experiment);
  db.insert(experimentAssignments)
    .values({ userId, experiment, variant, assignedAt: nowIso() })
    .run();
  return variant;
}

/** 이 이벤트를 목표로 삼는 모든 실험에 전환을 기록한다. */
function recordGoal(userId, event) {
  for (const [key, spec] of Object.entries(experiments.EXPERIMENTS)) {
    if (spec.goal !== event) continue;

    // 노출된 적이 없으면 전환으로 세지 않는다.
    const exposed = db
      .select()
      .from(experimentEvents)
      .all()
      .some(
        (row) =>
          row.userId === userId && row.experiment === key && row.event === spec.exposure,
      );
    if (!exposed) continue;

    recordExperiment(userId, key, event, 1, true);
  }
}

router.get(
  "/experiments",
  wrap((req, res) => {
    const userId = Number(req.query.user_id);
    const multi = ai.multiModelAvailable();
    const active = experiments.activeExperiments(multi);

    const assignments = {};
    for (const key of Object.keys(active)) assignments[key] = assignExperiment(userId, key);

    const catalog = {};
    for (const [key, spec] of Object.entries(active)) {
      catalog[key] = {
        description: spec.description,
        variants: Object.keys(spec.variants),
        goal: spec.goalLabel,
      };
    }

    res.json({ assignments, catalog });
  }),
);

router.post(
  "/experiments/event",
  wrap((req, res) => {
    const payload = parseBody(experimentEventSchema, req.body);
    const variant = recordExperiment(
      payload.userId,
      payload.experiment,
      payload.event,
      payload.value,
    );
    if (!variant) throw new HttpError(404, "없는 실험입니다.");

    res.json({ experiment: payload.experiment, variant, event: payload.event });
  }),
);

router.get(
  "/experiments/results",
  wrap((req, res) => {
    const assignments = db.select().from(experimentAssignments).all();
    const events = db.select().from(experimentEvents).all();
    res.json({
      results: experiments.summarize(assignments, events, ai.multiModelAvailable()),
    });
  }),
);

/* --------------------------------------------------------- 멀티 AI 모델 */

router.get("/ai/models", (req, res) =>
  res.json({
    models: ai.listModels(),
    default: ai.defaultKey(),
    multiModel: ai.multiModelAvailable(),
  }),
);

router.post(
  "/ai/coach",
  wrap(async (req, res) => {
    const payload = parseBody(coachSchema, req.body);
    const { user, profile, payload: profileData } = profileContext(payload.userId);

    const plan = crud.activePlan(payload.userId);
    const planDto = plan ? crud.planToDto(plan, profile, user) : null;

    let report = null;
    if (payload.includeReport && plan) {
      const workouts = crud.weekWorkoutLogs(payload.userId, plan.weekStart);
      const meals = crud.weekMealLogs(payload.userId, plan.weekStart);
      report = buildWeeklyReport(planForReport(plan), workouts, meals, plan.weekStart);
    }

    // 모델을 지정하지 않았고 비교할 모델이 둘 이상이면 실험이 고른다.
    let modelKey = payload.model ?? null;
    let variant = null;
    if (!modelKey && ai.multiModelAvailable()) {
      variant = recordExperiment(payload.userId, "coach_model", "coach_view", 1, true);
      modelKey = variant;
    }

    const { userId, ...profileForAi } = profileData;
    const result = await ai.generate(
      { profile: profileForAi, plan: planDto, report, question: payload.question ?? null },
      modelKey,
    );

    res.json({
      coaching: {
        lines: result.lines,
        model: result.model,
        provider: result.provider,
        fallbackFrom: result.fallbackFrom,
        fallbackReason: result.fallbackReason,
      },
      experiment: variant ? { coach_model: variant } : {},
    });
  }),
);

export { defaultMinutes };
