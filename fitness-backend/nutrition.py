"""열량/매크로 계산과 운동 강도별 하루 영양 목표 매칭."""

ACTIVITY_BY_FREQUENCY = {
    "주 2일": 1.375,
    "주 3일": 1.45,
    "주 4일": 1.525,
    "주 5일 이상": 1.6,
}

DURATION_BONUS = {
    "30분 이하": -0.025,
    "45분~1시간": 0.0,
    "1시간 30분 이상": 0.05,
}

# 목표별 열량 조정 계수와 체중 1kg당 단백질(g)
GOAL_PROFILE = {
    "체중 감량": {"calorie_factor": 0.82, "protein_per_kg": 2.0, "fat_ratio": 0.27},
    "근육량 증가": {"calorie_factor": 1.10, "protein_per_kg": 1.8, "fat_ratio": 0.25},
    "기초 체력 향상": {"calorie_factor": 1.0, "protein_per_kg": 1.5, "fat_ratio": 0.28},
    "자세 교정 및 코어 강화": {"calorie_factor": 0.98, "protein_per_kg": 1.6, "fat_ratio": 0.28},
}

# 하루 운동 강도 → 탄수화물/열량 배분 계수 (주간 총량은 유지한 채 요일별로 순환)
INTENSITY_FACTOR = {
    "high": {"calories": 1.10, "carbs": 1.25},
    "moderate": {"calories": 1.0, "carbs": 1.0},
    "low": {"calories": 0.95, "carbs": 0.88},
    "rest": {"calories": 0.90, "carbs": 0.75},
}

INTENSITY_LABEL = {
    "high": "고강도",
    "moderate": "중강도",
    "low": "저강도",
    "rest": "휴식",
}


def bmr_mifflin(sex, age, height_cm, weight_kg):
    """Mifflin-St Jeor 기초대사량."""
    base = 10 * weight_kg + 6.25 * height_cm - 5 * age
    return base + 5 if sex == "남성" else base - 161


def daily_baseline(profile, restrictions=None):
    """온보딩 응답 → 하루 기준 열량과 매크로.

    안전 점검(safety.check_profile)이 건 제한을 그대로 반영한다.
    """
    from safety import clamp_calories  # 순환 import 방지를 위해 지역 import

    restrictions = restrictions or {}

    bmr = bmr_mifflin(profile.sex, profile.age, profile.height, profile.weight)
    activity = ACTIVITY_BY_FREQUENCY.get(profile.frequency, 1.45)
    activity += DURATION_BONUS.get(profile.duration, 0.0)
    tdee = bmr * activity

    goal = GOAL_PROFILE.get(profile.goal, GOAL_PROFILE["기초 체력 향상"])
    factor = goal["calorie_factor"]
    if restrictions.get("no_deficit"):
        factor = max(factor, 1.0)
    calories = tdee * factor

    # 성별 하한선과 기초대사량 아래로는 내려가지 않게 막는다.
    calories = max(clamp_calories(calories, profile, restrictions), bmr)

    protein_g = profile.weight * goal["protein_per_kg"]
    fat_g = calories * goal["fat_ratio"] / 9
    carbs_g = max((calories - protein_g * 4 - fat_g * 9) / 4, 60)

    return {
        "bmr": round(bmr),
        "tdee": round(tdee),
        "calories": round(calories),
        "protein": round(protein_g),
        "carbs": round(carbs_g),
        "fat": round(fat_g),
    }


def macros_for_intensity(baseline, intensity):
    """강도별 하루 목표. 단백질은 고정, 탄수화물을 순환시키고 지방으로 열량을 맞춘다."""
    factor = INTENSITY_FACTOR.get(intensity, INTENSITY_FACTOR["moderate"])
    calories = baseline["calories"] * factor["calories"]
    protein = baseline["protein"]
    carbs = baseline["carbs"] * factor["carbs"]
    fat = max((calories - protein * 4 - carbs * 4) / 9, baseline["fat"] * 0.6)

    return {
        "calories": round(protein * 4 + carbs * 4 + fat * 9),
        "protein": round(protein),
        "carbs": round(carbs),
        "fat": round(fat),
    }


def weekly_total(schedule):
    total = {"calories": 0, "protein": 0, "carbs": 0, "fat": 0}
    for day in schedule:
        for key in total:
            total[key] += day["meal"][key]
    return total


# 강도별 식단 템플릿. 운동 목적(근비대/감량 등)이 아니라 그날의 강도에 맞춘다.
MEAL_TEMPLATES = {
    "high": {
        "target": "훈련량이 많은 날 · 탄수화물 충전 + 단백질 최대",
        "breakfast": "오트밀 80g, 달걀 3개, 바나나",
        "lunch": "잡곡밥 210g, 닭가슴살 200g, 나물 2종",
        "dinner": "고구마 200g, 소고기 살코기 150g, 구운 채소",
        "snack": "운동 전 바나나 1개 / 운동 후 유청단백 1스쿱 + 우유",
    },
    "moderate": {
        "target": "기본 유지일 · 단백질 우선, 탄수화물 보통",
        "breakfast": "그릭요거트 200g, 견과류 20g, 블루베리",
        "lunch": "현미밥 180g, 연어 또는 두부 150g, 샐러드",
        "dinner": "닭안심 180g, 채소볶음, 감자 150g",
        "snack": "운동 후 단백질 25~30g (닭가슴살 또는 프로틴)",
    },
    "low": {
        "target": "가벼운 날 · 탄수화물 약간 낮추고 채소 늘리기",
        "breakfast": "달걀 3개, 통밀빵 1쪽, 방울토마토",
        "lunch": "현미밥 130g, 흰살생선 180g, 나물",
        "dinner": "두부 200g, 대용량 샐러드, 올리브유 1큰술",
        "snack": "무가당 요거트 또는 삶은 달걀 2개",
    },
    "rest": {
        "target": "휴식일 · 열량은 낮추되 단백질은 그대로 유지",
        "breakfast": "달걀 2개, 사과, 아메리카노",
        "lunch": "샐러드볼(닭가슴살 150g), 통곡물 크래커",
        "dinner": "된장국, 두부, 나물 3종, 현미밥 120g",
        "snack": "카세인 단백 또는 코티지 치즈",
    },
}


def meal_for_day(baseline, intensity):
    template = MEAL_TEMPLATES[intensity]
    macros = macros_for_intensity(baseline, intensity)
    return {**template, **macros}
