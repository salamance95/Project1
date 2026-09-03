"""운동 소모 열량과 추천 중량 계산.

둘 다 추정이다. 소모 열량은 MET 기반이라 개인차가 크고, 추천 중량은 시작점일 뿐
그날 컨디션에 맞춰 조정해야 한다.
"""

# 강도별 MET (근력 운동 기준, 세트 사이 휴식 포함한 평균)
MET_BY_INTENSITY = {
    "high": 6.0,
    "moderate": 5.0,
    "low": 3.8,
    "rest": 2.5,
}

# 소요 시간을 기록하지 않았을 때 쓰는 기본값(분)
DEFAULT_MINUTES = {
    "30분 이하": 30,
    "45분~1시간": 50,
    "1시간 30분 이상": 85,
}


def burned_kcal(status, intensity, duration_min, weight_kg, fallback_minutes=50):
    """MET × 체중(kg) × 시간(h). 미수행이면 0."""
    if status == "missed":
        return 0

    minutes = duration_min or fallback_minutes
    if status == "partial":
        minutes = minutes * 0.5

    met = MET_BY_INTENSITY.get(intensity, MET_BY_INTENSITY["moderate"])
    return round(met * weight_kg * (minutes / 60.0))


# 세트 하나에 드는 시간(수행 + 휴식). 추가 소모를 시간으로 환산할 때 쓴다.
MINUTES_PER_SET = 3.0


def extra_burn(extra_sets, intensity, weight_kg):
    """계획보다 더 한 세트 수 → 추가 소모 열량."""
    if extra_sets <= 0:
        return 0

    met = MET_BY_INTENSITY.get(intensity, MET_BY_INTENSITY["moderate"])
    return round(met * weight_kg * (extra_sets * MINUTES_PER_SET / 60.0))


def default_minutes(duration_label):
    return DEFAULT_MINUTES.get(duration_label, 50)


# 체중 대비 대략적인 작업 중량 비율(10회 반복 기준).
# 덤벨 종목은 '한 손 무게' 기준이다.
BODYWEIGHT_RATIO = {
    "back_squat": 0.90,
    "goblet_squat": 0.25,
    "leg_press": 1.60,
    "deadlift": 1.10,
    "rdl": 0.80,
    "db_rdl": 0.30,
    "hip_thrust": 0.80,
    "bench_press": 0.70,
    "db_bench": 0.22,
    "chest_press_machine": 0.50,
    "ohp": 0.45,
    "db_shoulder_press": 0.15,
    "lateral_raise": 0.06,
    "barbell_row": 0.60,
    "db_row": 0.25,
    "seated_row": 0.50,
    "lat_pulldown": 0.55,
    "face_pull": 0.20,
    "walking_lunge": 0.20,
    "split_squat": 0.20,
    "step_up": 0.15,
}

LEVEL_FACTOR = {"입문": 0.55, "초보": 0.72, "중급": 1.0, "고급": 1.22}
STYLE_FACTOR = {"근력 중심": 1.15, "근비대 중심": 1.0, "체력 중심": 0.85}

# 덤벨은 보통 2.5kg, 바벨/머신은 5kg 단위로 끊어 쓴다.
DUMBBELL_SLUGS = {
    "goblet_squat", "db_rdl", "db_bench", "db_shoulder_press",
    "lateral_raise", "db_row", "hip_thrust", "walking_lunge", "split_squat", "step_up",
}


def _round_to(value, step):
    return round(value / step) * step


def recommended_weight(slug, weight_kg, level, style):
    """동작 slug → 추천 중량(kg). 맨몸 동작이면 None."""
    ratio = BODYWEIGHT_RATIO.get(slug)
    if not ratio:
        return None

    raw = weight_kg * ratio
    raw *= LEVEL_FACTOR.get(level, 1.0)
    raw *= STYLE_FACTOR.get(style, 1.0)

    step = 2.5 if slug in DUMBBELL_SLUGS else 5.0
    value = _round_to(raw, step)

    # 너무 가벼운 값은 의미가 없다.
    return max(value, step)


def parse_prescription(text):
    """'4세트 x 10회' → (4, 10). 유산소처럼 형식이 다르면 (None, None)."""
    import re

    match = re.search(r"(\d+)\s*세트\s*x\s*(\d+)\s*회", text or "")
    if not match:
        return None, None
    return int(match.group(1)), int(match.group(2))
