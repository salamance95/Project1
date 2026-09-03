"""운동 검색 의도 해석.

"집에서 할 수 있는 등 운동", "무릎 아픈데 하체" 같은 문장을 이해해야 한다.
Claude가 붙어 있으면 Claude가, 없으면 아래 규칙 엔진이 처리한다.
규칙 엔진도 단순 문자열 포함이 아니라 동의어와 의도를 본다.
"""

import re

# 검색어에 나오는 표현 → 마스터의 muscle 값
MUSCLE_SYNONYMS = {
    "가슴": ["가슴", "흉근", "가슴근육", "펙", "대흉근", "체스트"],
    "등": ["등", "광배", "등근육", "배근", "랫", "승모"],
    "어깨": ["어깨", "삼각근", "숄더", "어깨근육"],
    "후면 어깨": ["후면", "후면삼각", "리어델트"],
    "하체": ["하체", "다리", "허벅지", "대퇴", "레그", "무릎근육", "허벅지앞"],
    "둔근": ["엉덩이", "둔근", "힙", "골반"],
    "햄스트링": ["햄스트링", "허벅지뒤", "뒷벅지"],
    "허리/둔근": ["허리근육", "기립근", "코어허리"],
    "코어": ["코어", "복근", "배", "복부", "식스팩", "허리안정"],
    "유산소": ["유산소", "카디오", "심폐", "지구력", "체지방", "살빼", "살뺄", "감량",
              "다이어트", "칼로리소모"],
    "후면 전체": ["후면사슬", "뒷라인"],
}

# 검색어 → 마스터의 equipment 값
EQUIPMENT_SYNONYMS = {
    "맨몸": ["맨몸", "집", "홈트", "기구없이", "장비없이", "야외", "집에서", "홈짐없이"],
    "덤벨": ["덤벨", "아령"],
    "바벨/랙": ["바벨", "바", "랙", "프리웨이트"],
    "머신/케이블": ["머신", "케이블", "기구", "헬스장"],
    "철봉": ["철봉", "풀업바", "턱걸이"],
    "밴드": ["밴드", "고무줄", "튜빙"],
    "유산소 장비": ["러닝머신", "트레드밀", "자전거", "사이클", "로잉"],
}

# 통증 표현은 활용형이 많아("아픈데", "아파서") 고정 문구로는 못 잡는다.
# 부위 단어와 통증 단어가 함께 나오는지로 판단한다.
PAIN_WORDS = ["아프", "아픈", "아파", "아픔", "통증", "부상", "안좋", "다쳤", "불편", "시큰", "저림"]

INJURY_BODY_WORDS = {
    "목/어깨": ["어깨", "목", "회전근개", "승모"],
    "허리": ["허리", "요추", "디스크"],
    "무릎": ["무릎", "슬개", "연골"],
    "손목/발목": ["손목", "발목", "아킬레스"],
}

# 움직임 패턴 표현
PATTERN_SYNONYMS = {
    "squat": ["스쿼트", "앉았다"],
    "hinge": ["데드리프트", "힌지", "숙이"],
    "lunge": ["런지", "한발", "편측"],
    "push_h": ["푸시업", "벤치", "미는"],
    "push_v": ["오버헤드", "프레스", "위로"],
    "pull_h": ["로우", "당기"],
    "pull_v": ["풀업", "턱걸이", "랫풀"],
    "core": ["플랭크", "버티"],
    "cardio": ["걷기", "달리기", "뛰기", "줄넘기"],
}


def _normalize(text):
    return re.sub(r"\s+", "", (text or "").lower())


def _hits(query, synonyms):
    """검색어에 걸리는 항목들."""
    found = []
    for key, words in synonyms.items():
        if any(word in query for word in words):
            found.append(key)
    return found


def rule_based_search(query, catalog, limit=12):
    """동의어와 의도를 반영한 점수 기반 검색."""
    raw = (query or "").strip()
    compact = _normalize(raw)

    if not compact:
        return [
            {"slug": item["slug"], "score": 0, "reasons": []}
            for item in catalog
        ][:limit]

    muscles = _hits(compact, MUSCLE_SYNONYMS)
    equipment = _hits(compact, EQUIPMENT_SYNONYMS)
    patterns = _hits(compact, PATTERN_SYNONYMS)

    # "무릎 아픈데", "허리가 안좋아서" 처럼 부위 + 통증이 같이 나오면 제외 필터로 쓴다.
    has_pain = any(word in compact for word in PAIN_WORDS)
    injuries = (
        [
            area
            for area, words in INJURY_BODY_WORDS.items()
            if any(word in compact for word in words)
        ]
        if has_pain
        else []
    )

    scored = []
    for item in catalog:
        # 아프다고 말한 부위에 부담이 큰 동작은 아예 뺀다.
        if any(area in item["risk"] for area in injuries):
            continue

        score = 0
        reasons = []

        name = _normalize(item["name"])
        if compact in name or name in compact:
            score += 6
            reasons.append("이름 일치")

        # 이름을 두 글자 단위로 쪼개 부분 일치도 본다("벤치" → "바벨 벤치 프레스")
        for chunk in {compact[i:i + 2] for i in range(len(compact) - 1)}:
            if len(chunk) == 2 and chunk in name:
                score += 1

        if item["muscle"] in muscles:
            score += 5
            reasons.append(f"{item['muscle']} 운동")

        if item["equipment"] in equipment:
            score += 4
            reasons.append(f"{item['equipment']}(으)로 가능")

        if item["pattern"] in patterns:
            score += 3
            reasons.append("동작 유형 일치")

        if injuries and score > 0:
            reasons.append(f"{', '.join(injuries)}에 부담 적음")

        if score > 0:
            scored.append({"slug": item["slug"], "score": score, "reasons": reasons})

    scored.sort(key=lambda item: -item["score"])
    return scored[:limit]


SEARCH_SYSTEM = """당신은 운동 검색 도우미입니다. 사용자의 요청과 운동 목록을 보고
가장 알맞은 운동을 고릅니다.

규칙
- 반드시 주어진 목록의 slug만 사용합니다. 목록에 없는 운동을 만들지 않습니다.
- 통증이나 부상을 언급하면 그 부위에 부담이 큰 운동을 제외합니다.
- 사용 가능한 기구를 언급하면 그 기구로 할 수 있는 것만 고릅니다.
- 최대 12개, 관련도가 높은 순서로 고릅니다.
- reason은 왜 골랐는지 20자 이내 한국어 한 줄입니다."""

SEARCH_SCHEMA = {
    "type": "object",
    "properties": {
        "matches": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "slug": {"type": "string"},
                    "reason": {"type": "string"},
                },
                "required": ["slug", "reason"],
                "additionalProperties": False,
            },
            "maxItems": 12,
        },
        "summary": {"type": "string"},
    },
    "required": ["matches", "summary"],
    "additionalProperties": False,
}
