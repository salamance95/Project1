"""게이미피케이션: 포인트 원장과 뱃지.

포인트는 기록에서 매번 다시 계산한다. (사용자, 날짜, 종류)에 유일 제약이 있어
몇 번을 재계산해도 중복 지급되지 않는다. 기록을 지우면 포인트도 따라 줄어든다.
"""

from datetime import timedelta

from sqlalchemy import select

from models import MealLog, PointEvent, SetLog, UserBadge, WorkoutLog

POINTS = {
    "workout_done": 12,
    "workout_partial": 6,
    "meal_per_log": 3,
    "meal_daily_cap": 12,
    "protein_hit": 8,
}

LEVELS = [
    (0, "입문자"),
    (150, "습관 형성"),
    (400, "꾸준러"),
    (800, "중급 트레이니"),
    (1500, "베테랑"),
    (2500, "철인"),
]

# 뱃지 카탈로그. condition은 stats dict를 받아 (달성 여부, 현재값, 목표값)을 돌려준다.
BADGES = [
    {
        "code": "first_step",
        "name": "첫 걸음",
        "icon": "🏁",
        "description": "첫 운동 기록을 남겼습니다.",
        "metric": lambda s: (s["workout_days"], 1),
    },
    {
        "code": "streak_3",
        "name": "3일 연속",
        "icon": "🔥",
        "description": "3일 연속으로 기록했습니다.",
        "metric": lambda s: (s["best_streak"], 3),
    },
    {
        "code": "streak_7",
        "name": "일주일 완주",
        "icon": "🔥",
        "description": "7일 연속으로 기록했습니다.",
        "metric": lambda s: (s["best_streak"], 7),
    },
    {
        "code": "volume_10k",
        "name": "1만 kg",
        "icon": "🏋️",
        "description": "누적 볼륨 10,000kg을 들어올렸습니다.",
        "metric": lambda s: (s["total_volume"], 10000),
    },
    {
        "code": "volume_50k",
        "name": "5만 kg",
        "icon": "🏔️",
        "description": "누적 볼륨 50,000kg을 넘겼습니다.",
        "metric": lambda s: (s["total_volume"], 50000),
    },
    {
        "code": "protein_5",
        "name": "단백질 수호자",
        "icon": "🥩",
        "description": "단백질 목표를 90% 이상 채운 날이 5일입니다.",
        "metric": lambda s: (s["protein_days"], 5),
    },
    {
        "code": "meal_30",
        "name": "기록 습관",
        "icon": "🍽️",
        "description": "식단을 30끼 기록했습니다.",
        "metric": lambda s: (s["meal_count"], 30),
    },
    {
        "code": "comeback",
        "name": "다시 시작",
        "icon": "💪",
        "description": "빠진 다음 날 바로 복귀했습니다.",
        "metric": lambda s: (s["comebacks"], 1),
    },
    {
        "code": "honest_logger",
        "name": "정직한 기록자",
        "icon": "📝",
        "description": "체감 강도(RPE)를 5회 이상 남겼습니다.",
        "metric": lambda s: (s["rpe_logs"], 5),
    },
]


def _level_for(points):
    title = LEVELS[0][1]
    level = 1
    next_at = LEVELS[1][0]

    for index, (threshold, name) in enumerate(LEVELS):
        if points >= threshold:
            level = index + 1
            title = name
            next_at = LEVELS[index + 1][0] if index + 1 < len(LEVELS) else None

    return {"level": level, "title": title, "nextAt": next_at}


def _streaks(dates):
    """연속 기록일: (현재 연속, 최고 연속)."""
    if not dates:
        return 0, 0

    ordered = sorted(dates)
    best = 1
    run = 1
    for prev, current in zip(ordered, ordered[1:]):
        if (current - prev).days == 1:
            run += 1
            best = max(best, run)
        else:
            run = 1

    # 마지막 구간이 현재 연속이다.
    return run, best


def collect_stats(db, user_id, protein_target):
    workouts = db.scalars(
        select(WorkoutLog).where(WorkoutLog.user_id == user_id).order_by(WorkoutLog.log_date)
    ).all()
    meals = db.scalars(select(MealLog).where(MealLog.user_id == user_id)).all()

    workout_ids = [log.id for log in workouts]
    sets = (
        db.scalars(select(SetLog).where(SetLog.workout_log_id.in_(workout_ids))).all()
        if workout_ids
        else []
    )

    total_volume = sum(entry.weight_kg * entry.reps for entry in sets)

    protein_by_date = {}
    for meal in meals:
        protein_by_date[meal.log_date] = protein_by_date.get(meal.log_date, 0) + meal.protein
    protein_days = sum(
        1 for value in protein_by_date.values() if protein_target and value >= protein_target * 0.9
    )

    log_dates = {log.log_date for log in workouts if log.status != "missed"}
    log_dates |= set(protein_by_date.keys())
    current_streak, best_streak = _streaks(list(log_dates))

    # 미수행 다음 날 완료 = 복귀
    by_date = {log.log_date: log.status for log in workouts}
    comebacks = sum(
        1
        for log_date, status in by_date.items()
        if status == "missed" and by_date.get(log_date + timedelta(days=1)) == "done"
    )

    return {
        "workouts": workouts,
        "meals": meals,
        "workout_days": sum(1 for log in workouts if log.status in ("done", "partial")),
        "done_days": sum(1 for log in workouts if log.status == "done"),
        "total_volume": round(total_volume),
        "meal_count": len(meals),
        "protein_days": protein_days,
        "protein_by_date": protein_by_date,
        "current_streak": current_streak,
        "best_streak": best_streak,
        "comebacks": comebacks,
        "rpe_logs": sum(1 for log in workouts if log.rpe),
    }


def sync_points(db, user_id, stats, protein_target):
    """기록에서 포인트 원장을 다시 만든다. 이미 있는 항목은 금액만 맞춘다."""
    existing = {
        (row.log_date, row.kind): row
        for row in db.scalars(select(PointEvent).where(PointEvent.user_id == user_id)).all()
    }
    wanted = {}

    for log in stats["workouts"]:
        if log.status == "done":
            wanted[(log.log_date, "workout")] = (POINTS["workout_done"], "운동 완료")
        elif log.status == "partial":
            wanted[(log.log_date, "workout")] = (POINTS["workout_partial"], "운동 부분 수행")

    meals_by_date = {}
    for meal in stats["meals"]:
        meals_by_date[meal.log_date] = meals_by_date.get(meal.log_date, 0) + 1

    for log_date, count in meals_by_date.items():
        amount = min(count * POINTS["meal_per_log"], POINTS["meal_daily_cap"])
        wanted[(log_date, "meal")] = (amount, f"식단 {count}끼 기록")

    if protein_target:
        for log_date, protein in stats["protein_by_date"].items():
            if protein >= protein_target * 0.9:
                wanted[(log_date, "protein")] = (POINTS["protein_hit"], "단백질 목표 달성")

    for key, (amount, reason) in wanted.items():
        row = existing.get(key)
        if row is None:
            db.add(
                PointEvent(
                    user_id=user_id,
                    log_date=key[0],
                    kind=key[1],
                    amount=amount,
                    reason=reason,
                )
            )
        elif row.amount != amount:
            row.amount = amount
            row.reason = reason

    # 기록이 사라진 항목은 원장에서도 지운다.
    for key, row in existing.items():
        if key not in wanted:
            db.delete(row)

    db.commit()

    return sum(amount for amount, _ in wanted.values())


def sync_badges(db, user_id, stats):
    owned = {
        row.code: row
        for row in db.scalars(select(UserBadge).where(UserBadge.user_id == user_id)).all()
    }

    result = []
    for badge in BADGES:
        current, target = badge["metric"](stats)
        earned = current >= target

        if earned and badge["code"] not in owned:
            row = UserBadge(user_id=user_id, code=badge["code"])
            db.add(row)
            owned[badge["code"]] = row

        result.append({
            "code": badge["code"],
            "name": badge["name"],
            "icon": badge["icon"],
            "description": badge["description"],
            "earned": badge["code"] in owned or earned,
            "progress": {"current": min(current, target), "target": target},
        })

    db.commit()

    for item in result:
        row = owned.get(item["code"])
        item["earnedAt"] = row.earned_at.isoformat() if row and row.earned_at else None

    return result


def build_summary(db, user_id, protein_target):
    stats = collect_stats(db, user_id, protein_target)
    points = sync_points(db, user_id, stats, protein_target)
    badges = sync_badges(db, user_id, stats)

    recent = db.scalars(
        select(PointEvent)
        .where(PointEvent.user_id == user_id)
        .order_by(PointEvent.log_date.desc(), PointEvent.id.desc())
        .limit(8)
    ).all()

    return {
        "points": points,
        **_level_for(points),
        "currentStreak": stats["current_streak"],
        "bestStreak": stats["best_streak"],
        "totalVolume": stats["total_volume"],
        "workoutDays": stats["workout_days"],
        "mealCount": stats["meal_count"],
        "badges": badges,
        "earnedCount": sum(1 for badge in badges if badge["earned"]),
        "recent": [
            {
                "date": row.log_date.isoformat(),
                "kind": row.kind,
                "amount": row.amount,
                "reason": row.reason,
            }
            for row in recent
        ],
    }
