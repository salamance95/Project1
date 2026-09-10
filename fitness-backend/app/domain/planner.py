"""온보딩 응답 → 1주일 루틴 후보 생성."""

from app.domain.body import body_profile, fmt_number
from app.domain.energy import met_for, parse_distance
from app.domain.exercises import (
    LIGHT_WALK,
    ExerciseLibrary,
    build_session,
    metric_of,
    speed_of,
)
from app.domain.nutrition import (
    INTENSITY_LABEL,
    daily_baseline,
    meal_for_day,
    weekly_total,
)

DAYS = ["월", "화", "수", "목", "금", "토", "일"]

TRAINING_DAYS = {
    "주 2일": ["월", "목"],
    "주 3일": ["월", "수", "금"],
    "주 4일": ["월", "화", "목", "금"],
    "주 5일 이상": ["월", "화", "수", "금", "토"],
}

EXERCISE_COUNT = {
    "30분 이하": 3,
    "45분~1시간": 4,
    "1시간 30분 이상": 5,
}

# --------------------------------------------------------------------- 분할

AUTO_SPLIT = "자동 추천"
FULL_BODY = "무분할(전신)"

# sessions는 한 사이클에 도는 세션 수, minDays는 그 분할에 필요한 최소 훈련일.
SPLIT_OPTIONS = [
    {
        "id": AUTO_SPLIT,
        "label": "자동 추천",
        "sessions": 0,
        "minDays": 1,
        "desc": "경력·운동 일수·BMI로 알아서 고릅니다",
    },
    {"id": FULL_BODY, "label": FULL_BODY, "sessions": 1, "minDays": 2, "desc": "매 세션 전신을 한 번씩"},
    {"id": "2분할", "label": "2분할", "sessions": 2, "minDays": 2, "desc": "상체 / 하체"},
    {"id": "3분할", "label": "3분할", "sessions": 3, "minDays": 3, "desc": "푸시 / 풀 / 레그"},
    {
        "id": "4분할",
        "label": "4분할",
        "sessions": 4,
        "minDays": 4,
        "desc": "가슴·삼두 / 등·이두 / 어깨·코어 / 하체",
    },
    {
        "id": "5분할",
        "label": "5분할",
        "sessions": 5,
        "minDays": 5,
        "desc": "가슴 / 등 / 어깨 / 하체 / 팔·코어",
    },
]

# 각 세션은 (포커스 이름, 움직임 패턴 우선순위, 강도)
SPLIT_SESSIONS = {
    FULL_BODY: [
        ("전신 A", ["squat", "push_h", "pull_h", "core", "cardio"], "high"),
        ("전신 B", ["hinge", "push_v", "pull_v", "core", "cardio"], "moderate"),
        ("전신 C", ["lunge", "push_h", "pull_v", "core", "cardio"], "high"),
    ],
    "2분할": [
        ("상체", ["push_h", "pull_h", "push_v", "pull_v", "core"], "high"),
        ("하체", ["squat", "hinge", "lunge", "core", "cardio"], "high"),
    ],
    "3분할": [
        ("푸시(가슴/어깨/삼두)", ["push_h", "push_v", "push_h", "core", "cardio"], "high"),
        ("풀(등/이두)", ["pull_v", "pull_h", "pull_v", "core", "cardio"], "high"),
        ("레그(하체 전체)", ["squat", "hinge", "lunge", "core", "cardio"], "high"),
    ],
    "4분할": [
        ("가슴/삼두", ["push_h", "push_h", "push_v", "core", "cardio"], "high"),
        ("등/이두", ["pull_v", "pull_h", "pull_h", "core", "cardio"], "high"),
        ("어깨/코어", ["push_v", "push_v", "core", "core", "cardio"], "moderate"),
        ("하체", ["squat", "hinge", "lunge", "core", "cardio"], "high"),
    ],
    "5분할": [
        ("가슴", ["push_h", "push_h", "push_h", "core", "cardio"], "high"),
        ("등", ["pull_v", "pull_h", "pull_v", "core", "cardio"], "high"),
        ("어깨", ["push_v", "push_v", "push_v", "core", "cardio"], "moderate"),
        ("하체", ["squat", "hinge", "lunge", "core", "cardio"], "high"),
        ("팔/코어", ["push_h", "pull_h", "core", "core", "cardio"], "moderate"),
    ],
}

# 경력별로 무리 없이 소화할 수 있는 최대 분할 수. 1이면 전신.
LEVEL_SPLIT_CAP = {
    "입문": 1,
    "초보": 2,
    "중급": 3,
    "고급": 5,
}

# --------------------------------------------------------------------- 후보
# 구조(어떤 부위를 언제)는 분할이 정하고, 후보는 같은 분할을 얼마나 무겁게
# 소화할지(동작 수·강도·유산소 배치)를 정한다.

VARIANTS = [
    {
        "id": "balanced",
        "title": "균형 성장형",
        "count_offset": 0,
        "cardio_first": False,
        "ease_intensity": False,
        "description": "고른 볼륨으로 근력과 체력을 함께 올립니다. 하루를 빠뜨려도 회복이 쉬운 구성입니다.",
        "guide": [
            "운동 전 5분 관절 가동성 워밍업",
            "첫 세트는 목표 무게의 60%로 예열",
            "운동 후 30분 안에 단백질 25~35g 섭취",
        ],
    },
    {
        "id": "focused",
        "title": "부위 집중형",
        "count_offset": 1,
        "cardio_first": False,
        "ease_intensity": False,
        "description": (
            "세션마다 동작을 하나 더 얹어 그날 부위에 볼륨을 몰아줍니다. "
            "정해진 요일을 지킬 수 있을 때 성장이 가장 빠릅니다."
        ),
        "guide": [
            "마지막 세트는 2회 남기고 종료(RIR 2)",
            "같은 부위는 최소 48시간 간격 유지",
            "고강도일 전날은 수면 7시간 이상 확보",
        ],
    },
    {
        "id": "sustainable",
        "title": "지속 가능형",
        "count_offset": -1,
        "cardio_first": True,
        "ease_intensity": True,
        "description": (
            "세션당 동작 수와 강도를 낮추고 유산소를 앞에 뒀습니다. "
            "일정이 자주 흔들리는 사람에게 완주율이 가장 높습니다."
        ),
        "guide": [
            "세트 사이 휴식은 45~60초로 짧게",
            "통증이 있는 동작은 가동 범위를 줄여 수행",
            "운동을 놓친 날은 20분 걷기로 대체",
        ],
    },
]

COACHING_BY_GOAL = {
    "체중 감량": [
        "주간 열량 적자는 하루 단위가 아니라 7일 평균으로 관리하세요.",
        "단백질을 먼저 채우면 같은 열량에서도 포만감이 오래갑니다.",
        "체중은 매일 재되 7일 이동평균으로만 판단하세요.",
    ],
    "근육량 증가": [
        "고강도일에는 탄수화물을 늘려 훈련 볼륨을 지키세요.",
        "주당 총 세트 수가 늘어나고 있는지 2주마다 확인하세요.",
        "체중이 2주간 정체되면 하루 200kcal씩 올리세요.",
    ],
    "기초 체력 향상": [
        "유산소는 대화가 가능한 강도로 시간을 먼저 늘리세요.",
        "훈련일 사이에 최소 하루는 완전 휴식을 배치하세요.",
        "주 1회는 평소보다 10분 긴 세션으로 지구력을 자극하세요.",
    ],
    "자세 교정 및 코어 강화": [
        "코어 동작은 횟수보다 호흡과 자세 유지 시간을 우선하세요.",
        "앉아 있는 시간이 길면 1시간마다 힙 힌지 스트레칭을 넣으세요.",
        "당기는 운동을 미는 운동보다 한 세트 더 배치하세요.",
    ],
}


def _rest_meal_note(profile):
    if profile.goal == "체중 감량":
        return "휴식일에도 단백질은 유지하고 탄수화물만 줄이세요."
    if profile.goal == "근육량 증가":
        return "휴식일은 회복일입니다. 열량을 과하게 줄이지 마세요."
    return "휴식일에는 수분과 수면을 우선하세요."


def split_size(split):
    """분할 이름 → 한 사이클 세션 수. 모르는 값이면 0(= 자동)."""
    for option in SPLIT_OPTIONS:
        if option["id"] == split:
            return option["sessions"]
    return 0


def recommend_split(profile, training_day_count, body=None):
    """경력·훈련일·BMI로 분할을 고른다.

    경력이 짧거나 체중 부담이 크면 같은 부위를 자주 쓰도록 분할 수를 낮춘다.
    """
    body = body or body_profile(profile)
    if training_day_count <= 2:
        return FULL_BODY

    cap = min(
        LEVEL_SPLIT_CAP.get(profile.level, 1),
        body["splitCap"],
        training_day_count,
    )
    # 체중 감량은 부위별 볼륨보다 주당 운동 빈도가 중요하다.
    if profile.goal == "체중 감량":
        cap = min(cap, 3)

    return FULL_BODY if cap <= 1 else f"{cap}분할"


def _resolve_split(profile, training_day_count, body):
    """요청한 분할이 훈련일 수를 넘으면 가능한 만큼으로 줄인다."""
    requested = getattr(profile, "split", None) or AUTO_SPLIT

    if requested == AUTO_SPLIT or requested not in SPLIT_SESSIONS:
        return recommend_split(profile, training_day_count, body), True, False

    if split_size(requested) > training_day_count:
        fallback = FULL_BODY if training_day_count <= 2 else f"{training_day_count}분할"
        return fallback, False, True

    return requested, False, False


def _sessions_for_split(split, training_day_count):
    """분할 세션을 훈련일 수만큼 돌린다. 사이클보다 날이 많으면 처음부터 다시 돈다."""
    cycle = SPLIT_SESSIONS.get(split, SPLIT_SESSIONS[FULL_BODY])
    return [cycle[index % len(cycle)] for index in range(training_day_count)]


def _cardio_first(patterns):
    """유산소를 세션 앞쪽(동작 수를 줄여도 남는 자리)으로 당긴다."""
    if "cardio" not in patterns or patterns.index("cardio") <= 2:
        return patterns
    rest = [pattern for pattern in patterns if pattern != "cardio"]
    return rest[:2] + ["cardio"] + rest[2:]


def plan_split(profile, training_day_count):
    """저장된 설문으로 실제 적용될 분할 이름을 되돌린다."""
    split, _auto, _adjusted = _resolve_split(
        profile, training_day_count, body_profile(profile)
    )
    return split


def build_plan(profile, variant, library=None, restrictions=None, overrides=None):
    """overrides로 자동 재생성(progression)이 훈련일과 볼륨을 조정할 수 있다."""
    library = library or ExerciseLibrary.from_seed()
    restrictions = restrictions or {}
    overrides = overrides or {}

    baseline = daily_baseline(profile, restrictions)
    body = body_profile(profile)

    frequency = overrides.get("frequency") or profile.frequency
    training_days = overrides.get("trainingDays") or TRAINING_DAYS.get(
        frequency, TRAINING_DAYS["주 3일"]
    )

    split, auto, adjusted = _resolve_split(profile, len(training_days), body)
    sessions = _sessions_for_split(split, len(training_days))

    # BMI가 높으면 관절 부담이 큰 동작을 빼고 강도를 한 단계 낮춘다.
    limits = dict(restrictions)
    limits["no_impact"] = bool(restrictions.get("no_impact") or body["adjustments"]["noImpact"])

    count = EXERCISE_COUNT.get(profile.duration, 4) + variant["count_offset"]
    count += overrides.get("countOffset", 0)
    count += body["adjustments"]["countOffset"]
    count = max(3, min(count, 5))

    session_by_day = dict(zip(training_days, sessions))
    schedule = []

    for day in DAYS:
        if day not in session_by_day:
            meal = meal_for_day(baseline, "rest")
            schedule.append({
                "day": day,
                "isRestDay": True,
                "intensity": "rest",
                "intensityLabel": INTENSITY_LABEL["rest"],
                "workout": {
                    "focus": "휴식 및 회복",
                    "exercises": [LIGHT_WALK, "전신 스트레칭 10분"],
                    "items": [],
                },
                "meal": {**meal, "note": _rest_meal_note(profile)},
            })
            continue

        focus, patterns, intensity = session_by_day[day]
        # 안전 점검이나 BMI 보정으로 고강도 제한이 걸리면 강도를 한 단계 낮춘다.
        cap_high = (
            limits.get("no_high_intensity")
            or body["adjustments"]["capHighIntensity"]
            or variant["ease_intensity"]
        )
        if cap_high and intensity == "high":
            intensity = "moderate"

        if body["adjustments"]["cardioFirst"] or variant["cardio_first"]:
            patterns = _cardio_first(patterns)

        session = build_session(patterns[:count], profile, library, limits)
        schedule.append({
            "day": day,
            "isRestDay": False,
            "intensity": intensity,
            "intensityLabel": INTENSITY_LABEL[intensity],
            "workout": {
                "focus": focus,
                # 표시 형식: 동작명(부위) 세트x횟수
                "exercises": [
                    f"{name}({item['muscle']}) {reps}" for item, name, reps in session
                ],
                "items": [
                    {
                        "exerciseId": item.get("id"),
                        "slug": item["slug"],
                        "name": name,
                        "muscle": item["muscle"],
                        "equipment": item.get("equipment"),
                        "prescription": reps,
                        # 무엇으로 재는 운동인가. 화면의 입력 칸이 이 값을 보고 달라진다.
                        "metric": metric_of(item),
                        "distanceKm": parse_distance(reps),
                        # 소모 열량 추정에 쓴다. 동작마다 다르다.
                        "met": met_for(item),
                        "speedKmh": speed_of(item["slug"]),
                    }
                    for item, name, reps in session
                ],
            },
            "meal": meal_for_day(baseline, intensity),
        })

    return {
        "id": variant["id"],
        "title": f"{profile.goal} · {variant['title']} 1주 루틴",
        "variant": variant["title"],
        "description": variant["description"],
        "trainingDays": training_days,
        "frequency": frequency,
        "split": split,
        "splitAuto": auto,
        "splitAdjusted": adjusted,
        "bmi": body["bmi"],
        "bmiCategory": body["category"],
        "bmiNote": body["routineNote"],
        "bodyType": body["typeLabel"],
        "bodyFat": body["bodyFat"],
        "muscleMass": body["muscleMass"],
        # 체성분 수치로 판단했는가. False면 키·체중만 본 것이다.
        "preciseBody": body["precise"],
        "countOffset": overrides.get("countOffset", 0),
        "baseline": baseline,
        "dailyTargets": {
            "calories": baseline["calories"],
            "protein": baseline["protein"],
            "carbs": baseline["carbs"],
            "fat": baseline["fat"],
        },
        "schedule": schedule,
        "weeklyNutrition": weekly_total(schedule),
        "coaching": coaching_for(profile, body),
        "guide": variant["guide"],
    }


def coaching_for(profile, body=None):
    """목표와 부상 부위, 체형에 맞춘 코칭 문구. DB에 저장하지 않고 매번 규칙으로 만든다."""
    coaching = list(COACHING_BY_GOAL.get(profile.goal, COACHING_BY_GOAL["기초 체력 향상"]))
    injuries = [item for item in (profile.injuries or []) if item != "해당 없음"]
    if injuries:
        coaching.append(
            f"{', '.join(injuries)}에 부담이 큰 동작은 대체 동작으로 이미 교체했습니다. "
            "통증이 3일 이상 이어지면 해당 부위 운동을 멈추고 전문가 상담을 받으세요."
        )

    info = body or body_profile(profile)
    if info["bmi"] is not None:
        # 체성분을 쟀으면 어떤 체형으로 봤는지까지 밝힌다.
        bmi = fmt_number(info["bmi"])
        if info["precise"]:
            fat = fmt_number(info["bodyFat"]) if info["bodyFat"] is not None else "-"
            head = f"BMI {bmi} · 체지방 {fat}% · {info['typeLabel'] or info['category']}"
        else:
            head = f"BMI {bmi}({info['category']})"
        coaching.append(f"{head} · {info['coaching']}")
    return coaching


def guide_for(variant_id):
    for variant in VARIANTS:
        if variant["id"] == variant_id:
            return variant["guide"]
    return VARIANTS[0]["guide"]


def build_plans(profile, library=None, restrictions=None, overrides=None):
    return [build_plan(profile, variant, library, restrictions, overrides) for variant in VARIANTS]
