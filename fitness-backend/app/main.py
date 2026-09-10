# main.py
import re
from contextlib import asynccontextmanager
from datetime import date, timedelta
from datetime import date as date_type

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.env import load_env

# 모델 자격 증명을 읽기 전에 .env부터 환경에 올린다.
load_env()

from app.ai import registry as ai_registry
from app.ai.base import CoachContext
from app.core.cache import cache, invalidate_user, make_key
from app.core.db import SessionLocal, get_db
from app.domain import exercise_guide, experiments, foods, gamification, safety
from app.domain.coaching import apply_event, reschedule
from app.domain.energy import (
    burned_kcal,
    default_minutes,
    exercise_kcal,
    met_for,
    parse_distance,
    parse_prescription,
)
from app.domain.exercises import (
    EQUIPMENT,
    METRIC_REPS,
    alternatives_for,
    metric_of,
    normalize_equipment,
    prescription_for_item,
    speed_of,
)
from app.domain.body import normalize_body_reading
from app.domain import music as music_domain
from app.domain.nutrition import INTENSITY_LABEL, daily_baseline, weekly_total
from app.domain.planner import SPLIT_OPTIONS, DAYS, build_plan, build_plans
from app.domain.progression import analyze, variant_by_id
from app.domain.reports import build_weekly_report
from app.persistence import crud
from app.persistence.models import Exercise
from app.persistence.seed import init_db, seed_master
from app.schemas import (
    CoachRequest,
    DiningRequest,
    EstimateRequest,
    ExperimentEventRequest,
    MealLogRequest,
    MusicLinkRequest,
    RegenerateRequest,
    OnboardingRequest,
    PlanSelectRequest,
    RescheduleRequest,
    SupabaseLinkRequest,
    SwapExerciseRequest,
    WorkoutLogRequest,
)


# 1곡 모드에서 보여줄 후보 곡 수.
SINGLE_TRACK_CHOICES = 8


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
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
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


@app.post("/api/auth/supabase/link")
async def link_supabase_user(payload: SupabaseLinkRequest, db: Session = Depends(get_db)):
    identity = crud.link_supabase_identity(db, payload)
    return {
        "userId": identity.user_id,
        "supabaseUserId": identity.supabase_user_id,
        "email": identity.email,
        "displayName": identity.display_name,
    }


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
        "splits": SPLIT_OPTIONS,
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


ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 6 * 1024 * 1024


@app.post("/api/nutrition/photo")
async def analyze_meal_photo(photo: UploadFile = File(...)):
    """식사 사진 → 음식 텍스트 + 영양 추정.

    사진은 저장하지 않는다. 분석에만 쓰고 바로 버린다.
    """
    if photo.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail="JPG, PNG, WebP 이미지만 올릴 수 있습니다.",
        )

    image_bytes = await photo.read()
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="이미지가 6MB를 넘습니다.")
    if not image_bytes:
        raise HTTPException(status_code=400, detail="빈 파일입니다.")

    result = ai_registry.analyze_meal_photo(image_bytes, photo.content_type)

    # 아는 음식은 음식 DB 값으로, 모르는 음식만 모델이 어림한 값으로 채운다.
    if result.get("foods"):
        estimate = foods.estimate_from_photo(result["foods"])
    elif result["text"]:
        estimate = foods.estimate(result["text"])
    else:
        estimate = None

    return {
        "available": result["available"],
        "model": result["model"],
        "reason": result["reason"],
        "text": result["text"],
        "confidence": result.get("confidence"),
        "note": result.get("note", ""),
        "estimate": estimate,
    }


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


@app.get("/api/exercises/{slug}/alternatives")
async def exercise_alternatives(
    slug: str, user_id: int | None = None, db: Session = Depends(get_db)
):
    """기구가 없을 때 대신 할 수 있는 동작들."""
    library = crud.load_library(db)
    item = library.by_slug.get(slug)
    if item is None:
        raise HTTPException(status_code=404, detail="운동을 찾을 수 없습니다.")

    # 설문이 있으면 그 사람의 부상·보유 기구를 반영하고, 없으면 맨몸 기준으로 본다.
    profile = {"injuries": [], "equipment": []}
    restrictions = {}
    if user_id:
        _user, _row, profile, restrictions = _profile_context(db, user_id)

    owned = normalize_equipment(
        profile.equipment if hasattr(profile, "equipment") else profile["equipment"]
    )
    return {
        "origin": {
            "slug": item["slug"],
            "name": item["name"],
            "muscle": item["muscle"],
            "equipment": item["equipment"],
            "pattern": item["pattern"],
            "owned": item["equipment"] in owned,
        },
        "alternatives": alternatives_for(slug, profile, library, restrictions),
    }


# ------------------------------------------------- 계획 속 동작 교체

@app.post("/api/plans/swap-exercise")
async def swap_plan_exercise(payload: SwapExerciseRequest, db: Session = Depends(get_db)):
    user, profile, profile_data, restrictions = _profile_context(db, payload.userId)
    plan = crud.load_plan(db, payload.planId)
    if plan is None or plan.user_id != user.id:
        raise HTTPException(status_code=404, detail="계획을 찾을 수 없습니다.")

    library = crud.load_library(db)
    item = library.by_slug.get(payload.slug)
    if item is None:
        raise HTTPException(status_code=404, detail="바꿀 운동을 찾을 수 없습니다.")

    if payload.day not in DAYS:
        raise HTTPException(status_code=422, detail="요일이 올바르지 않습니다.")
    day_index = DAYS.index(payload.day)

    prescription = prescription_for_item(item, profile_data, restrictions)
    result = crud.swap_plan_exercise(db, plan.id, day_index, payload.position, item, prescription)
    if result is None:
        raise HTTPException(status_code=404, detail="바꿀 자리를 찾을 수 없습니다.")

    message = f"{payload.day}요일 {result['previousName']} → {item['name']}({item['equipment']})"
    crud.log_adjustment(db, plan, "swap", day_index, message)
    invalidate_user(payload.userId)

    updated = crud.plan_to_dict(db, crud.load_plan(db, plan.id), profile, user)
    return {"schedule": updated["schedule"], "message": message}


@app.post("/api/body/photo")
async def analyze_body_photo(photo: UploadFile = File(...)):
    """체성분 결과지 사진 → 키·체중·BMI.

    사진은 저장하지 않는다. 분석에만 쓰고 바로 버린다.
    """
    if photo.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail="JPG, PNG, WebP 이미지만 올릴 수 있습니다.",
        )

    image_bytes = await photo.read()
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="이미지가 6MB를 넘습니다.")
    if not image_bytes:
        raise HTTPException(status_code=400, detail="빈 파일입니다.")

    result = ai_registry.analyze_body_photo(image_bytes, photo.content_type)
    # 모델이 읽은 숫자는 규칙으로 한 번 걸러서 내보낸다.
    reading = normalize_body_reading(result["reading"]) if result["available"] else None
    raw = result.get("reading") or {}

    return {
        "available": result["available"],
        "model": result["model"],
        "reason": result["reason"],
        "reading": reading,
        "confidence": raw.get("confidence"),
        "note": raw.get("note", ""),
        "measuredAt": raw.get("measuredAt"),
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


def _kcal_of_logged_sets(rows, by_id, weight_kg):
    """저장된 세트 행들을 '운동 한 줄'로 모아 소모 열량을 낸다.

    세트마다 반올림하면 화면에 보이던 값과 몇 kcal씩 어긋난다.
    """
    groups = {}
    for row in rows:
        key = (row.exercise_id, row.distance_km or 0)
        group = groups.setdefault(
            key, {"exerciseId": row.exercise_id, "distanceKm": row.distance_km or 0, "sets": 0}
        )
        group["sets"] += 1

    total = 0
    for group in groups.values():
        item = by_id.get(group["exerciseId"])
        total += exercise_kcal(
            {
                "metric": metric_of(item) if item else METRIC_REPS,
                "met": met_for(item),
                "sets": group["sets"],
                "distanceKm": group["distanceKm"],
                "speedKmh": speed_of(item["slug"]) if item else None,
            },
            weight_kg,
        )
    return total


def _kcal_of_planned_item(item, by_id, weight_kg):
    """계획된 한 항목의 소모 열량. 처방에 적힌 세트 수·거리를 그대로 쓴다."""
    known = by_id.get(item.exercise_id)
    metric = metric_of(known) if known else METRIC_REPS
    sets, _ = parse_prescription(item.prescription)

    return exercise_kcal(
        {
            "metric": metric,
            "met": met_for(known),
            "sets": sets or 0,
            "distanceKm": parse_distance(item.prescription) or 0,
            "speedKmh": speed_of(known["slug"]) if known else None,
        },
        weight_kg,
    )


def _energy_for(db, log, day, weight_kg, fallback_minutes):
    """기본 소모 + 계획 초과분 소모.

    열량은 동작마다 다르게 잡는다. 같은 3세트라도 스쿼트와 레터럴 레이즈가
    같은 열량일 수 없어서, 동작별 MET으로 세트·거리를 환산해 더한다.
    소요 시간을 직접 적었다면 그 시간을 믿고(추가분이 이미 들어 있다) 그것으로 계산한다.
    """
    intensity = day.intensity if day else "moderate"
    by_id = {item["id"]: item for item in crud.load_library(db).items if item.get("id")}

    planned = _planned_sets(day)
    logged = len(log.sets)
    extra_sets = max(logged - planned, 0) if log.status != "missed" else 0

    # 실제로 기록한 동작들을 하나씩 더한다.
    logged_kcal = _kcal_of_logged_sets(log.sets, by_id, weight_kg)
    if log.status == "missed":
        logged_kcal = 0
    elif log.status == "partial":
        logged_kcal = round(logged_kcal * 0.5)

    planned_kcal = sum(
        _kcal_of_planned_item(item, by_id, weight_kg) for item in (day.items if day else [])
    )
    extra = max(round(logged_kcal - planned_kcal), 0)

    # 시간을 적었으면 그 시간이 진실이다. 아니면 동작별 추정 합계를 쓴다.
    base = (
        burned_kcal(log.status, intensity, log.duration_min, weight_kg, fallback_minutes)
        if log.duration_min is not None
        else logged_kcal
    )

    return {
        "baseKcal": base,
        "extraSets": extra_sets,
        "extraKcal": extra,
        # 추가분은 이미 base(동작별 합계)에 들어 있다. 두 번 더하지 않는다.
        "extraIncluded": False,
        "plannedSets": planned,
        "loggedSets": logged,
        "burnedKcal": base,
    }


def _burned_for(db, user_id, log):
    profile = crud.active_profile(db, user_id)
    if profile is None:
        return 0

    _, day = _plan_day_index(db, user_id, log.log_date)
    fallback = default_minutes(profile.duration)

    return _energy_for(db, log, day, profile.user.weight_kg, fallback)


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

        energy = _energy_for(db, log, day, weight, fallback) if log else None

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


# ------------------------------------------------------- 음악 플레이리스트

@app.get("/api/music")
async def music(user_id: int | None = None, date: str | None = None, db: Session = Depends(get_db)):
    """그날 세션 강도에 맞는 플레이리스트와 저장해 둔 링크."""
    day = None
    if user_id and date:
        target = date_type.fromisoformat(date)
        _plan, plan_day = _plan_day_index(db, user_id, target)
        if plan_day is not None:
            day = {
                "day": DAYS[plan_day.day_index],
                "focus": plan_day.focus,
                "isRestDay": plan_day.is_rest,
                "intensity": plan_day.intensity,
                "intensityLabel": INTENSITY_LABEL.get(plan_day.intensity, plan_day.intensity),
            }

    # 설문의 하루 운동 시간에 맞춰 길이를 기본값으로 잡아 둔다.
    profile = crud.active_profile(db, user_id) if user_id else None
    duration = music_domain.duration_for_session(profile.duration if profile else None)

    return {
        "today": {
            "date": date,
            "session": day,
            "reason": music_domain.reason_for(day),
            "playlist": music_domain.playlist_for_intensity(
                day["intensity"] if day else "moderate"
            ),
            "duration": duration,
        },
        "durations": music_domain.DURATIONS,
        # 장르 x 길이 조합. 1시간을 고르면 1시간짜리들이 나온다.
        "mixLists": music_domain.mix_lists_for(
            music_domain.playlist_for_intensity(day["intensity"] if day else "moderate")["id"]
        ),
        # 사용자가 직접 저장해 둔 링크
        "myLinks": crud.music_links_of(db, user_id) if user_id else [],
        "note": "음원을 재생하지 않고 유튜브·스포티파이 검색으로 연결합니다. BPM은 대략치입니다.",
    }


@app.get("/api/music/tracks")
async def music_tracks(theme: str, duration: str):
    """장르 x 길이 → 그 조합의 곡 목록. 모델이 없으면 내장 대표 곡으로 내려간다."""
    found = music_domain.theme_by_id(theme)
    picked = music_domain.duration_by_id(duration)
    if found is None or picked is None:
        raise HTTPException(status_code=422, detail="장르와 길이를 확인해 주세요.")

    head = {
        "theme": {"id": found["id"], "label": found["label"], "note": found["note"]},
        "duration": picked,
    }

    # 30분·1시간·2시간은 그 길이짜리 플레이리스트 영상들을 나열한다.
    # 곡을 하나씩 트는 게 아니라 통째로 틀어 둘 영상이 필요해서다.
    if picked["id"] != "1song":
        return {
            **head,
            "mode": "playlists",
            "items": music_domain.playlist_videos_for(found, picked),
            "source": "search",
        }

    # 1곡은 후보 곡을 여러 개 뽑아 그중 하나를 고르게 한다.
    count = SINGLE_TRACK_CHOICES
    key = make_key("music-tracks", {"theme": found["id"], "duration": picked["id"]})

    # 같은 장르면 결과가 같아도 되므로 캐시한다. 모델 호출이 비싸다.
    payload = cache.get(key)
    if payload is None:
        result = ai_registry.build_playlist(
            found["label"], found.get("bpm", ""), picked["minutes"] * count, count
        )
        used_ai = result["available"] and len(result["tracks"]) > 0
        tracks = result["tracks"] if used_ai else found["tracks"]

        payload = {
            **head,
            "mode": "tracks",
            "items": music_domain.with_links(tracks[:count]),
            "source": "ai" if used_ai else "basic",
            "model": result["model"],
            "reason": result["reason"],
        }
        # 성공한 목록만 오래 남긴다. 모델이 잠깐 죽어서 내려간 결과를
        # 6시간 동안 물고 있으면 복구돼도 계속 기본 목록만 보인다.
        cache.set(key, payload, 21600 if used_ai else 60)

    return payload


@app.post("/api/music/links")
async def add_music_link(payload: MusicLinkRequest, db: Session = Depends(get_db)):
    crud.add_music_link(db, payload.userId, payload.label, payload.url)
    return {"links": crud.music_links_of(db, payload.userId)}


@app.delete("/api/music/links/{link_id}")
async def delete_music_link(link_id: int, user_id: int, db: Session = Depends(get_db)):
    if not crud.delete_music_link(db, user_id, link_id):
        raise HTTPException(status_code=404, detail="링크를 찾을 수 없습니다.")
    return {"links": crud.music_links_of(db, user_id)}


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
