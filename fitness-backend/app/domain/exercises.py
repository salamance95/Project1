"""운동 마스터 시드와, 부상/기구/제한을 반영해 동작을 고르는 라이브러리."""

import math
import re

RISK_NECK_SHOULDER = "목/어깨"
RISK_LOW_BACK = "허리"
RISK_KNEE = "무릎"
RISK_WRIST_ANKLE = "손목/발목"

BODY_PARTS = [RISK_NECK_SHOULDER, RISK_LOW_BACK, RISK_KNEE, RISK_WRIST_ANKLE]

# 가용 기구. 맨몸은 항상 사용 가능한 것으로 취급한다(몸은 늘 있으므로).
BODYWEIGHT = "맨몸"
EQUIPMENT = [BODYWEIGHT, "덤벨", "바벨/랙", "머신/케이블", "철봉", "밴드", "유산소 장비"]

# 한 패턴에 쓸 동작이 하나도 없을 때 대신 채울 패턴.
# 기구가 부족하면 세션이 텅 비는 것보다 비슷한 자극으로 채우는 편이 낫다.
FALLBACK_PATTERN = {
    "squat": ["lunge", "hinge"],
    "hinge": ["lunge", "squat"],
    "lunge": ["squat", "hinge"],
    "push_h": ["push_v"],
    "push_v": ["push_h"],
    "pull_h": ["pull_v"],
    "pull_v": ["pull_h"],
    "core": [],
    "cardio": [],
}

# DB(exercises 테이블)의 시드 데이터. 런타임 조회는 DB에서 읽는다.
# risk: 해당 부위에 부담이 큰 동작 / alt: 막혔을 때 내려갈 대체 동작
# impact: 관절 충격이 큰 동작 / equipment: 필요한 기구 / muscle: 표기할 부위
SEED_EXERCISES = [
    # 스쿼트 계열
    {"slug": "back_squat", "name": "바벨 백스쿼트", "pattern": "squat", "muscle": "하체",
     "equipment": "바벨/랙", "risk": [RISK_KNEE, RISK_LOW_BACK], "alt": "goblet_squat",
     "load": 3, "impact": False},
    {"slug": "goblet_squat", "name": "고블릿 스쿼트", "pattern": "squat", "muscle": "하체",
     "equipment": "덤벨", "risk": [RISK_KNEE], "alt": "box_squat", "load": 2, "impact": False},
    {"slug": "box_squat", "name": "박스 스쿼트(의자 활용)", "pattern": "squat", "muscle": "하체",
     "equipment": BODYWEIGHT, "risk": [], "alt": None, "load": 1, "impact": False},
    {"slug": "leg_press", "name": "레그 프레스", "pattern": "squat", "muscle": "하체",
     "equipment": "머신/케이블", "risk": [], "alt": None, "load": 2, "impact": False},

    # 힌지 계열
    {"slug": "deadlift", "name": "컨벤셔널 데드리프트", "pattern": "hinge", "muscle": "후면 전체",
     "equipment": "바벨/랙", "risk": [RISK_LOW_BACK], "alt": "hip_thrust", "load": 3, "impact": False},
    {"slug": "rdl", "name": "루마니안 데드리프트", "pattern": "hinge", "muscle": "햄스트링",
     "equipment": "바벨/랙", "risk": [RISK_LOW_BACK], "alt": "db_rdl", "load": 3, "impact": False},
    {"slug": "db_rdl", "name": "덤벨 루마니안 데드리프트", "pattern": "hinge", "muscle": "햄스트링",
     "equipment": "덤벨", "risk": [RISK_LOW_BACK], "alt": "hip_thrust", "load": 2, "impact": False},
    {"slug": "hip_thrust", "name": "힙 쓰러스트", "pattern": "hinge", "muscle": "둔근",
     "equipment": "덤벨", "risk": [], "alt": "glute_bridge", "load": 2, "impact": False},
    {"slug": "glute_bridge", "name": "글루트 브리지", "pattern": "hinge", "muscle": "둔근",
     "equipment": BODYWEIGHT, "risk": [], "alt": None, "load": 1, "impact": False},
    {"slug": "back_ext", "name": "백 익스텐션", "pattern": "hinge", "muscle": "허리/둔근",
     "equipment": BODYWEIGHT, "risk": [], "alt": None, "load": 1, "impact": False},

    # 런지 / 편측
    {"slug": "walking_lunge", "name": "워킹 런지", "pattern": "lunge", "muscle": "하체",
     "equipment": BODYWEIGHT, "risk": [RISK_KNEE], "alt": "split_squat", "load": 2, "impact": False},
    {"slug": "split_squat", "name": "스플릿 스쿼트", "pattern": "lunge", "muscle": "하체",
     "equipment": BODYWEIGHT, "risk": [RISK_KNEE], "alt": "step_up", "load": 2, "impact": False},
    {"slug": "step_up", "name": "낮은 박스 스텝업", "pattern": "lunge", "muscle": "하체",
     "equipment": BODYWEIGHT, "risk": [], "alt": None, "load": 1, "impact": False},

    # 수평 밀기
    {"slug": "bench_press", "name": "바벨 벤치 프레스", "pattern": "push_h", "muscle": "가슴",
     "equipment": "바벨/랙", "risk": [RISK_NECK_SHOULDER], "alt": "db_bench", "load": 3, "impact": False},
    {"slug": "db_bench", "name": "덤벨 벤치 프레스", "pattern": "push_h", "muscle": "가슴",
     "equipment": "덤벨", "risk": [RISK_NECK_SHOULDER], "alt": "chest_press_machine",
     "load": 2, "impact": False},
    {"slug": "chest_press_machine", "name": "체스트 프레스 머신", "pattern": "push_h", "muscle": "가슴",
     "equipment": "머신/케이블", "risk": [], "alt": None, "load": 2, "impact": False},
    {"slug": "pushup", "name": "푸시업", "pattern": "push_h", "muscle": "가슴",
     "equipment": BODYWEIGHT, "risk": [RISK_WRIST_ANKLE], "alt": "chest_press_machine",
     "load": 2, "impact": False},

    # 수직 밀기
    {"slug": "ohp", "name": "바벨 오버헤드 프레스", "pattern": "push_v", "muscle": "어깨",
     "equipment": "바벨/랙", "risk": [RISK_NECK_SHOULDER, RISK_LOW_BACK],
     "alt": "db_shoulder_press", "load": 3, "impact": False},
    {"slug": "db_shoulder_press", "name": "덤벨 숄더 프레스(시티드)", "pattern": "push_v", "muscle": "어깨",
     "equipment": "덤벨", "risk": [RISK_NECK_SHOULDER], "alt": "lateral_raise", "load": 2, "impact": False},
    {"slug": "lateral_raise", "name": "래터럴 레이즈", "pattern": "push_v", "muscle": "어깨",
     "equipment": "덤벨", "risk": [], "alt": "pike_pushup", "load": 1, "impact": False},
    {"slug": "pike_pushup", "name": "파이크 푸시업", "pattern": "push_v", "muscle": "어깨",
     "equipment": BODYWEIGHT, "risk": [RISK_NECK_SHOULDER, RISK_WRIST_ANKLE], "alt": None,
     "load": 2, "impact": False},

    # 수평 당기기
    {"slug": "barbell_row", "name": "바벨 로우", "pattern": "pull_h", "muscle": "등",
     "equipment": "바벨/랙", "risk": [RISK_LOW_BACK], "alt": "seated_row", "load": 3, "impact": False},
    {"slug": "db_row", "name": "원암 덤벨 로우", "pattern": "pull_h", "muscle": "등",
     "equipment": "덤벨", "risk": [], "alt": None, "load": 2, "impact": False},
    {"slug": "seated_row", "name": "시티드 케이블 로우", "pattern": "pull_h", "muscle": "등",
     "equipment": "머신/케이블", "risk": [], "alt": None, "load": 2, "impact": False},
    {"slug": "inverted_row", "name": "인버티드 로우(테이블/바)", "pattern": "pull_h", "muscle": "등",
     "equipment": BODYWEIGHT, "risk": [], "alt": None, "load": 1, "impact": False},

    # 수직 당기기
    {"slug": "pullup", "name": "풀업", "pattern": "pull_v", "muscle": "등",
     "equipment": "철봉", "risk": [RISK_NECK_SHOULDER, RISK_WRIST_ANKLE], "alt": "lat_pulldown",
     "load": 3, "impact": False},
    {"slug": "lat_pulldown", "name": "랫 풀다운", "pattern": "pull_v", "muscle": "등",
     "equipment": "머신/케이블", "risk": [], "alt": "band_pulldown", "load": 2, "impact": False},
    {"slug": "band_pulldown", "name": "밴드 풀다운", "pattern": "pull_v", "muscle": "등",
     "equipment": "밴드", "risk": [], "alt": None, "load": 1, "impact": False},
    {"slug": "face_pull", "name": "페이스 풀", "pattern": "pull_v", "muscle": "후면 어깨",
     "equipment": "머신/케이블", "risk": [], "alt": None, "load": 1, "impact": False},

    # 코어
    {"slug": "plank", "name": "플랭크", "pattern": "core", "muscle": "코어",
     "equipment": BODYWEIGHT, "risk": [RISK_WRIST_ANKLE], "alt": "dead_bug", "load": 1, "impact": False},
    {"slug": "dead_bug", "name": "데드버그", "pattern": "core", "muscle": "코어",
     "equipment": BODYWEIGHT, "risk": [], "alt": None, "load": 1, "impact": False},
    {"slug": "hanging_knee_raise", "name": "행잉 니레이즈", "pattern": "core", "muscle": "코어",
     "equipment": "철봉", "risk": [RISK_NECK_SHOULDER, RISK_LOW_BACK], "alt": "dead_bug",
     "load": 2, "impact": False},
    {"slug": "pallof_press", "name": "팔로프 프레스", "pattern": "core", "muscle": "코어",
     "equipment": "밴드", "risk": [], "alt": "dead_bug", "load": 1, "impact": False},
    {"slug": "mountain_climber", "name": "마운틴 클라이머", "pattern": "core", "muscle": "코어",
     "equipment": BODYWEIGHT, "risk": [RISK_WRIST_ANKLE], "alt": "dead_bug", "load": 2, "impact": False},

    # 유산소 / 컨디셔닝
    {"slug": "incline_walk", "name": "경사 빠르게 걷기", "pattern": "cardio", "muscle": "유산소",
     "equipment": BODYWEIGHT, "risk": [], "alt": None, "load": 1, "impact": False},
    {"slug": "cycle", "name": "실내 자전거", "pattern": "cardio", "muscle": "유산소",
     "equipment": "유산소 장비", "risk": [], "alt": "incline_walk", "load": 1, "impact": False},
    {"slug": "row_erg", "name": "로잉 머신", "pattern": "cardio", "muscle": "유산소",
     "equipment": "유산소 장비", "risk": [RISK_LOW_BACK], "alt": "cycle", "load": 2, "impact": False},
    {"slug": "jump_rope", "name": "줄넘기", "pattern": "cardio", "muscle": "유산소",
     "equipment": BODYWEIGHT, "risk": [RISK_KNEE, RISK_WRIST_ANKLE], "alt": "incline_walk",
     "load": 2, "impact": True},
]

# 세트/반복 처방: (성향, 경력) 조합
SET_SCHEME = {
    "근력 중심": {"입문": "3세트 x 8회", "초보": "4세트 x 6회",
                 "중급": "4세트 x 5회", "고급": "5세트 x 4회"},
    "근비대 중심": {"입문": "3세트 x 12회", "초보": "3세트 x 10회",
                   "중급": "4세트 x 10회", "고급": "4세트 x 8회"},
    "체력 중심": {"입문": "2세트 x 15회", "초보": "3세트 x 15회",
                 "중급": "3세트 x 12회", "고급": "4세트 x 12회"},
}

# 고강도 제한이 걸리면 세트 수를 낮춘 안전 처방으로 대체한다.
SAFE_SCHEME = {"입문": "2세트 x 12회", "초보": "3세트 x 12회",
               "중급": "3세트 x 12회", "고급": "3세트 x 12회"}

CARDIO_SCHEME = {
    "30분 이하": "10분",
    "45분~1시간": "20분",
    "1시간 30분 이상": "30분",
}


# 거리로 재는 유산소와 계획 강도 기준 평균 속도(km/h).
# 여기 있는 동작만 "몇 km"로 처방하고, 나머지 유산소는 시간으로 둔다.
# (줄넘기처럼 이동하지 않는 동작은 거리가 의미 없다.)
# 휴식일·회복일에 넣는 가벼운 걷기.
# 회복이 목적이라 경사 빠르게 걷기(5.5km/h)보다 느린 속도로 본다.
LIGHT_WALK_KMH = 4.5
LIGHT_WALK_MINUTES = 20
LIGHT_WALK = (
    f"가벼운 걷기 {round(LIGHT_WALK_KMH * LIGHT_WALK_MINUTES / 60, 1)}km({LIGHT_WALK_MINUTES}분)"
)

DISTANCE_SPEED_KMH = {
    "incline_walk": 5.5,
    "cycle": 20.0,
    "row_erg": 12.0,
}

# 운동을 무엇으로 재는가. 화면의 입력 칸도 이 값을 보고 달라진다.
#  weight   기구로 무게를 다루는 운동 — kg · 세트 x 횟수
#  reps     무게를 쓰지 않는 맨몸 운동 — 세트 x 횟수
#  distance 걷기·자전거처럼 이동 거리가 곧 운동량인 유산소 — km
#  time     제자리에서 하는 유산소 — 분
METRIC_WEIGHT = "weight"
METRIC_REPS = "reps"
METRIC_DISTANCE = "distance"
METRIC_TIME = "time"


def metric_of(item):
    from app.domain.energy import BODYWEIGHT_RATIO

    if not item:
        return METRIC_REPS
    if item["slug"] in DISTANCE_SPEED_KMH:
        return METRIC_DISTANCE
    if item["pattern"] == "cardio":
        return METRIC_TIME
    # 추천 중량을 계산할 수 있는 동작 = 무게를 다루는 동작.
    return METRIC_WEIGHT if item["slug"] in BODYWEIGHT_RATIO else METRIC_REPS


def minutes_of(text):
    """유산소 처방에 적힌 분 수. "20분" → 20."""
    match = re.search(r"(\d+)\s*분", text or "")
    return int(match.group(1)) if match else None


def speed_of(slug):
    """거리로 재는 동작의 평균 속도(km/h). 아니면 None."""
    return DISTANCE_SPEED_KMH.get(slug)


def distance_for(slug, minutes):
    """평균 속도 × 시간 → 거리(km). 소수 첫째 자리까지."""
    speed = DISTANCE_SPEED_KMH.get(slug)
    if not speed or not minutes:
        return None
    return math.floor(speed * minutes / 60 * 10 + 0.5) / 10


def normalize_equipment(selected):
    """맨몸은 언제나 가능하므로 강제로 포함한다."""
    chosen = {item for item in (selected or []) if item in EQUIPMENT}
    chosen.add(BODYWEIGHT)
    return chosen


class ExerciseLibrary:
    """DB에서 읽은 운동 목록을 감싸고, 제약을 만족하는 동작을 골라준다."""

    def __init__(self, items):
        self.items = list(items)
        self.by_slug = {item["slug"]: item for item in self.items}

    @classmethod
    def from_seed(cls):
        return cls(SEED_EXERCISES)

    @classmethod
    def from_rows(cls, rows):
        """models.Exercise 행 목록을 라이브러리 형태로 변환한다."""
        items = []
        for row in rows:
            items.append({
                "id": row.id,
                "slug": row.slug,
                "name": row.name,
                "pattern": row.pattern,
                "muscle": row.muscle,
                "equipment": row.equipment.name if row.equipment else BODYWEIGHT,
                "load": row.load,
                "impact": row.is_high_impact,
                "alt": row.alt_slug,
                "risk": [risk.body_part.name for risk in row.risks],
            })
        return cls(items)

    def _blocked(self, item, injuries, restrictions, equipment):
        if any(area in item["risk"] for area in injuries):
            return True
        if restrictions.get("no_impact") and item["impact"]:
            return True
        if equipment and item["equipment"] not in equipment:
            return True
        return False

    def _pick_from_pattern(self, pattern, injuries, used_slugs, restrictions, equipment):
        candidates = [item for item in self.items if item["pattern"] == pattern]
        if not candidates:
            return None

        safe = [
            item for item in candidates
            if not self._blocked(item, injuries, restrictions, equipment)
        ]
        if not safe:
            return None

        # 막힌 고부하 동작이 있으면 그 동작의 대체 체인을 먼저 따라간다.
        blocked = [
            item for item in candidates
            if self._blocked(item, injuries, restrictions, equipment)
        ]
        if blocked:
            origin = max(blocked, key=lambda item: item["load"])
            alt_slug = origin.get("alt")
            seen = set()
            while alt_slug and alt_slug not in seen:
                seen.add(alt_slug)
                alt = self.by_slug.get(alt_slug)
                if not alt:
                    break
                if (
                    not self._blocked(alt, injuries, restrictions, equipment)
                    and alt["slug"] not in used_slugs
                ):
                    return alt
                alt_slug = alt.get("alt")

        # 이미 이번 세션에 넣은 동작은 다시 쓰지 않는다.
        # 같은 줄이 두 번 나오는 것보다 한 줄 적은 편이 낫다.
        pool = [item for item in safe if item["slug"] not in used_slugs]
        if not pool:
            return None
        pool.sort(key=lambda item: -item["load"])

        if restrictions.get("no_high_intensity"):
            # 고강도 제한이 걸리면 부하가 낮은 쪽을 고른다.
            pool.sort(key=lambda item: item["load"])

        return pool[0]

    def pick(self, pattern, injuries, used_slugs, restrictions, equipment=None):
        """부상 부위·안전 제한·가용 기구를 모두 만족하는 동작을 하나 고른다.

        해당 패턴에서 아무것도 못 고르면 비슷한 패턴으로 넘어간다.
        """
        picked = self._pick_from_pattern(pattern, injuries, used_slugs, restrictions, equipment)
        if picked:
            return picked

        for alternative in FALLBACK_PATTERN.get(pattern, []):
            picked = self._pick_from_pattern(
                alternative, injuries, used_slugs, restrictions, equipment
            )
            if picked:
                return picked
        return None


def prescription_for(profile, restrictions):
    if restrictions.get("no_high_intensity"):
        return SAFE_SCHEME.get(profile.level, "3세트 x 12회")
    scheme = SET_SCHEME.get(profile.style, SET_SCHEME["근비대 중심"])
    return scheme.get(profile.level, "3세트 x 10회")


def build_session(patterns, profile, library, restrictions, used_slugs=None):
    """패턴 목록 → [(운동 dict, 표시명, 처방)] 목록."""
    injuries = [item for item in (profile.injuries or []) if item != "해당 없음"]
    equipment = normalize_equipment(getattr(profile, "equipment", None))
    used = used_slugs if used_slugs is not None else set()
    reps = prescription_for(profile, restrictions)

    session = []
    for pattern in patterns:
        picked = library.pick(pattern, injuries, used, restrictions, equipment)
        if not picked:
            continue
        used.add(picked["slug"])
        if pattern == "cardio" or picked["pattern"] == "cardio":
            session.append(
                (picked, picked["name"], prescription_for_item(picked, profile, restrictions))
            )
        else:
            session.append((picked, picked["name"], reps))
    return session


def _profile_field(profile, name, default):
    """설문이 pydantic 객체로도, dict로도 들어온다."""
    if isinstance(profile, dict):
        return profile.get(name, default)
    return getattr(profile, name, default)


def alternatives_for(origin_slug, profile, library, restrictions=None, limit=6):
    """한 동작을 대신할 수 있는 동작들.

    기구가 없을 때 쓰라고 만든 목록이라 순서가 중요하다.
    지정 대체 동작 → 맨몸(집에서 가능) → 보유 기구 → 그 밖의 기구 순으로 준다.
    부상 부위나 안전 제한에 걸리는 동작은 아예 빼고, 같은 패턴이 부족하면
    비슷한 패턴(FALLBACK_PATTERN)까지 넓힌다.
    """
    restrictions = restrictions or {}
    origin = library.by_slug.get(origin_slug)
    if origin is None:
        return []

    injuries = [item for item in (_profile_field(profile, "injuries", []) or []) if item != "해당 없음"]
    owned = normalize_equipment(_profile_field(profile, "equipment", []))
    patterns = [origin["pattern"], *FALLBACK_PATTERN.get(origin["pattern"], [])]

    alt_chain = set()
    cursor = origin["alt"]
    while cursor and cursor not in alt_chain:
        alt_chain.add(cursor)
        nxt = library.by_slug.get(cursor)
        cursor = nxt["alt"] if nxt else None

    scored = []
    for item in library.items:
        if item["slug"] == origin["slug"]:
            continue
        if item["pattern"] not in patterns and item["slug"] not in alt_chain:
            continue
        # 아픈 부위와 안전 제한은 대체 동작에서도 그대로 지킨다.
        if any(area in item["risk"] for area in injuries):
            continue
        if restrictions.get("no_impact") and item["impact"]:
            continue

        is_home = item["equipment"] == BODYWEIGHT
        is_owned = item["equipment"] in owned
        same_pattern = item["pattern"] == origin["pattern"]

        if item["slug"] in alt_chain:
            reason = "지정된 대체 동작"
        elif is_home:
            reason = "맨몸 · 집에서 가능"
        elif is_owned:
            reason = "가지고 있는 기구로 가능"
        else:
            reason = f"{item['equipment']} 필요"

        rank = (
            (8 if item["slug"] in alt_chain else 0)
            + (4 if is_home else 0)
            + (3 if same_pattern else 0)
            + (2 if is_owned else 0)
        )
        scored.append((rank, item["name"], {
            "slug": item["slug"],
            "name": item["name"],
            "muscle": item["muscle"],
            "equipment": item["equipment"],
            "pattern": item["pattern"],
            "isHome": is_home,
            "isOwned": is_owned,
            "samePattern": same_pattern,
            "reason": reason,
        }))

    scored.sort(key=lambda row: (-row[0], row[1]))
    return [row[2] for row in scored[:limit]]


def prescription_for_item(item, profile, restrictions=None):
    """동작 하나에 붙일 처방.

    거리로 재는 유산소는 km(시간 병기), 나머지 유산소는 시간, 근력은 세트x횟수.
    """
    if item["pattern"] != "cardio":
        return prescription_for(profile, restrictions or {})

    time_text = CARDIO_SCHEME.get(profile.duration, "20분")
    km = distance_for(item["slug"], minutes_of(time_text))
    return f"{_km_text(km)}km({time_text})" if km else time_text


def _km_text(km):
    """2.0 → "2", 1.8 → "1.8". JS 백엔드 표기와 맞춘다."""
    return str(int(km)) if float(km).is_integer() else str(km)
