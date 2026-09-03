# main.py
import re
from contextlib import asynccontextmanager
from datetime import date, timedelta

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

import crud
import experiments
import gamification
import safety
from ai import registry as ai_registry
from ai.base import CoachContext
from cache import cache, invalidate_user, make_key
from coaching import apply_event, reschedule
from db import SessionLocal, get_db
import exercise_guide
import foods
from energy import burned_kcal, default_minutes, extra_burn, parse_prescription
from exercises import EQUIPMENT
from models import Exercise
from nutrition import daily_baseline, weekly_total
from planner import DAYS, build_plan, build_plans
from progression import analyze, variant_by_id
from reports import build_weekly_report
from schemas import (
    CoachRequest,
    DiningRequest,
    EstimateRequest,
    ExperimentEventRequest,
    MealLogRequest,
    RegenerateRequest,
    OnboardingRequest,
    PlanSelectRequest,
    RescheduleRequest,
    WorkoutLogRequest,
)
from seed import init_db, seed_master


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    session = SessionLocal()
    try:
        seed_master(session)
    finally:
        session.close()
    yield


app = FastAPI(title="AI Fitness & Diet Planner", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _profile_context(db: Session, user_id: int):
    """user_id → (User, Profile, 규칙 엔진용 payload, restrictions)."""
    profile = crud.active_profile(db, user_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="설문 정보를 찾을 수 없습니다.")

    user = profile.user
    payload = OnboardingRequest(**crud.profile_payload(db, profile, user))
    _, restrictions, _ = safety.check_profile(payload)
    return user, profile, payload, restrictions


# ------------------------------------------------------------------ 기본

@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/safety/questions")
async def safety_questions():
    """온보딩 건강 문진 항목."""
    return {"redFlags": safety.RED_FLAGS}


@app.get("/api/onboarding/options")
async def onboarding_options():
    """설문 선택지(건강 문진, 가용 기구)를 한 번에 내려준다."""
    return {
        "redFlags": safety.RED_FLAGS,
        "equipment": EQUIPMENT,
        "equipmentNote": "맨몸 운동은 항상 포함됩니다.",
    }


# --------------------------------------------------------- 1) 안전장치 + 설문

@app.post("/api/onboarding")
async def process_onboarding(data: OnboardingRequest, db: Session = Depends(get_db)):
    """설문 저장 전에 안전 점검을 먼저 돌린다."""
    findings, restrictions, blocked = safety.check_profile(data)

    user = crud.upsert_user(db, data, data.userId)
    profile = crud.save_profile(db, user, data, findings)

    baseline = None if blocked else daily_baseline(data, restrictions)

    return {
        "status": "blocked" if blocked else "success",
        "message": safety.summarize(findings),
        "userId": user.id,
        "profileId": profile.id,
        "data": data.model_dump(),
        "baseline": baseline,
        "safety": {
            "findings": findings,
            "restrictions": restrictions,
            "blocked": blocked,
            "summary": safety.summarize(findings),
        },
    }


# ------------------------------------------------------------ 2) 루틴 추천

@app.post("/api/recommend-routines")
async def recommend_routines(profile: OnboardingRequest, db: Session = Depends(get_db)):
    findings, restrictions, blocked = safety.check_profile(profile)

    if blocked:
        # 안전 관문에서 막히면 계획을 만들지 않는다.
        return {
            "plans": [],
            "safety": {
                "findings": findings,
                "restrictions": restrictions,
                "blocked": True,
                "summary": safety.summarize(findings),
            },
        }

    # 같은 설문이면 결과가 같으므로 캐시한다.
    key = make_key("routines", profile.model_dump(exclude={"userId"}))
    plans = cache.get(key)
    was_cached = plans is not None

    if not was_cached:
        library = crud.load_library(db)
        plans = build_plans(profile, library, restrictions)
        cache.set(key, plans, ttl=3600)

    # A/B: 어떤 플랜을 첫 카드로 둘 때 선택률이 높은가
    variant = None
    if profile.userId:
        variant = experiments.record(
            db, profile.userId, "recommendation_order", "recommend_view", once=True
        )
        if variant == "sustainable_first":
            plans = sorted(plans, key=lambda item: item["id"] != "sustainable")

    return {
        "plans": plans,
        "cached": was_cached,
        "experiment": {"recommendation_order": variant} if variant else {},
        "safety": {
            "findings": findings,
            "restrictions": restrictions,
            "blocked": False,
            "summary": safety.summarize(findings),
        },
    }


@app.post("/api/plans/select")
async def select_plan(payload: PlanSelectRequest, db: Session = Depends(get_db)):
    """선택한 플랜을 DB에 저장하고 활성 플랜으로 만든다."""
    profile = crud.active_profile(db, payload.userId)
    if profile is None:
        raise HTTPException(status_code=404, detail="설문 정보를 찾을 수 없습니다.")

    plan = crud.save_plan(db, profile.user, profile, payload.plan, payload.weekStart)
    experiments.record_goal(db, payload.userId, "plan_selected")

    return {
        "plan": crud.plan_to_dict(db, plan, profile, profile.user),
        "profile": crud.profile_payload(db, profile, profile.user),
    }


@app.get("/api/plans/active")
async def get_active_plan(user_id: int, db: Session = Depends(get_db)):
    plan = crud.active_plan(db, user_id)
    profile = crud.active_profile(db, user_id)
    if plan is None or profile is None:
        return {"plan": None, "profile": None}

    return {
        "plan": crud.plan_to_dict(db, plan, profile, profile.user),
        "profile": crud.profile_payload(db, profile, profile.user),
    }


@app.get("/api/plans")
async def list_plans(user_id: int, db: Session = Depends(get_db)):
    """주차 이동용 목록. 최신 주가 먼저 온다."""
    return {"plans": crud.list_plans(db, user_id)}


@app.post("/api/plans/{plan_id}/activate")
async def activate_plan(plan_id: int, user_id: int, db: Session = Depends(get_db)):
    """다른 주차를 활성 계획으로 전환한다."""
    profile = crud.active_profile(db, user_id)
    plan = crud.load_plan(db, plan_id)
    if plan is None or profile is None or plan.user_id != user_id:
        raise HTTPException(status_code=404, detail="계획을 찾을 수 없습니다.")

    crud.set_active_plan(db, user_id, plan_id)
    invalidate_user(user_id)
    return {"plan": crud.plan_to_dict(db, plan, profile, profile.user)}


# --------------------------------------------------- 4) 일정 재조정 / 5) 치트데이

@app.post("/api/reschedule")
async def reschedule_week(payload: RescheduleRequest, db: Session = Depends(get_db)):
    user, profile, profile_data, restrictions = _profile_context(db, payload.userId)
    plan = crud.load_plan(db, payload.planId)
    if plan is None or plan.user_id != user.id:
        raise HTTPException(status_code=404, detail="계획을 찾을 수 없습니다.")

    current = crud.plan_to_dict(db, plan, profile, user)
    baseline = daily_baseline(profile_data, restrictions)

    schedule, message = reschedule(
        current["schedule"], baseline, payload.missedDay, tuple(payload.completedDays)
    )
    crud.replace_schedule(db, plan, schedule)
    crud.log_adjustment(db, plan, "missed", DAYS.index(payload.missedDay), message)
    invalidate_user(payload.userId)

    return {
        "schedule": schedule,
        "message": message,
        "weeklyNutrition": weekly_total(schedule),
    }


@app.post("/api/dining-out")
async def dining_out(payload: DiningRequest, db: Session = Depends(get_db)):
    user, profile, profile_data, restrictions = _profile_context(db, payload.userId)
    plan = crud.load_plan(db, payload.planId)
    if plan is None or plan.user_id != user.id:
        raise HTTPException(status_code=404, detail="계획을 찾을 수 없습니다.")

    current = crud.plan_to_dict(db, plan, profile, user)
    baseline = daily_baseline(profile_data, restrictions)

    event = payload.event.model_dump()
    schedule, rebalance, tactics = apply_event(current["schedule"], baseline, event)

    crud.replace_schedule(db, plan, schedule)
    crud.log_dining_event(db, user.id, plan.id, event, rebalance)
    crud.log_adjustment(
        db,
        plan,
        "event",
        DAYS.index(event["day"]),
        f"{event['day']}요일 {event['type']}({event['cuisine']}) 반영, "
        f"초과 {rebalance['surplus']}kcal 중 {rebalance.get('applied', 0)}kcal 보정",
    )
    invalidate_user(payload.userId)

    return {
        "schedule": schedule,
        "rebalance": rebalance,
        "tactics": tactics,
        "weeklyNutrition": weekly_total(schedule),
    }


# ------------------------------------------------------- 3) 운동 / 식단 로깅

@app.post("/api/logs/workout")
async def log_workout(payload: WorkoutLogRequest, db: Session = Depends(get_db)):
    log = crud.upsert_workout_log(db, payload.userId, payload)
    invalidate_user(payload.userId)
    if payload.status in ("done", "partial"):
        experiments.record_goal(db, payload.userId, "workout_logged")

    return {
        "id": log.id,
        "date": log.log_date.isoformat(),
        "status": log.status,
        "setCount": len(log.sets),
        "volume": round(sum(entry.weight_kg * entry.reps for entry in log.sets)),
        "energy": _burned_for(db, payload.userId, log),
    }


@app.post("/api/logs/meal")
async def log_meal(payload: MealLogRequest, db: Session = Depends(get_db)):
    """열량을 주지 않으면 먹은 음식 텍스트에서 추정해 채운다."""
    estimation = None
    if payload.calories == 0 and payload.protein == 0 and payload.description:
        estimation = foods.estimate(payload.description)
        total = estimation["total"]
        payload = payload.model_copy(update={
            "calories": total["calories"],
            "protein": total["protein"],
            "carbs": total["carbs"],
            "fat": total["fat"],
        })

    log = crud.add_meal_log(db, payload.userId, payload)
    invalidate_user(payload.userId)

    return {
        "id": log.id,
        "date": log.log_date.isoformat(),
        "mealType": log.meal_type,
        "calories": log.calories,
        "protein": log.protein,
        "carbs": log.carbs,
        "fat": log.fat,
        "estimation": estimation,
    }


@app.delete("/api/logs/meal/{log_id}")
async def remove_meal_log(log_id: int, user_id: int, db: Session = Depends(get_db)):
    if not crud.delete_meal_log(db, user_id, log_id):
        raise HTTPException(status_code=404, detail="기록을 찾을 수 없습니다.")
    invalidate_user(user_id)
    return {"status": "deleted"}


@app.get("/api/logs")
async def get_logs(
    user_id: int,
    week_start: date | None = None,
    start: date | None = None,
    end: date | None = None,
    db: Session = Depends(get_db),
):
    """기본은 주 단위. start/end를 주면 그 기간 전체를 돌려준다(달력용)."""
    if start and end:
        range_start, range_end = start, end
    else:
        range_start = week_start or crud.week_start_of()
        range_end = range_start + timedelta(days=6)

    workouts = crud.workout_logs_between(db, user_id, range_start, range_end)
    meals = crud.meal_logs_between(db, user_id, range_start, range_end)
    daily = _daily_summary(db, user_id, range_start, range_end, workouts, meals)

    return {
        "weekStart": (week_start or range_start).isoformat(),
        "start": range_start.isoformat(),
        "end": range_end.isoformat(),
        "daily": daily,
        "workouts": [
            {
                "id": log.id,
                "date": log.log_date.isoformat(),
                "status": log.status,
                "durationMin": log.duration_min,
                "rpe": log.rpe,
                "note": log.note,
                "energy": _burned_for(db, user_id, log),
                "exercises": crud.collapse_sets(log),
                "sets": [
                    {
                        "exerciseName": entry.exercise_name,
                        "setNo": entry.set_no,
                        "weightKg": entry.weight_kg,
                        "reps": entry.reps,
                    }
                    for entry in log.sets
                ],
            }
            for log in workouts
        ],
        "meals": [
            {
                "id": log.id,
                "date": log.log_date.isoformat(),
                "mealType": log.meal_type,
                "description": log.description,
                "calories": log.calories,
                "protein": log.protein,
                "carbs": log.carbs,
                "fat": log.fat,
            }
            for log in meals
        ],
    }


@app.post("/api/nutrition/estimate")
async def estimate_nutrition(payload: EstimateRequest):
    """먹은 음식 텍스트 → 열량·영양소 추정. 저장 전에 미리 보여주는 용도."""
    return foods.estimate(payload.text)


@app.get("/api/exercises")
async def search_exercises(q: str = "", model: str | None = None, db: Session = Depends(get_db)):
    """운동 검색. 자연어 요청을 AI 계층이 해석한다.

    자격 증명이 있으면 Claude가, 없으면 규칙 엔진이 처리하고 어느 쪽인지 함께 알린다.
    """
    library = crud.load_library(db)
    catalog = library.items
    by_slug = {item["slug"]: item for item in catalog}

    if not (q or "").strip():
        results = [
            {
                "slug": item["slug"], "name": item["name"], "muscle": item["muscle"],
                "equipment": item["equipment"], "pattern": item["pattern"],
                "risk": item["risk"], "reason": "",
            }
            for item in sorted(catalog, key=lambda item: (item["muscle"], item["name"]))
        ]
        return {"exercises": results, "total": len(results), "search": None}

    found = ai_registry.search_exercises(q, catalog, model)

    results = []
    for match in found["matches"]:
        item = by_slug.get(match["slug"])
        if item is None:
            continue
        results.append({
            "slug": item["slug"], "name": item["name"], "muscle": item["muscle"],
            "equipment": item["equipment"], "pattern": item["pattern"],
            "risk": item["risk"], "reason": match.get("reason", ""),
        })

    return {
        "exercises": results,
        "total": len(results),
        "search": {
            "summary": found["summary"],
            "model": found["model"],
            "fallbackFrom": found["fallbackFrom"],
            "fallbackReason": found["fallbackReason"],
        },
    }


@app.get("/api/exercises/{slug}")
async def exercise_detail(slug: str, db: Session = Depends(get_db)):
    library = crud.load_library(db)
    item = library.by_slug.get(slug)
    if item is None:
        raise HTTPException(status_code=404, detail="운동을 찾을 수 없습니다.")

    alt = library.by_slug.get(item.get("alt") or "")
    return {
        "exercise": {
            "slug": item["slug"],
            "name": item["name"],
            "muscle": item["muscle"],
            "equipment": item["equipment"],
            "pattern": item["pattern"],
            "risk": item["risk"],
            "isHighImpact": item["impact"],
            "alternative": {"slug": alt["slug"], "name": alt["name"]} if alt else None,
        },
        "guide": exercise_guide.guide_for(item["slug"], item["name"]),
    }


@app.get("/api/nutrition/foods")
async def list_known_foods():
    return {"foods": foods.known_foods()}


def _plan_day_index(db, user_id, target_date):
    """그 날짜가 속한 계획의 요일 정보를 찾는다. 없으면 None."""
    for plan in crud.plans_overlapping(db, user_id, target_date, target_date):
        offset = (target_date - plan.week_start).days
        if 0 <= offset <= 6:
            for day in plan.days:
                if day.day_index == offset:
                    return plan, day
    return None, None


def _planned_sets(day):
    """그날 계획된 총 세트 수."""
    if day is None:
        return 0

    total = 0
    for item in day.items:
        sets, _ = parse_prescription(item.prescription)
        total += sets or 0
    return total


def _energy_for(log, day, weight_kg, fallback_minutes):
    """기본 소모 + 계획 초과분 소모.

    소요 시간을 직접 적었다면 그 시간에 추가분이 이미 들어 있으므로 더하지 않는다.
    적지 않았을 때만 초과 세트를 시간으로 환산해 더한다.
    """
    intensity = day.intensity if day else "moderate"
    base = burned_kcal(log.status, intensity, log.duration_min, weight_kg, fallback_minutes)

    planned = _planned_sets(day)
    logged = len(log.sets)
    extra_sets = max(logged - planned, 0) if log.status != "missed" else 0
    extra = extra_burn(extra_sets, intensity, weight_kg)

    included = log.duration_min is None and extra > 0
    return {
        "baseKcal": base,
        "extraSets": extra_sets,
        "extraKcal": extra,
        "extraIncluded": included,
        "plannedSets": planned,
        "loggedSets": logged,
        "burnedKcal": base + (extra if included else 0),
    }


def _burned_for(db, user_id, log):
    profile = crud.active_profile(db, user_id)
    if profile is None:
        return 0

    _, day = _plan_day_index(db, user_id, log.log_date)
    fallback = default_minutes(profile.duration)

    return _energy_for(log, day, profile.user.weight_kg, fallback)


def _muscle_from_name(name):
    """'덤벨 컬(이두)' → '이두'. 사용자가 직접 적은 운동에서 부위를 뽑는다."""
    match = re.search(r"\(([^)]+)\)\s*$", name or "")
    return match.group(1) if match else ""


def _daily_summary(db, user_id, start, end, workouts, meals):
    """달력·주간 요약에 쓸 날짜별 집계.

    어떤 운동을 했는지, 무엇을 먹었는지, 섭취/소모 열량과 단백질을 한 줄로 모은다.
    """
    profile = crud.active_profile(db, user_id)
    weight = profile.user.weight_kg if profile else 70
    fallback = default_minutes(profile.duration) if profile else 50

    # 운동 id → 부위. 직접 입력한 운동은 이름의 괄호에서 읽는다.
    muscle_by_id = {row.id: row.muscle for row in db.scalars(select(Exercise)).all()}

    # 기간과 겹치는 계획을 미리 펼쳐 날짜 → 계획 요일로 만든다.
    plan_by_date = {}
    for plan in crud.plans_overlapping(db, user_id, start, end):
        for day in plan.days:
            plan_by_date[plan.week_start + timedelta(days=day.day_index)] = day

    workout_by_date = {log.log_date: log for log in workouts}
    meals_by_date = {}
    for meal in meals:
        meals_by_date.setdefault(meal.log_date, []).append(meal)

    summary = []
    cursor = start
    while cursor <= end:
        day = plan_by_date.get(cursor)
        log = workout_by_date.get(cursor)
        day_meals = meals_by_date.get(cursor, [])

        intake = {"calories": 0, "protein": 0, "carbs": 0, "fat": 0}
        for meal in day_meals:
            intake["calories"] += meal.calories
            intake["protein"] += meal.protein
            intake["carbs"] += meal.carbs
            intake["fat"] += meal.fat

        energy = _energy_for(log, day, weight, fallback) if log else None

        # 기록한 세트에서 실제로 한 운동 이름과 부위를 뽑는다(중복 제거, 순서 유지).
        performed = []
        muscles = []
        if log:
            for entry in log.sets:
                if entry.exercise_name not in performed:
                    performed.append(entry.exercise_name)

                muscle = muscle_by_id.get(entry.exercise_id) or _muscle_from_name(
                    entry.exercise_name
                )
                if muscle and muscle not in muscles:
                    muscles.append(muscle)

        if log or day_meals or day:
            summary.append({
                "date": cursor.isoformat(),
                "planned": day.focus if day else None,
                "intensity": day.intensity if day else None,
                "isRestDay": day.is_rest if day else None,
                "targetCalories": day.meal.calories if day and day.meal else None,
                "targetProtein": day.meal.protein if day and day.meal else None,
                "workoutStatus": log.status if log else None,
                "performed": performed,
                "muscles": muscles,
                "durationMin": log.duration_min if log else None,
                "rpe": log.rpe if log else None,
                "burnedKcal": energy["burnedKcal"] if energy else 0,
                "extraSets": energy["extraSets"] if energy else 0,
                "extraKcal": energy["extraKcal"] if energy else 0,
                "extraIncluded": energy["extraIncluded"] if energy else False,
                "plannedSets": energy["plannedSets"] if energy else 0,
                "loggedSets": energy["loggedSets"] if energy else 0,
                "intake": intake,
                "meals": [
                    {"mealType": meal.meal_type, "description": meal.description,
                     "calories": meal.calories, "protein": meal.protein}
                    for meal in day_meals
                ],
            })

        cursor += timedelta(days=1)

    return summary


# ------------------------------------------------------------ 4) 주간 리포트

@app.get("/api/reports/weekly")
async def weekly_report(user_id: int, week_start: date | None = None, db: Session = Depends(get_db)):
    plan = crud.active_plan(db, user_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="활성 계획이 없습니다.")

    start = week_start or plan.week_start

    # A/B: 경고를 먼저 보여줄 것인가, 잘한 점을 먼저 보여줄 것인가
    tone = experiments.record(db, user_id, "insight_tone", "report_view", once=True)

    # 변형마다 결과가 다르므로 캐시 키에 변형을 넣는다.
    key = f"report:{user_id}:{start.isoformat()}:{tone}"
    report = cache.get(key)
    if report is None:
        workouts = crud.week_workout_logs(db, user_id, start)
        meals = crud.week_meal_logs(db, user_id, start)
        # 볼륨은 한 주 숫자만으로는 의미가 없어 지난주와 비교한다.
        prev = crud.week_workout_logs(db, user_id, start - timedelta(days=7))
        report = build_weekly_report(plan, workouts, meals, start, tone, prev)
        cache.set(key, report, ttl=600)

    return {"report": report, "experiment": {"insight_tone": tone}}


# ---------------------------------------------------------- 6) 자동 루틴 재생성

@app.post("/api/plans/regenerate")
async def regenerate_plan(payload: RegenerateRequest, db: Session = Depends(get_db)):
    """지난주 리포트를 근거로 다음 주 계획을 자동 조정해 생성한다."""
    user, profile, profile_data, restrictions = _profile_context(db, payload.userId)

    plan = crud.active_plan(db, payload.userId)
    if plan is None:
        raise HTTPException(status_code=404, detail="활성 계획이 없습니다.")

    start = payload.weekStart or plan.week_start
    workouts = crud.week_workout_logs(db, payload.userId, start)
    meals = crud.week_meal_logs(db, payload.userId, start)
    report = build_weekly_report(plan, workouts, meals, start)

    adjustment = analyze(report, profile_data, plan.variant)
    variant = variant_by_id(adjustment["variantId"])

    library = crud.load_library(db)
    next_plan = build_plan(
        profile_data,
        variant,
        library,
        restrictions,
        overrides={
            "frequency": adjustment["frequency"],
            "trainingDays": adjustment["trainingDays"],
            "countOffset": adjustment["countOffset"],
        },
    )

    if not payload.apply:
        return {"adjustment": adjustment, "preview": next_plan, "applied": False}

    next_week = start + timedelta(days=7)
    saved = crud.save_plan(db, user, profile, next_plan, next_week)
    invalidate_user(payload.userId)

    return {
        "adjustment": adjustment,
        "plan": crud.plan_to_dict(db, saved, profile, user),
        "applied": True,
    }


# ------------------------------------------------------------ 7) 게이미피케이션

@app.get("/api/gamification")
async def get_gamification(user_id: int, db: Session = Depends(get_db)):
    key = f"game:{user_id}"
    summary = cache.get(key)
    if summary is not None:
        return {"summary": summary, "cached": True}

    plan = crud.active_plan(db, user_id)
    protein_target = plan.baseline_protein if plan else 0
    summary = gamification.build_summary(db, user_id, protein_target)
    cache.set(key, summary, ttl=300)

    return {"summary": summary, "cached": False}


# ------------------------------------------------------------------ 캐시 상태

@app.get("/api/cache/stats")
async def cache_stats():
    return cache.stats()


# ------------------------------------------------------------ 9) A/B 테스트

@app.get("/api/experiments")
async def get_experiments(user_id: int, db: Session = Depends(get_db)):
    """이 사용자의 실험 배정. 프론트가 변형에 맞춰 화면을 그릴 때 쓴다."""
    multi = ai_registry.multi_model_available()
    return {
        "assignments": experiments.assign_all(db, user_id, multi),
        "catalog": {
            key: {
                "description": spec["description"],
                "variants": list(spec["variants"]),
                "goal": spec["goalLabel"],
            }
            for key, spec in experiments.active_experiments(multi).items()
        },
    }


@app.post("/api/experiments/event")
async def post_experiment_event(
    payload: ExperimentEventRequest, db: Session = Depends(get_db)
):
    variant = experiments.record(db, payload.userId, payload.experiment, payload.event, payload.value)
    if variant is None:
        raise HTTPException(status_code=404, detail="없는 실험입니다.")
    return {"experiment": payload.experiment, "variant": variant, "event": payload.event}


@app.get("/api/experiments/results")
async def get_experiment_results(db: Session = Depends(get_db)):
    """변형별 노출·전환 집계. 표본이 적으면 결론을 내지 않는다."""
    return {"results": experiments.results(db, ai_registry.multi_model_available())}


# --------------------------------------------------------- 10) 멀티 AI 모델

@app.get("/api/ai/models")
async def list_ai_models():
    return {
        "models": ai_registry.list_models(),
        "default": ai_registry.default_key(),
        "multiModel": ai_registry.multi_model_available(),
    }


@app.post("/api/ai/coach")
async def ai_coach(payload: CoachRequest, db: Session = Depends(get_db)):
    """선택된(또는 실험이 배정한) 모델로 코칭을 생성한다."""
    user, profile, profile_data, _ = _profile_context(db, payload.userId)

    plan = crud.active_plan(db, payload.userId)
    plan_dict = crud.plan_to_dict(db, plan, profile, user) if plan else None

    report = None
    if payload.includeReport and plan:
        workouts = crud.week_workout_logs(db, payload.userId, plan.week_start)
        meals = crud.week_meal_logs(db, payload.userId, plan.week_start)
        report = build_weekly_report(plan, workouts, meals, plan.week_start)

    # 모델을 지정하지 않았고 비교할 모델이 둘 이상이면 실험이 고른다.
    model_key = payload.model
    variant = None
    if model_key is None and ai_registry.multi_model_available():
        variant = experiments.record(db, payload.userId, "coach_model", "coach_view", once=True)
        model_key = variant

    context = CoachContext(
        profile=profile_data.model_dump(exclude={"userId"}),
        plan=plan_dict,
        report=report,
        question=payload.question,
    )
    result = ai_registry.generate(context, model_key)

    return {"coaching": result.to_dict(), "experiment": {"coach_model": variant} if variant else {}}
