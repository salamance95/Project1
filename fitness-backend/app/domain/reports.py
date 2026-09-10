"""주간 분석 리포트: 계획 대비 실제 기록을 비교한다."""

from datetime import timedelta

from app.domain.planner import DAYS


def _macro_sum(rows):
    total = {"calories": 0, "protein": 0, "carbs": 0, "fat": 0}
    for row in rows:
        total["calories"] += row.calories
        total["protein"] += row.protein
        total["carbs"] += row.carbs
        total["fat"] += row.fat
    return total


def _rate(actual, planned):
    if not planned:
        return 0
    return round(actual / planned * 100)


def build_weekly_report(plan, workout_logs, meal_logs, week_start, tone="direct",
                        prev_workout_logs=None):
    """계획(plan) + 기록(logs) → 리포트 dict.

    tone은 A/B 실험(insight_tone)이 넘긴다. 내용은 같고 배열 순서와 도입부만 다르다.
    """
    planned_days = [day for day in plan.days if not day.is_rest]
    planned_by_index = {day.day_index: day for day in plan.days}

    logs_by_index = {}
    for log in workout_logs:
        index = (log.log_date - week_start).days
        if 0 <= index <= 6:
            logs_by_index[index] = log

    done = [log for log in logs_by_index.values() if log.status == "done"]
    partial = [log for log in logs_by_index.values() if log.status == "partial"]
    missed = [log for log in logs_by_index.values() if log.status == "missed"]

    # --- 운동 수행률 (부분 수행은 0.5로 계산) ---
    completed_score = len(done) + 0.5 * len(partial)
    adherence = _rate(completed_score, len(planned_days))

    # --- 볼륨과 운동별 기록 ---
    total_volume = 0
    total_sets = 0
    records = {}

    for log in logs_by_index.values():
        for entry in log.sets:
            total_volume += entry.weight_kg * entry.reps
            total_sets += 1

            record = records.setdefault(entry.exercise_name, {
                "name": entry.exercise_name,
                "sets": 0,
                "maxWeight": 0.0,
                "repsAtMax": 0,
                "maxReps": 0,
                "volume": 0.0,
            })
            record["sets"] += 1
            record["volume"] += entry.weight_kg * entry.reps
            record["maxReps"] = max(record["maxReps"], entry.reps)

            # 최고 중량과 그때의 횟수를 함께 남긴다.
            if entry.weight_kg > record["maxWeight"]:
                record["maxWeight"] = entry.weight_kg
                record["repsAtMax"] = entry.reps
            elif entry.weight_kg == record["maxWeight"]:
                record["repsAtMax"] = max(record["repsAtMax"], entry.reps)

    exercise_records = []
    for record in records.values():
        # 기록한 무게가 전부 0이면 맨몸 운동으로 보고 횟수를 대표값으로 쓴다.
        bodyweight = record["maxWeight"] == 0
        exercise_records.append({
            "name": record["name"],
            "sets": record["sets"],
            "bodyweight": bodyweight,
            "maxWeight": round(record["maxWeight"], 1),
            "repsAtMax": record["repsAtMax"],
            "maxReps": record["maxReps"],
            "volume": round(record["volume"]),
            "best": (
                f"최고 {record['maxReps']}회"
                if bodyweight
                else f"최고 {round(record['maxWeight'], 1)}kg × {record['repsAtMax']}회"
            ),
        })

    # 중량 운동을 먼저, 그 안에서는 무게가 높은 순으로.
    exercise_records.sort(key=lambda item: (item["bodyweight"], -item["maxWeight"], -item["maxReps"]))

    # --- 지난주 볼륨과 비교 ---
    prev_volume = 0
    for log in prev_workout_logs or []:
        for entry in log.sets:
            prev_volume += entry.weight_kg * entry.reps

    volume_change = (
        round((total_volume - prev_volume) / prev_volume * 100) if prev_volume else None
    )

    # --- 요일별 계획/기록 ---
    daily = []
    for index in range(7):
        day = planned_by_index.get(index)
        log = logs_by_index.get(index)
        log_date = week_start + timedelta(days=index)
        day_meals = [row for row in meal_logs if row.log_date == log_date]
        actual_macros = _macro_sum(day_meals)

        daily.append({
            "day": DAYS[index],
            "date": log_date.isoformat(),
            "isRestDay": day.is_rest if day else True,
            "focus": day.focus if day else "",
            "intensity": day.intensity if day else "rest",
            "workoutStatus": log.status if log else ("rest" if (day and day.is_rest) else "none"),
            "rpe": log.rpe if log else None,
            "volume": round(
                sum(entry.weight_kg * entry.reps for entry in log.sets) if log else 0
            ),
            "plannedCalories": day.meal.calories if day and day.meal else 0,
            "actualCalories": actual_macros["calories"],
            "plannedProtein": day.meal.protein if day and day.meal else 0,
            "actualProtein": actual_macros["protein"],
            "mealCount": len(day_meals),
        })

    # --- 영양: 계획 대비 실제 ---
    # 기록하지 않은 날까지 분모에 넣으면 달성률이 실제보다 낮게 나온다.
    # 그래서 비교는 '기록이 있는 날'끼리만 하고, 주 전체 계획량은 따로 보여준다.
    logged_dates = {row.log_date for row in meal_logs}
    logged_indexes = {
        (log_date - week_start).days for log_date in logged_dates
    }

    full_week = {"calories": 0, "protein": 0, "carbs": 0, "fat": 0}
    planned_macros = {"calories": 0, "protein": 0, "carbs": 0, "fat": 0}
    for day in plan.days:
        if not day.meal:
            continue
        for key in full_week:
            value = getattr(day.meal, key)
            full_week[key] += value
            if day.day_index in logged_indexes:
                planned_macros[key] += value

    actual_macros = _macro_sum(meal_logs)
    logged_days = len(logged_dates)

    nutrition = {
        "planned": planned_macros,
        "plannedFullWeek": full_week,
        "actual": actual_macros,
        "loggedDays": logged_days,
        "rates": {
            key: _rate(actual_macros[key], planned_macros[key]) for key in planned_macros
        },
    }

    rpes = [log.rpe for log in logs_by_index.values() if log.rpe]
    avg_rpe = round(sum(rpes) / len(rpes), 1) if rpes else None

    return {
        "weekStart": week_start.isoformat(),
        "planTitle": plan.title,
        "workout": {
            "plannedSessions": len(planned_days),
            "done": len(done),
            "partial": len(partial),
            "missed": len(missed),
            "adherence": adherence,
            "totalVolume": round(total_volume),
            "prevVolume": round(prev_volume),
            "volumeChange": volume_change,
            "totalSets": total_sets,
            "avgRpe": avg_rpe,
            "records": exercise_records,
        },
        "nutrition": nutrition,
        "daily": daily,
        "insights": build_insights(adherence, nutrition, daily, avg_rpe, logged_days, tone),
        "tone": tone,
    }


def build_insights(adherence, nutrition, daily, avg_rpe, logged_days, tone="direct"):
    """숫자에서 바로 읽히지 않는 해석과 다음 주 제안."""
    insights = []

    # 1) 수행률
    if adherence >= 90:
        insights.append({
            "kind": "good",
            "title": f"계획의 {adherence}%를 소화했습니다",
            "detail": "이 정도면 다음 주에 볼륨을 5~10% 올려도 회복이 따라옵니다.",
        })
    elif adherence >= 60:
        insights.append({
            "kind": "info",
            "title": f"수행률 {adherence}%",
            "detail": "나쁘지 않습니다. 빠진 세션이 특정 요일에 몰리는지 아래 요일별 표를 확인하세요.",
        })
    else:
        insights.append({
            "kind": "warn",
            "title": f"수행률이 {adherence}%로 낮습니다",
            "detail": "계획 자체가 일정에 비해 과할 가능성이 큽니다. 훈련일을 하루 줄이거나 "
                      "세션당 시간을 짧게 잡는 편이 완주율에 유리합니다.",
        })

    # 2) 반복해서 빠지는 요일
    missed_days = [item["day"] for item in daily if item["workoutStatus"] == "missed"]
    if len(missed_days) >= 2:
        insights.append({
            "kind": "warn",
            "title": f"{', '.join(missed_days)}요일에 빠짐이 몰렸습니다",
            "detail": "그 요일은 애초에 휴식일로 두고 다른 요일로 옮기는 편이 현실적입니다.",
        })

    # 3) 식단 기록 자체가 부족한 경우
    if logged_days == 0:
        insights.append({
            "kind": "info",
            "title": "식단 기록이 없습니다",
            "detail": "기록이 없으면 영양 분석을 할 수 없습니다. 하루 한 끼라도 남겨보세요.",
        })
    else:
        if logged_days < 5:
            insights.append({
                "kind": "info",
                "title": f"식단을 {logged_days}일 기록했습니다",
                "detail": "달성률은 기록한 날끼리만 비교한 값입니다. 기록일이 늘수록 정확해집니다.",
            })

        protein_rate = nutrition["rates"]["protein"]
        calorie_rate = nutrition["rates"]["calories"]

        if protein_rate < 80:
            insights.append({
                "kind": "warn",
                "title": f"단백질 달성률 {protein_rate}%",
                "detail": "근육 유지에 필요한 양에 못 미칩니다. 매 끼니에 손바닥 크기 단백질을 "
                          "먼저 배치하세요.",
            })
        elif protein_rate >= 95:
            insights.append({
                "kind": "good",
                "title": f"단백질 달성률 {protein_rate}%",
                "detail": "가장 중요한 지표를 지켰습니다. 열량이 흔들려도 이건 유지하세요.",
            })

        if calorie_rate >= 115:
            insights.append({
                "kind": "warn",
                "title": f"열량이 계획 대비 {calorie_rate}%",
                "detail": "간식과 음료를 포함해 기록했는지 확인하고, 다음 주는 탄수화물부터 조정하세요.",
            })
        elif calorie_rate <= 80:
            insights.append({
                "kind": "warn",
                "title": f"열량이 계획 대비 {calorie_rate}%에 그쳤습니다",
                "detail": "적게 먹는 것이 항상 좋은 것은 아닙니다. 과한 적자는 근손실과 "
                          "요요로 이어집니다.",
            })

    # 4) 체감 강도
    if avg_rpe is not None:
        if avg_rpe >= 8.5:
            insights.append({
                "kind": "warn",
                "title": f"평균 체감 강도 {avg_rpe}/10",
                "detail": "매 세션을 한계까지 밀고 있습니다. 다음 주는 한 세션을 의도적으로 "
                          "가볍게 가져가세요.",
            })
        elif avg_rpe <= 5:
            insights.append({
                "kind": "info",
                "title": f"평균 체감 강도 {avg_rpe}/10",
                "detail": "여유가 있습니다. 중량이나 세트를 조금 올려도 됩니다.",
            })

    return _apply_tone(insights, tone, adherence)


def _apply_tone(insights, tone, adherence):
    """insight_tone 실험. 문구를 새로 쓰지 않고 배열 순서와 도입부만 바꾼다.

    direct    : 고쳐야 할 것부터 (경고 → 정보 → 칭찬)
    supportive: 잘한 것부터 (칭찬 → 정보 → 경고) + 격려 도입부
    """
    if tone != "supportive":
        order = {"warn": 0, "info": 1, "good": 2}
        return sorted(insights, key=lambda item: order.get(item["kind"], 1))

    order = {"good": 0, "info": 1, "warn": 2}
    ordered = sorted(insights, key=lambda item: order.get(item["kind"], 1))

    lead = {
        "kind": "good",
        "title": "이번 주도 기록을 남겼습니다",
        "detail": "완벽한 주는 없습니다. 아래는 다음 주에 하나씩 손보면 되는 것들입니다.",
    }
    if adherence >= 90:
        lead["title"] = "이번 주 계획을 거의 그대로 지켰습니다"
        lead["detail"] = "이 흐름을 유지하는 것이 어떤 프로그램보다 중요합니다."

    return [lead] + ordered
