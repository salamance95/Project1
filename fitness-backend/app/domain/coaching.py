"""일정 재조정(기능 4)과 치트데이/외식 보정(기능 5) 로직."""

import copy

from app.domain.exercises import LIGHT_WALK
from app.domain.nutrition import INTENSITY_LABEL, macros_for_intensity, meal_for_day, weekly_total

DAYS = ["월", "화", "수", "목", "금", "토", "일"]

RECOVERY_WORKOUT = {
    "focus": "회복 및 보정",
    "exercises": [LIGHT_WALK, "전신 스트레칭 10분", "수면 7시간 확보"],
}


# ---------------------------------------------------------------- 일정 재조정

def _day_index(schedule, day):
    for index, item in enumerate(schedule):
        if item["day"] == day:
            return index
    return -1


def reschedule(schedule, baseline, missed_day, locked_days=()):
    """못 한 운동을 이번 주 안에서 뒤로 밀어 재배치한다.

    - 미수행일 이후의 가장 가까운 휴식일을 1순위 목적지로 삼는다.
    - 휴식일이 없으면 이후의 가장 가벼운(low/moderate) 훈련일과 자리를 바꾼다.
    - 이후에 남은 날이 없으면 이번 주 소화가 불가능하므로 다음 주 이월로 표시한다.
    """
    plan = copy.deepcopy(schedule)
    index = _day_index(plan, missed_day)
    if index < 0 or plan[index].get("isRestDay"):
        return plan, "재배치할 운동이 없습니다."

    missed_session = copy.deepcopy(plan[index])
    later = [
        i for i in range(index + 1, len(plan))
        if plan[i]["day"] not in locked_days
    ]

    rest_targets = [i for i in later if plan[i].get("isRestDay")]
    light_targets = [i for i in later if plan[i].get("intensity") in ("low", "moderate")]
    targets = rest_targets or light_targets or later

    # 미수행일 자리는 회복일로 비운다.
    plan[index] = {
        **plan[index],
        "isRestDay": True,
        "intensity": "rest",
        "intensityLabel": INTENSITY_LABEL["rest"],
        "workout": RECOVERY_WORKOUT,
        "meal": meal_for_day(baseline, "rest"),
        "status": "미수행",
        "note": None,
    }

    if not targets:
        plan[index]["note"] = (
            f"{missed_day}요일 세션은 이번 주에 남은 날이 없어 다음 주 첫 훈련일로 이월합니다."
        )
        return plan, (
            f"{missed_day}요일 '{missed_session['workout']['focus']}'는 이번 주에 배치할 자리가 "
            "없어 다음 주 첫 세션으로 이월했습니다. 이번 주 남은 기간은 열량을 유지하세요."
        )

    target = targets[0]
    displaced = plan[target]
    target_day = displaced["day"]

    plan[target] = {
        **missed_session,
        "day": target_day,
        "status": "재배치됨",
        "note": f"{missed_day}요일 미수행분을 {target_day}요일로 이동",
        "meal": meal_for_day(baseline, missed_session["intensity"]),
    }

    # 원래 그날 훈련이 있었다면 사라지지 않도록 미수행일 자리로 당겨 놓는다.
    if not displaced.get("isRestDay"):
        plan[index] = {
            **displaced,
            "day": missed_day,
            "status": "교대됨",
            "note": f"{target_day}요일 세션과 자리를 바꿨습니다.",
            "meal": meal_for_day(baseline, displaced["intensity"]),
        }
        message = (
            f"{missed_day}요일과 {target_day}요일 세션을 서로 바꿨습니다. "
            "주간 총 볼륨은 그대로 유지됩니다."
        )
    else:
        message = (
            f"{missed_day}요일 '{missed_session['workout']['focus']}'를 휴식일이던 "
            f"{target_day}요일로 옮겼습니다. {missed_day}요일은 회복일로 전환했습니다."
        )

    return plan, message


# ------------------------------------------------------- 치트데이 / 외식 보정

# 1회 기준 추정 초과분(평소 저녁 대비). 열량은 kcal, 나머지는 g.
EVENT_LOAD = {
    "한식(백반/찌개)": {"calories": 250, "carbs": 40, "fat": 8, "protein": 10},
    "고기·구이": {"calories": 700, "carbs": 30, "fat": 55, "protein": 45},
    "중식": {"calories": 900, "carbs": 110, "fat": 45, "protein": 20},
    "일식(초밥/돈카츠)": {"calories": 600, "carbs": 90, "fat": 25, "protein": 25},
    "양식(파스타/피자)": {"calories": 800, "carbs": 100, "fat": 38, "protein": 25},
    "치킨·야식": {"calories": 950, "carbs": 70, "fat": 60, "protein": 45},
    "뷔페": {"calories": 1200, "carbs": 130, "fat": 60, "protein": 50},
}

ALCOHOL_LOAD = {
    "없음": {"calories": 0, "carbs": 0, "fat": 0, "protein": 0},
    "1~2잔": {"calories": 200, "carbs": 12, "fat": 0, "protein": 0},
    "3~5잔": {"calories": 500, "carbs": 30, "fat": 0, "protein": 0},
    "6잔 이상": {"calories": 900, "carbs": 55, "fat": 0, "protein": 0},
}

CUISINE_TACTICS = {
    "한식(백반/찌개)": [
        "국물은 건더기 위주로 먹고 국물 자체는 절반만 남기세요.",
        "밥은 공기의 2/3만, 나물과 단백질 반찬을 먼저 비우세요.",
    ],
    "고기·구이": [
        "삼겹살보다 목살·항정살, 가능하면 안심 부위를 고르세요.",
        "쌈채소를 먼저 세 번 집고, 고기 1인분(150g)을 기준선으로 잡으세요.",
        "볶음밥·냉면 마무리는 생략하거나 반만 드세요.",
    ],
    "중식": [
        "탕수육·유린기 같은 튀김은 소스를 찍어 먹는 방식으로 바꾸세요.",
        "짜장·짬뽕은 면을 절반 남기고 건더기를 챙기세요.",
    ],
    "일식(초밥/돈카츠)": [
        "초밥은 10피스를 상한으로 잡고 사시미를 먼저 드세요.",
        "튀김옷은 벗기고, 소스는 붓지 말고 찍어 드세요.",
    ],
    "양식(파스타/피자)": [
        "크림보다 토마토·오일 베이스를 고르세요.",
        "피자는 2조각까지, 가장자리 도우는 남기고 샐러드를 먼저 드세요.",
    ],
    "치킨·야식": [
        "후라이드보다 구운 치킨, 양념보다 소금구이를 고르세요.",
        "먹을 양을 접시에 미리 덜고 봉지째 두지 마세요.",
    ],
    "뷔페": [
        "첫 접시는 단백질과 채소로만 채우고, 접시 수를 3개로 제한하세요.",
        "디저트는 한 종류만 골라 맛보는 수준으로 끝내세요.",
    ],
}

ALCOHOL_TACTICS = {
    "없음": [],
    "1~2잔": ["술 한 잔마다 물 한 잔을 교대로 드세요."],
    "3~5잔": [
        "술 한 잔마다 물 한 잔, 안주는 튀김 대신 단백질 위주로 고르세요.",
        "음주 당일에는 단백질 합성이 떨어지므로 다음 날 고강도 훈련은 피하세요.",
    ],
    "6잔 이상": [
        "이 정도 음주는 다음 날 훈련 질까지 떨어뜨립니다. 잔 수를 미리 정해두세요.",
        "귀가 후 물 500ml와 단백질 20g을 챙기면 다음 날 회복이 빠릅니다.",
        "다음 날 세션은 강도를 낮추고 걷기와 스트레칭으로 대체하세요.",
    ],
}


def _clamp_day(meal, baseline, floor_ratio=0.75):
    """하루 열량이 기준선의 75% 아래로 떨어지지 않게 막는다."""
    floor = baseline["calories"] * floor_ratio
    if meal["calories"] >= floor:
        return meal
    deficit = floor - meal["calories"]
    meal = dict(meal)
    meal["carbs"] = round(meal["carbs"] + deficit / 4)
    meal["calories"] = round(meal["protein"] * 4 + meal["carbs"] * 4 + meal["fat"] * 9)
    return meal


def apply_event(schedule, baseline, event):
    """회식/외식 일정을 반영하고 남은 요일에 주간 밸런스를 재분배한다."""
    plan = copy.deepcopy(schedule)
    index = _day_index(plan, event["day"])
    if index < 0:
        return plan, {"surplus": 0, "perDay": 0, "days": []}, []

    food = EVENT_LOAD.get(event.get("cuisine"), EVENT_LOAD["한식(백반/찌개)"])
    drink = ALCOHOL_LOAD.get(event.get("alcohol", "없음"), ALCOHOL_LOAD["없음"])
    surplus = {key: food[key] + drink[key] for key in food}

    # 1) 이벤트 당일: 낮 시간대를 미리 비워 초과분을 일부 흡수한다.
    target = plan[index]
    pre_cut = min(surplus["calories"] * 0.35, baseline["calories"] * 0.2)
    day_meal = dict(target["meal"])
    day_meal["carbs"] = round(max(day_meal["carbs"] - pre_cut / 4 * 0.7, 40))
    day_meal["fat"] = round(max(day_meal["fat"] - pre_cut / 9 * 0.3, baseline["fat"] * 0.5))
    day_meal["protein"] = round(day_meal["protein"] * 1.05)
    day_meal["calories"] = round(
        day_meal["protein"] * 4 + day_meal["carbs"] * 4 + day_meal["fat"] * 9
        + surplus["calories"]
    )
    day_meal["target"] = f"{event['type']} · {event.get('cuisine', '외식')} 대응일"
    day_meal["breakfast"] = "달걀 3개 + 그릭요거트 (단백질 선섭취, 탄수화물 최소)"
    day_meal["lunch"] = "닭가슴살 또는 흰살생선 + 샐러드, 밥은 절반"
    day_meal["dinner"] = f"{event.get('cuisine', '외식')} — 아래 실전 가이드대로 대응"
    day_meal["note"] = f"당일 낮 식사에서 약 {round(pre_cut)}kcal를 미리 비워둡니다."

    plan[index] = {
        **target,
        "meal": day_meal,
        "event": event,
        "status": "치트데이",
        "note": f"{event['type']} 일정 반영 (추정 초과 +{surplus['calories']}kcal)",
    }

    # 2) 남은 요일에 초과분을 분산 보정한다. 지난 요일은 되돌릴 수 없으므로 제외.
    remaining = [
        i for i in range(index + 1, len(plan))
        if not plan[i].get("event")
    ]
    if not remaining:
        # 주 후반 일정이면 앞선 요일 대신 다음 주 이월로 안내한다.
        rebalance = {
            "surplus": surplus["calories"],
            "applied": 0,
            "carryOver": surplus["calories"],
            "perDay": 0,
            "days": [],
        }
    else:
        per_day = surplus["calories"] / len(remaining)
        applied = 0
        for i in remaining:
            meal = dict(plan[i]["meal"])
            before = meal["calories"]
            # 단백질은 유지하고 탄수화물 70% / 지방 30% 비율로 깎는다.
            meal["carbs"] = round(max(meal["carbs"] - per_day * 0.7 / 4, 50))
            meal["fat"] = round(max(meal["fat"] - per_day * 0.3 / 9, baseline["fat"] * 0.55))
            meal["calories"] = round(
                meal["protein"] * 4 + meal["carbs"] * 4 + meal["fat"] * 9
            )
            # 하루 열량이 지나치게 떨어지면 되돌린다. 굶기는 보정은 하지 않는다.
            meal = _clamp_day(meal, baseline)
            cut = before - meal["calories"]
            applied += cut
            meal["note"] = f"{event['day']}요일 {event['type']} 보정: {round(cut)}kcal 차감"
            plan[i] = {**plan[i], "meal": meal, "status": "보정됨"}
        rebalance = {
            "surplus": surplus["calories"],
            "applied": round(applied),
            "carryOver": max(round(surplus["calories"] - applied), 0),
            "perDay": round(applied / len(remaining)),
            "days": [plan[i]["day"] for i in remaining],
        }

    tactics = build_tactics(event, surplus, rebalance)
    return plan, rebalance, tactics


def build_tactics(event, surplus, rebalance):
    """사전/현장/사후 3단계 실전 대처법."""
    cuisine = event.get("cuisine", "한식(백반/찌개)")
    alcohol = event.get("alcohol", "없음")

    before = [
        "당일 아침·점심은 단백질과 채소 위주로, 탄수화물은 평소의 절반으로 줄이세요.",
        "출발 30분 전 물 500ml와 단백질 20g(요거트·삶은 달걀)로 공복감을 없애세요.",
    ]
    during = list(CUISINE_TACTICS.get(cuisine, [])) + list(ALCOHOL_TACTICS.get(alcohol, []))
    during.append("첫 10분은 채소와 단백질만 먹고 탄수화물은 뒤로 미루세요.")

    after = [
        "다음 날 체중이 1~2kg 늘어도 대부분 수분입니다. 열량을 추가로 굶지 마세요.",
        "다음 날 아침 20~30분 걷기로 혈당과 부기를 정리하세요.",
    ]
    if rebalance["days"]:
        after.append(
            f"초과 {surplus['calories']}kcal 중 {rebalance['applied']}kcal를 "
            f"{', '.join(rebalance['days'])}요일에 하루 약 {rebalance['perDay']}kcal씩 "
            "나눠 자동 보정했습니다. 단백질은 그대로 유지합니다."
        )
        if rebalance["carryOver"] > 0:
            after.append(
                f"남은 {rebalance['carryOver']}kcal는 더 깎으면 하루 열량이 너무 낮아져 "
                "보정하지 않았습니다. 다음 주 초반에 자연스럽게 상쇄됩니다."
            )
    else:
        after.append(
            "주 후반 일정이라 이번 주에는 남은 보정일이 없습니다. "
            f"초과 {surplus['calories']}kcal는 다음 주 초 3일에 나눠 반영하세요."
        )

    return [
        {"phase": "사전", "items": before},
        {"phase": "현장", "items": during},
        {"phase": "사후", "items": after},
    ]


def weekly_summary(schedule, baseline):
    total = weekly_total(schedule)
    planned = {
        key: round(macros_for_intensity(baseline, "moderate")[key] * 7)
        for key in ("calories", "protein", "carbs", "fat")
    }
    return {"actual": total, "reference": planned}
