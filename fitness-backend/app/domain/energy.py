"""운동 소모 열량과 추천 중량 계산.

둘 다 추정이다. 소모 열량은 MET 기반이라 개인차가 크고, 추천 중량은 시작점일 뿐
그날 컨디션에 맞춰 조정해야 한다.
"""

import re

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


# 동작별 MET. 미국 스포츠의학회 Compendium of Physical Activities 값을 기준으로,
# 동원하는 근육량과 쉬는 시간을 감안해 잡았다.
#
# 같은 3세트라도 스쿼트와 레터럴 레이즈가 같은 열량을 태울 수는 없다.
# 큰 근육을 여러 개 쓰는 동작일수록 높고, 한 관절만 쓰는 고립 동작은 낮다.
MET_BY_SLUG = {
    # 하체 — 동원 근육이 가장 많다
    "back_squat": 6.0,
    "deadlift": 6.0,
    "rdl": 5.5,
    "db_rdl": 5.0,
    "goblet_squat": 5.0,
    "leg_press": 5.0,
    "box_squat": 4.5,
    "hip_thrust": 4.5,
    "glute_bridge": 3.5,
    "back_ext": 3.5,
    "walking_lunge": 5.5,
    "split_squat": 5.0,
    "step_up": 4.5,

    # 상체 밀기 — 맨몸 동작은 몸 전체를 지탱해 더 높다
    "bench_press": 5.0,
    "db_bench": 5.0,
    "chest_press_machine": 4.0,
    "pushup": 8.0,
    "ohp": 5.0,
    "db_shoulder_press": 4.5,
    "pike_pushup": 7.0,
    "lateral_raise": 3.0,

    # 상체 당기기
    "barbell_row": 5.5,
    "pullup": 8.0,
    "inverted_row": 5.0,
    "db_row": 4.5,
    "seated_row": 4.5,
    "lat_pulldown": 4.5,
    "band_pulldown": 3.5,
    "face_pull": 3.0,

    # 코어
    "mountain_climber": 8.0,
    "hanging_knee_raise": 4.0,
    "plank": 3.8,
    "dead_bug": 3.0,
    "pallof_press": 3.0,

    # 유산소
    "jump_rope": 12.0,
    "cycle": 7.0,
    "row_erg": 7.0,
    "incline_walk": 6.0,
}

# 마스터에 없는 동작을 위한 패턴별 기본값.
MET_BY_PATTERN = {
    "squat": 5.0,
    "hinge": 5.0,
    "lunge": 5.0,
    "push_h": 5.0,
    "push_v": 4.5,
    "pull_h": 4.5,
    "pull_v": 5.0,
    "core": 3.5,
    "cardio": 6.0,
}

DEFAULT_MET = 5.0


def met_for(item):
    """동작 → MET. 마스터에 없으면 패턴 기본값, 그것도 없으면 보통 근력 운동 기준."""
    if not item:
        return DEFAULT_MET
    return MET_BY_SLUG.get(item["slug"], MET_BY_PATTERN.get(item["pattern"], DEFAULT_MET))


def minutes_for_exercise(metric=None, sets=0, distance_km=0, speed_kmh=0, minutes=0):
    """운동 한 줄에 쓴 시간(분) 추정.

    세트 운동은 세트 수로, 거리 유산소는 거리와 평균 속도로 되짚는다.
    """
    if metric == "distance":
        total = (distance_km or 0) * max(sets or 1, 1)
        if total and speed_kmh:
            return total / speed_kmh * 60
        return minutes
    if metric == "time":
        return minutes
    return (sets or 0) * MINUTES_PER_SET


def exercise_kcal(entry, weight_kg):
    """운동 한 줄의 소모 열량. MET × 체중(kg) × 시간(h)."""
    minutes = minutes_for_exercise(
        metric=entry.get("metric"),
        sets=entry.get("sets", 0),
        distance_km=entry.get("distanceKm", 0) or 0,
        speed_kmh=entry.get("speedKmh", 0) or 0,
        minutes=entry.get("minutes", 0) or 0,
    )
    if minutes <= 0:
        return 0
    return round((entry.get("met") or DEFAULT_MET) * weight_kg * (minutes / 60))


def parse_distance(text):
    """'2.4km(20분)' → 2.4. 거리가 없으면 None."""
    match = re.search(r"([\d.]+)\s*km", text or "", re.IGNORECASE)
    return float(match.group(1)) if match else None


def parse_prescription(text):
    """'4세트 x 10회' → (4, 10). 유산소처럼 형식이 다르면 (None, None)."""
    import re

    match = re.search(r"(\d+)\s*세트\s*x\s*(\d+)\s*회", text or "")
    if not match:
        return None, None
    return int(match.group(1)), int(match.group(2))
