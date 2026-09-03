"""온보딩 응답 → 1주일 루틴 후보 생성."""

from exercises import ExerciseLibrary, build_session
from nutrition import (
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

# 각 세션은 (포커스 이름, 움직임 패턴 우선순위, 강도)
BALANCED = {
    2: [
        ("전신 근력 A", ["squat", "push_h", "pull_h", "core", "cardio"], "high"),
        ("전신 근력 B", ["hinge", "push_v", "pull_v", "core", "cardio"], "high"),
    ],
    3: [
        ("전신 근력 A", ["squat", "push_h", "pull_h", "core", "cardio"], "high"),
        ("전신 근력 B", ["hinge", "push_v", "pull_v", "core", "cardio"], "moderate"),
        ("전신 근력 C", ["lunge", "push_h", "pull_v", "core", "cardio"], "high"),
    ],
    4: [
        ("상체 근력", ["push_h", "pull_h", "push_v", "core", "pull_v"], "high"),
        ("하체 근력", ["squat", "hinge", "lunge", "core", "cardio"], "high"),
        ("상체 볼륨", ["pull_v", "push_v", "pull_h", "core", "push_h"], "moderate"),
        ("하체 볼륨 + 유산소", ["hinge", "lunge", "squat", "cardio", "core"], "moderate"),
    ],
    5: [
        ("상체 근력", ["push_h", "pull_h", "push_v", "core", "pull_v"], "high"),
        ("하체 근력", ["squat", "hinge", "lunge", "core", "cardio"], "high"),
        ("상체 볼륨", ["pull_v", "push_v", "pull_h", "core", "push_h"], "moderate"),
        ("하체 볼륨", ["hinge", "lunge", "squat", "core", "cardio"], "moderate"),
        ("코어 + 컨디셔닝", ["core", "cardio", "lunge", "pull_h", "push_v"], "low"),
    ],
}

FOCUSED = {
    2: [
        ("상체 집중", ["push_h", "pull_v", "push_v", "pull_h", "core"], "high"),
        ("하체 집중", ["squat", "hinge", "lunge", "core", "cardio"], "high"),
    ],
    3: [
        ("푸시(가슴/어깨/삼두)", ["push_h", "push_v", "core", "cardio", "pull_h"], "high"),
        ("풀(등/이두)", ["pull_v", "pull_h", "core", "cardio", "push_v"], "high"),
        ("레그(하체 전체)", ["squat", "hinge", "lunge", "core", "cardio"], "high"),
    ],
    4: [
        ("푸시(가슴/어깨)", ["push_h", "push_v", "core", "cardio", "pull_h"], "high"),
        ("풀(등/후면)", ["pull_v", "pull_h", "core", "cardio", "push_v"], "high"),
        ("레그(하체 전체)", ["squat", "hinge", "lunge", "core", "cardio"], "high"),
        ("약점 보강 + 코어", ["core", "push_v", "pull_h", "cardio", "lunge"], "moderate"),
    ],
    5: [
        ("푸시(가슴/어깨)", ["push_h", "push_v", "core", "cardio", "pull_h"], "high"),
        ("풀(등/후면)", ["pull_v", "pull_h", "core", "cardio", "push_v"], "high"),
        ("레그(하체 전체)", ["squat", "hinge", "lunge", "core", "cardio"], "high"),
        ("상체 볼륨", ["push_h", "pull_h", "push_v", "core", "pull_v"], "moderate"),
        ("하체 + 코어", ["hinge", "lunge", "core", "cardio", "squat"], "moderate"),
    ],
}

SUSTAINABLE = {
    2: [
        ("전신 서킷", ["squat", "push_h", "pull_h", "core", "cardio"], "moderate"),
        ("전신 서킷 + 유산소", ["hinge", "push_v", "pull_v", "cardio", "core"], "moderate"),
    ],
    3: [
        ("전신 서킷 A", ["squat", "push_h", "pull_h", "cardio", "core"], "moderate"),
        ("유산소 + 코어", ["cardio", "core", "lunge", "pull_h", "push_v"], "low"),
        ("전신 서킷 B", ["hinge", "push_v", "pull_v", "cardio", "core"], "moderate"),
    ],
    4: [
        ("전신 서킷 A", ["squat", "push_h", "pull_h", "cardio", "core"], "moderate"),
        ("유산소 + 코어", ["cardio", "core", "lunge", "pull_h", "push_v"], "low"),
        ("전신 서킷 B", ["hinge", "push_v", "pull_v", "cardio", "core"], "moderate"),
        ("가벼운 컨디셔닝", ["cardio", "lunge", "core", "pull_h", "push_h"], "low"),
    ],
    5: [
        ("전신 서킷 A", ["squat", "push_h", "pull_h", "cardio", "core"], "moderate"),
        ("유산소 + 코어", ["cardio", "core", "lunge", "pull_h", "push_v"], "low"),
        ("전신 서킷 B", ["hinge", "push_v", "pull_v", "cardio", "core"], "moderate"),
        ("가벼운 컨디셔닝", ["cardio", "lunge", "core", "pull_h", "push_h"], "low"),
        ("전신 서킷 C", ["lunge", "push_h", "pull_v", "cardio", "core"], "moderate"),
    ],
}

VARIANTS = [
    {
        "id": "balanced",
        "title": "균형 성장형",
        "templates": BALANCED,
        "count_offset": 0,
        "description": "전신을 고르게 자극해 근력과 체력을 동시에 올립니다. 하루를 빠뜨려도 회복이 쉬운 구성입니다.",
        "guide": [
            "운동 전 5분 관절 가동성 워밍업",
            "첫 세트는 목표 무게의 60%로 예열",
            "운동 후 30분 안에 단백질 25~35g 섭취",
        ],
    },
    {
        "id": "focused",
        "title": "부위 집중형",
        "templates": FOCUSED,
        "count_offset": 0,
        "description": "부위별로 볼륨을 몰아주는 분할 구성입니다. 정해진 요일을 지킬 수 있을 때 성장이 가장 빠릅니다.",
        "guide": [
            "마지막 세트는 2회 남기고 종료(RIR 2)",
            "같은 부위는 최소 48시간 간격 유지",
            "고강도일 전날은 수면 7시간 이상 확보",
        ],
    },
    {
        "id": "sustainable",
        "title": "지속 가능형",
        "templates": SUSTAINABLE,
        "count_offset": -1,
        "description": "세션당 부담을 낮추고 유산소와 코어를 섞었습니다. 일정이 자주 흔들리는 사람에게 완주율이 가장 높습니다.",
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


def build_plan(profile, variant, library=None, restrictions=None, overrides=None):
    """overrides로 자동 재생성(progression)이 훈련일과 볼륨을 조정할 수 있다."""
    library = library or ExerciseLibrary.from_seed()
    restrictions = restrictions or {}
    overrides = overrides or {}

    baseline = daily_baseline(profile, restrictions)

    frequency = overrides.get("frequency") or profile.frequency
    training_days = overrides.get("trainingDays") or TRAINING_DAYS.get(
        frequency, TRAINING_DAYS["주 3일"]
    )
    sessions = variant["templates"][len(training_days)]

    count = EXERCISE_COUNT.get(profile.duration, 4) + variant["count_offset"]
    count += overrides.get("countOffset", 0)
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
                    "exercises": ["가벼운 걷기 20분", "전신 스트레칭 10분"],
                    "items": [],
                },
                "meal": {**meal, "note": _rest_meal_note(profile)},
            })
            continue

        focus, patterns, intensity = session_by_day[day]
        # 안전 점검에서 고강도 제한이 걸리면 강도를 한 단계 낮춘다.
        if restrictions.get("no_high_intensity") and intensity == "high":
            intensity = "moderate"

        session = build_session(patterns[:count], profile, library, restrictions)
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
        "coaching": coaching_for(profile),
        "guide": variant["guide"],
    }


def coaching_for(profile):
    """목표와 부상 부위에 맞춘 코칭 문구. DB에 저장하지 않고 매번 규칙으로 만든다."""
    coaching = list(COACHING_BY_GOAL.get(profile.goal, COACHING_BY_GOAL["기초 체력 향상"]))
    injuries = [item for item in (profile.injuries or []) if item != "해당 없음"]
    if injuries:
        coaching.append(
            f"{', '.join(injuries)}에 부담이 큰 동작은 대체 동작으로 이미 교체했습니다. "
            "통증이 3일 이상 이어지면 해당 부위 운동을 멈추고 전문가 상담을 받으세요."
        )
    return coaching


def guide_for(variant_id):
    for variant in VARIANTS:
        if variant["id"] == variant_id:
            return variant["guide"]
    return VARIANTS[0]["guide"]


def build_plans(profile, library=None, restrictions=None, overrides=None):
    return [build_plan(profile, variant, library, restrictions, overrides) for variant in VARIANTS]
