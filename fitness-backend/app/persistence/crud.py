"""DB 읽기/쓰기. 계획 dict ↔ 정규화 테이블 사이의 변환을 담당한다."""

import re
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.domain.energy import (
    met_for,
    parse_distance,
    parse_prescription,
    recommended_weight,
)
from app.domain.exercises import (
    LIGHT_WALK,
    METRIC_DISTANCE,
    METRIC_REPS,
    METRIC_WEIGHT,
    ExerciseLibrary,
    distance_for,
    metric_of,
    minutes_of,
    normalize_equipment,
    speed_of,
)
from app.domain.nutrition import INTENSITY_LABEL, weekly_total
from app.domain.body import body_profile
from app.domain.planner import AUTO_SPLIT, DAYS, coaching_for, guide_for, plan_split
from app.persistence.models import (
    Adjustment,
    BodyPart,
    Equipment,
    DiningEventLog,
    Exercise,
    ExerciseRisk,
    MealLog,
    MealTarget,
    MusicLink,
    Plan,
    PlanDay,
    PlanDayExercise,
    Profile,
    ProfileEquipment,
    ProfileInjury,
    SafetyFlag,
    SetLog,
    SupabaseIdentity,
    User,
    WorkoutLog,
)

NONE_OPTION = "해당 없음"


def week_start_of(day=None):
    """해당 날짜가 속한 주의 월요일."""
    day = day or date.today()
    return day - timedelta(days=day.weekday())


# ----------------------------------------------------------- 마스터 조회

def load_library(db):
    rows = db.scalars(
        select(Exercise).options(selectinload(Exercise.risks).selectinload(ExerciseRisk.body_part))
    ).all()
    if not rows:
        return ExerciseLibrary.from_seed()
    return ExerciseLibrary.from_rows(rows)


def _body_part_map(db):
    return {row.name: row for row in db.scalars(select(BodyPart)).all()}


def _equipment_map(db):
    return {row.name: row for row in db.scalars(select(Equipment)).all()}


# --------------------------------------------------------- 사용자와 설문

def upsert_user(db, payload, user_id=None):
    """user_id가 오면 신체 정보를 갱신하고, 없으면 새로 만든다."""
    user = db.get(User, user_id) if user_id else None
    if user is None:
        user = User(
            sex=payload.sex,
            age=payload.age,
            height_cm=payload.height,
            weight_kg=payload.weight,
            # 안 잰 값은 None으로 남긴다. 0으로 채우면 "체지방 0%"가 되어 버린다.
            body_fat_pct=payload.bodyFat,
            muscle_mass_kg=payload.muscleMass,
        )
        db.add(user)
    else:
        user.sex = payload.sex
        user.age = payload.age
        user.height_cm = payload.height
        user.weight_kg = payload.weight
        user.body_fat_pct = payload.bodyFat
        user.muscle_mass_kg = payload.muscleMass

    db.flush()
    return user


def save_profile(db, user, payload, findings):
    """새 설문 버전을 저장하고 이전 버전은 비활성화한다."""
    for old in db.scalars(select(Profile).where(Profile.user_id == user.id)).all():
        old.is_active = False

    profile = Profile(
        user_id=user.id,
        goal=payload.goal,
        level=payload.level,
        frequency=payload.frequency,
        split=payload.split,
        duration=payload.duration,
        style=payload.style,
        is_active=True,
    )
    db.add(profile)
    db.flush()

    parts = _body_part_map(db)
    for name in payload.injuries or []:
        if name == NONE_OPTION or name not in parts:
            continue
        db.add(ProfileInjury(profile_id=profile.id, body_part_id=parts[name].id))

    gear = _equipment_map(db)
    for name in normalize_equipment(payload.equipment):
        if name in gear:
            db.add(ProfileEquipment(profile_id=profile.id, equipment_id=gear[name].id))

    for finding in findings:
        db.add(
            SafetyFlag(
                profile_id=profile.id,
                code=finding["code"],
                severity=finding["severity"],
                message=finding["message"],
            )
        )

    db.commit()
    return profile


def active_profile(db, user_id):
    return db.scalars(
        select(Profile).where(Profile.user_id == user_id, Profile.is_active.is_(True))
    ).first()


def profile_payload(db, profile, user):
    """DB의 설문 행을 규칙 엔진이 쓰는 형태로 되돌린다."""
    injuries = [
        row.body_part.name
        for row in db.scalars(
            select(ProfileInjury)
            .where(ProfileInjury.profile_id == profile.id)
            .options(selectinload(ProfileInjury.body_part))
        ).all()
    ]
    equipment = [
        row.equipment.name
        for row in db.scalars(
            select(ProfileEquipment)
            .where(ProfileEquipment.profile_id == profile.id)
            .options(selectinload(ProfileEquipment.equipment))
        ).all()
    ]

    return {
        "goal": profile.goal,
        "level": profile.level,
        "frequency": profile.frequency,
        "split": profile.split or AUTO_SPLIT,
        "duration": profile.duration,
        "style": profile.style,
        "injuries": injuries or [NONE_OPTION],
        "equipment": sorted(normalize_equipment(equipment)),
        "sex": user.sex,
        "age": user.age,
        "height": user.height_cm,
        "weight": user.weight_kg,
        "bodyFat": user.body_fat_pct,
        "muscleMass": user.muscle_mass_kg,
    }


def link_supabase_identity(db, payload):
    """Attach a Supabase Auth identity to an existing local user when available."""
    identity = db.scalars(
        select(SupabaseIdentity).where(
            SupabaseIdentity.supabase_user_id == payload.supabaseUserId
        )
    ).first()

    if identity is None:
        identity = SupabaseIdentity(supabase_user_id=payload.supabaseUserId)
        db.add(identity)

    if payload.userId and db.get(User, payload.userId):
        identity.user_id = payload.userId

    identity.email = payload.email
    identity.display_name = payload.displayName
    db.commit()
    db.refresh(identity)
    return identity


# ------------------------------------------------------------------ 계획

def save_plan(db, user, profile, plan_dict, week_start=None):
    """생성된 계획 dict를 정규화 테이블로 저장한다."""
    week_start = week_start or week_start_of()

    for old in db.scalars(
        select(Plan).where(Plan.user_id == user.id, Plan.is_active.is_(True))
    ).all():
        old.is_active = False

    baseline = plan_dict["baseline"]
    plan = Plan(
        user_id=user.id,
        profile_id=profile.id,
        variant=plan_dict["id"],
        title=plan_dict["title"],
        description=plan_dict["description"],
        week_start=week_start,
        baseline_calories=baseline["calories"],
        baseline_protein=baseline["protein"],
        baseline_carbs=baseline["carbs"],
        baseline_fat=baseline["fat"],
        is_active=True,
    )
    db.add(plan)
    db.flush()

    _write_days(db, plan, plan_dict["schedule"])
    db.commit()
    return plan


def _write_days(db, plan, schedule):
    slug_to_id = {row.slug: row.id for row in db.scalars(select(Exercise)).all()}

    for day_dict in schedule:
        day_index = DAYS.index(day_dict["day"])
        day = PlanDay(
            plan_id=plan.id,
            day_index=day_index,
            is_rest=day_dict.get("isRestDay", False),
            intensity=day_dict.get("intensity", "moderate"),
            focus=day_dict["workout"]["focus"],
            note=day_dict.get("note"),
            status=day_dict.get("status"),
        )
        db.add(day)
        db.flush()

        items = day_dict["workout"].get("items")
        if items:
            for position, item in enumerate(items):
                db.add(
                    PlanDayExercise(
                        plan_day_id=day.id,
                        exercise_id=item.get("exerciseId") or slug_to_id.get(item.get("slug")),
                        display_name=item["name"],
                        muscle=item.get("muscle", ""),
                        prescription=item.get("prescription", ""),
                        position=position,
                    )
                )
        else:
            # 휴식일처럼 마스터에 없는 안내 문구는 이름만 저장한다.
            for position, text in enumerate(day_dict["workout"]["exercises"]):
                db.add(
                    PlanDayExercise(
                        plan_day_id=day.id,
                        exercise_id=None,
                        display_name=text,
                        prescription="",
                        position=position,
                    )
                )

        meal = day_dict["meal"]
        db.add(
            MealTarget(
                plan_day_id=day.id,
                target_text=meal["target"],
                calories=meal["calories"],
                protein=meal["protein"],
                carbs=meal["carbs"],
                fat=meal["fat"],
                breakfast=meal.get("breakfast", ""),
                lunch=meal.get("lunch", ""),
                dinner=meal.get("dinner", ""),
                snack=meal.get("snack", ""),
                note=meal.get("note"),
            )
        )


def replace_schedule(db, plan, schedule):
    """재배치/보정 결과로 계획 요일을 통째로 다시 쓴다."""
    for day in list(plan.days):
        db.delete(day)
    db.flush()
    _write_days(db, plan, schedule)
    db.commit()
    db.refresh(plan)
    return plan


def load_plan(db, plan_id):
    return db.scalars(
        select(Plan)
        .where(Plan.id == plan_id)
        .options(
            selectinload(Plan.days).selectinload(PlanDay.items),
            selectinload(Plan.days).selectinload(PlanDay.meal),
        )
    ).first()


def active_plan(db, user_id):
    return db.scalars(
        select(Plan)
        .where(Plan.user_id == user_id, Plan.is_active.is_(True))
        .options(
            selectinload(Plan.days).selectinload(PlanDay.items),
            selectinload(Plan.days).selectinload(PlanDay.meal),
        )
        .order_by(Plan.created_at.desc())
    ).first()


def plan_to_dict(db, plan, profile, user):
    """DB의 계획을 프론트가 쓰던 dict 형태로 되돌린다."""
    from app.schemas import OnboardingRequest

    payload = OnboardingRequest(**profile_payload(db, profile, user))
    slug_by_id = {row.id: row.slug for row in db.scalars(select(Exercise)).all()}
    library_by_slug = {item["slug"]: item for item in load_library(db).items}

    schedule = []
    for day in sorted(plan.days, key=lambda d: d.day_index):
        meal = day.meal
        # 표기가 어긋나지 않게 항목을 먼저 만들고 텍스트 줄은 그것으로 조립한다.
        items = [
            _plan_item(item, slug_by_id, user, profile, library_by_slug) for item in day.items
        ]
        schedule.append({
            "day": DAYS[day.day_index],
            "isRestDay": day.is_rest,
            "intensity": day.intensity,
            "intensityLabel": INTENSITY_LABEL.get(day.intensity, day.intensity),
            "status": day.status,
            "note": day.note,
            "workout": {
                "focus": day.focus,
                "exercises": [
                    (
                        f"{item['name']}({item['muscle']}) {item['prescription']}".strip()
                        if item["muscle"]
                        else f"{item['name']} {item['prescription']}".strip()
                    )
                    for item in items
                ],
                "items": items,
            },
            "meal": {
                "target": meal.target_text if meal else "",
                "calories": meal.calories if meal else 0,
                "protein": meal.protein if meal else 0,
                "carbs": meal.carbs if meal else 0,
                "fat": meal.fat if meal else 0,
                "breakfast": meal.breakfast if meal else "",
                "lunch": meal.lunch if meal else "",
                "dinner": meal.dinner if meal else "",
                "snack": meal.snack if meal else "",
                "note": meal.note if meal else None,
            },
        })

    body = body_profile(payload)
    baseline = {
        "calories": plan.baseline_calories,
        "protein": plan.baseline_protein,
        "carbs": plan.baseline_carbs,
        "fat": plan.baseline_fat,
    }

    return {
        "planId": plan.id,
        "id": plan.variant,
        "title": plan.title,
        "variant": plan.variant,
        "description": plan.description,
        "weekStart": plan.week_start.isoformat(),
        "split": plan_split(payload, len([day for day in schedule if not day["isRestDay"]])),
        "bmi": body["bmi"],
        "bmiCategory": body["category"],
        "bodyType": body["typeLabel"],
        "bodyFat": body["bodyFat"],
        "muscleMass": body["muscleMass"],
        "preciseBody": body["precise"],
        "baseline": baseline,
        "dailyTargets": baseline,
        "schedule": schedule,
        "weeklyNutrition": weekly_total(schedule),
        "coaching": coaching_for(payload),
        "guide": guide_for(plan.variant),
    }


def _rest_line(text):
    """거리 표기가 없던 시절에 저장된 휴식일 안내 문구를 지금 표기로 맞춘다."""
    return LIGHT_WALK if text.startswith("가벼운 걷기") else text


def _km_text(km):
    """2.0 → "2", 1.8 → "1.8". JS 백엔드 표기와 맞춘다."""
    return str(int(km)) if float(km).is_integer() else str(km)


def _plan_item(item, slug_by_id, user, profile, library_by_slug=None):
    """계획 항목 + 추천 세트/횟수/중량. 중량은 체중·경력·성향으로 계산한다."""
    slug = slug_by_id.get(item.exercise_id)
    sets, reps = parse_prescription(item.prescription)
    known = (library_by_slug or {}).get(slug) if slug else None
    metric = metric_of(known) if known else METRIC_REPS

    # 거리 표기가 없던 시절에 만든 계획은 적힌 시간으로 거리를 되살린다.
    prescription = item.prescription
    distance_km = parse_distance(prescription)
    if metric == METRIC_DISTANCE and distance_km is None:
        minutes = minutes_of(prescription)
        distance_km = distance_for(slug, minutes)
        if distance_km:
            prescription = f"{_km_text(distance_km)}km({minutes}분)"

    return {
        "exerciseId": item.exercise_id,
        "slug": slug,
        "name": _rest_line(item.display_name),
        "muscle": item.muscle,
        "equipment": known.get("equipment") if known else None,
        "prescription": prescription,
        "sets": sets,
        "reps": reps,
        "metric": metric,
        "distanceKm": distance_km,
        # 소모 열량 추정에 쓴다. 동작마다 다르다.
        "met": met_for(known),
        "speedKmh": speed_of(slug) if slug else None,
        # 무게를 다루는 동작에만 추천 중량을 붙인다.
        "recommendedWeight": (
            recommended_weight(slug, user.weight_kg, profile.level, profile.style)
            if slug and metric == METRIC_WEIGHT
            else None
        ),
    }


def collapse_sets(log):
    """세트 행 → 운동 한 줄(운동명, 세트 수, 무게, 횟수). 화면 입력 형태로 되돌린다."""
    grouped = []
    index = {}

    for entry in sorted(log.sets, key=lambda row: (row.id or 0)):
        key = (entry.exercise_name, entry.weight_kg, entry.reps, entry.distance_km)
        if key in index:
            grouped[index[key]]["sets"] += 1
            continue

        index[key] = len(grouped)
        grouped.append({
            "exerciseName": entry.exercise_name,
            "sets": 1,
            "weightKg": entry.weight_kg,
            "reps": entry.reps,
            "distanceKm": entry.distance_km or 0,
        })

    return grouped


def plans_overlapping(db, user_id, start, end):
    """기간과 겹치는 계획들. 달력에 요일별 계획을 겹쳐 보여줄 때 쓴다."""
    return db.scalars(
        select(Plan)
        .where(Plan.user_id == user_id, Plan.week_start <= end)
        .options(
            selectinload(Plan.days).selectinload(PlanDay.meal),
            selectinload(Plan.days).selectinload(PlanDay.items),
        )
        .order_by(Plan.week_start)
    ).all()


def swap_plan_exercise(db, plan_id, day_index, position, item, prescription):
    """계획 항목 하나를 다른 동작으로 바꾼다.

    그 자리(요일·순서)만 갈아끼우고 나머지 요일과 식단은 건드리지 않는다.
    """
    day = db.scalars(
        select(PlanDay).where(PlanDay.plan_id == plan_id, PlanDay.day_index == day_index)
    ).first()
    if day is None:
        return None

    row = db.scalars(
        select(PlanDayExercise).where(
            PlanDayExercise.plan_day_id == day.id,
            PlanDayExercise.position == position,
        )
    ).first()
    if row is None:
        return None

    exercise_id = item.get("id")
    if exercise_id is None:
        found = db.scalars(select(Exercise).where(Exercise.slug == item["slug"])).first()
        exercise_id = found.id if found else None

    previous_name = row.display_name
    row.exercise_id = exercise_id
    row.display_name = item["name"]
    row.muscle = item["muscle"]
    row.prescription = prescription
    db.commit()

    return {"previousName": previous_name, "dayId": day.id}


def log_adjustment(db, plan, kind, day_index, message):
    db.add(Adjustment(plan_id=plan.id, kind=kind, day_index=day_index, message=message))
    db.commit()


def log_dining_event(db, user_id, plan_id, event, rebalance):
    db.add(
        DiningEventLog(
            user_id=user_id,
            plan_id=plan_id,
            day_index=DAYS.index(event["day"]),
            event_type=event["type"],
            cuisine=event.get("cuisine", ""),
            alcohol=event.get("alcohol", "없음"),
            surplus_kcal=rebalance.get("surplus", 0),
            applied_kcal=rebalance.get("applied", 0),
        )
    )
    db.commit()


# ------------------------------------------------------------------ 기록

def upsert_workout_log(db, user_id, payload):
    """같은 날짜에는 기록 하나만 유지한다."""
    log = db.scalars(
        select(WorkoutLog).where(
            WorkoutLog.user_id == user_id, WorkoutLog.log_date == payload.date
        )
    ).first()

    if log is None:
        log = WorkoutLog(user_id=user_id, log_date=payload.date, status=payload.status)
        db.add(log)

    log.status = payload.status
    log.plan_day_id = payload.planDayId
    log.duration_min = payload.durationMin
    log.rpe = payload.rpe
    log.note = payload.note
    db.flush()

    for old in list(log.sets):
        db.delete(old)
    db.flush()

    slug_to_id = {row.slug: row.id for row in db.scalars(select(Exercise)).all()}
    name_to_id = {row.name: row.id for row in db.scalars(select(Exercise)).all()}

    # 화면은 '운동 한 줄 + 세트 수'로 입력받지만, 저장은 세트 단위로 펼친다.
    # 볼륨(무게x횟수) 계산과 리포트가 세트 행을 기준으로 돌아가기 때문이다.
    for entry in payload.sets or []:
        exercise_id = (
            entry.exerciseId
            or slug_to_id.get(entry.slug or "")
            or name_to_id.get(entry.exerciseName)
            # 화면에는 '덤벨 로우(등)'처럼 부위가 붙어 있다. 못 찾으면 떼고 다시 찾는다.
            or name_to_id.get(re.sub(r"\s*\([^)]*\)\s*$", "", entry.exerciseName or ""))
        )
        for set_no in range(1, max(int(entry.sets or 1), 1) + 1):
            db.add(
                SetLog(
                    workout_log_id=log.id,
                    exercise_id=exercise_id,
                    exercise_name=entry.exerciseName,
                    set_no=set_no,
                    weight_kg=entry.weightKg,
                    reps=entry.reps,
                    distance_km=entry.distanceKm,
                )
            )

    db.commit()
    db.refresh(log)
    return log


# ----------------------------------------------------- 음악 플레이리스트

def music_links_of(db, user_id):
    rows = db.scalars(
        select(MusicLink).where(MusicLink.user_id == user_id).order_by(MusicLink.id.desc())
    ).all()
    return [{"id": row.id, "label": row.label, "url": row.url} for row in rows]


def add_music_link(db, user_id, label, url):
    link = MusicLink(user_id=user_id, label=label, url=url)
    db.add(link)
    db.commit()
    return link


def delete_music_link(db, user_id, link_id):
    link = db.get(MusicLink, link_id)
    if link is None or link.user_id != user_id:
        return False

    db.delete(link)
    db.commit()
    return True


def add_meal_log(db, user_id, payload):
    log = MealLog(
        user_id=user_id,
        log_date=payload.date,
        meal_type=payload.mealType,
        description=payload.description,
        calories=payload.calories,
        protein=payload.protein,
        carbs=payload.carbs,
        fat=payload.fat,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def delete_meal_log(db, user_id, log_id):
    log = db.get(MealLog, log_id)
    if log and log.user_id == user_id:
        db.delete(log)
        db.commit()
        return True
    return False


def week_workout_logs(db, user_id, start):
    end = start + timedelta(days=6)
    return db.scalars(
        select(WorkoutLog)
        .where(
            WorkoutLog.user_id == user_id,
            WorkoutLog.log_date >= start,
            WorkoutLog.log_date <= end,
        )
        .options(selectinload(WorkoutLog.sets))
        .order_by(WorkoutLog.log_date)
    ).all()


def week_meal_logs(db, user_id, start):
    end = start + timedelta(days=6)
    return db.scalars(
        select(MealLog)
        .where(MealLog.user_id == user_id, MealLog.log_date >= start, MealLog.log_date <= end)
        .order_by(MealLog.log_date, MealLog.id)
    ).all()


def list_plans(db, user_id):
    """주차 이동용 계획 목록."""
    rows = db.scalars(
        select(Plan).where(Plan.user_id == user_id).order_by(Plan.week_start.desc())
    ).all()
    return [
        {
            "planId": row.id,
            "weekStart": row.week_start.isoformat(),
            "title": row.title,
            "variant": row.variant,
            "isActive": row.is_active,
        }
        for row in rows
    ]


def set_active_plan(db, user_id, plan_id):
    for row in db.scalars(select(Plan).where(Plan.user_id == user_id)).all():
        row.is_active = row.id == plan_id
    db.commit()


def workout_logs_between(db, user_id, start, end):
    return db.scalars(
        select(WorkoutLog)
        .where(
            WorkoutLog.user_id == user_id,
            WorkoutLog.log_date >= start,
            WorkoutLog.log_date <= end,
        )
        .options(selectinload(WorkoutLog.sets))
        .order_by(WorkoutLog.log_date)
    ).all()


def meal_logs_between(db, user_id, start, end):
    return db.scalars(
        select(MealLog)
        .where(MealLog.user_id == user_id, MealLog.log_date >= start, MealLog.log_date <= end)
        .order_by(MealLog.log_date, MealLog.id)
    ).all()
