"""BMI 계산과 BMI 기반 루틴 보정. 진단이 아니라 루틴을 고르는 기준으로만 쓴다.

구간은 대한비만학회(아시아-태평양) 기준을 따른다. WHO 기준(25/30)보다 한 단계 낮다.
"""

import math

BMI_BANDS = [
    {
        "id": "underweight",
        "label": "저체중",
        "min": 0.0,
        "max": 18.5,
        "summary": "체중이 부족합니다. 유산소보다 근력 볼륨을 먼저 채우는 편이 좋습니다.",
        "routine": "유산소 비중을 줄이고 근력 동작을 우선 배치했습니다.",
        "coaching": "체중이 늘지 않으면 훈련량보다 식사량을 먼저 점검하세요.",
    },
    {
        "id": "normal",
        "label": "정상",
        "min": 18.5,
        "max": 23.0,
        "summary": "표준 범위입니다. 목표에 맞춰 그대로 진행하면 됩니다.",
        "routine": "체형 보정 없이 목표와 경력 기준으로만 구성했습니다.",
        "coaching": "체중보다 수행 능력(중량·횟수)이 오르는지를 기준으로 삼으세요.",
    },
    {
        "id": "overweight",
        "label": "과체중",
        "min": 23.0,
        "max": 25.0,
        "summary": "약간 높습니다. 근력은 유지하고 유산소를 조금 늘리는 구성이 맞습니다.",
        "routine": "세션 끝에 유산소를 우선 배치했습니다.",
        "coaching": "체중 변화는 주 0.5kg 이내로 천천히 잡으세요.",
    },
    {
        "id": "obese",
        "label": "비만",
        "min": 25.0,
        "max": 30.0,
        "summary": "관절 부담이 커지는 구간입니다. 전신을 자주 쓰는 구성이 완주율이 높습니다.",
        "routine": "유산소를 앞당기고 세션당 동작 수를 하나 줄였습니다.",
        "coaching": "무릎이 불편하면 점프 동작 대신 걷기·자전거로 대체하세요.",
    },
    {
        "id": "severely_obese",
        "label": "고도비만",
        "min": 30.0,
        "max": math.inf,
        "summary": "충격이 큰 동작은 피하고 강도를 한 단계 낮춰 시작해야 합니다.",
        "routine": "점프 등 고충격 동작을 빼고 고강도 세션을 중강도로 낮췄습니다.",
        "coaching": "통증 없이 4주를 채우는 것을 1차 목표로 삼으세요.",
    },
]

# 구간별 루틴 보정값. planner가 그대로 읽는다.
BMI_ADJUSTMENTS = {
    "underweight": {"countOffset": 0, "cardioFirst": False, "noImpact": False, "capHighIntensity": False},
    "normal": {"countOffset": 0, "cardioFirst": False, "noImpact": False, "capHighIntensity": False},
    "overweight": {"countOffset": 0, "cardioFirst": True, "noImpact": False, "capHighIntensity": False},
    "obese": {"countOffset": -1, "cardioFirst": True, "noImpact": False, "capHighIntensity": False},
    "severely_obese": {"countOffset": -1, "cardioFirst": True, "noImpact": True, "capHighIntensity": True},
}

# BMI 구간별로 권장하는 최대 분할 수. 체중이 많이 나갈수록 전신 빈도를 높인다.
BMI_SPLIT_CAP = {
    "underweight": 5,
    "normal": 5,
    "overweight": 4,
    "obese": 3,
    "severely_obese": 2,
}

NO_ADJUSTMENT = {"countOffset": 0, "cardioFirst": False, "noImpact": False, "capHighIntensity": False}


def _round1(value):
    """소수 첫째 자리. JS 백엔드와 값이 어긋나지 않게 반올림 방식을 고정한다."""
    return math.floor(value * 10 + 0.5) / 10


def bmi_value(height_cm, weight_kg):
    """kg / m^2. 키나 몸무게가 없으면 None."""
    if not height_cm or not weight_kg:
        return None
    meters = height_cm / 100
    return _round1(weight_kg / (meters * meters))


def bmi_band(bmi):
    if bmi is None:
        return None
    for band in BMI_BANDS:
        if band["min"] <= bmi < band["max"]:
            return band
    return BMI_BANDS[-1]


def weight_for_bmi(height_cm, bmi):
    """BMI로 되돌린 체중(kg). 설문에서 BMI를 직접 입력했을 때 쓴다."""
    meters = height_cm / 100
    return _round1(bmi * meters * meters)


def _field(profile, name, default=None):
    """설문이 pydantic 객체로도, dict로도 들어온다."""
    if isinstance(profile, dict):
        return profile.get(name, default)
    return getattr(profile, name, default)


def body_profile(profile):
    """설문 응답 → 체형 요약과 루틴 보정값.

    체지방률·골격근량이 없으면 BMI 구간만으로 판단하고(기존 동작),
    있으면 체형 유형으로 한 번 더 갈라서 보정을 덮어쓴다.
    """
    height = _field(profile, "height")
    weight = _field(profile, "weight")
    sex = _field(profile, "sex")

    bmi = bmi_value(height, weight)
    band = bmi_band(bmi)

    body_fat = _field(profile, "bodyFat")
    muscle_mass = _field(profile, "muscleMass")
    smi = muscle_index(height, muscle_mass)
    fat = fat_level(sex, body_fat)
    muscle = muscle_level(sex, smi)
    type_id = body_type_of(bmi, fat, muscle)
    body_type = BODY_TYPES.get(type_id) if type_id else None

    composition = {
        "bodyFat": body_fat,
        "muscleMass": muscle_mass,
        "smi": smi,
        "fatLevel": fat,
        "muscleLevel": muscle,
        "typeId": type_id,
        "typeLabel": body_type["label"] if body_type else None,
        # 체성분 수치로 판단했는가. False면 키·체중(BMI)만 본 것이다.
        "precise": bool(fat or muscle),
    }

    if band is None:
        return {
            "bmi": None,
            "bandId": None,
            "category": None,
            "summary": "",
            "routineNote": "",
            "coaching": "",
            "adjustments": dict(NO_ADJUSTMENT),
            "splitCap": 5,
            **composition,
        }

    if body_type is None:
        return {
            "bmi": bmi,
            "bandId": band["id"],
            "category": band["label"],
            "summary": band["summary"],
            "routineNote": band["routine"],
            "coaching": band["coaching"],
            "adjustments": BMI_ADJUSTMENTS[band["id"]],
            "splitCap": BMI_SPLIT_CAP[band["id"]],
            **composition,
        }

    # 체형 유형이 잡히면 그쪽 보정이 BMI 보정을 대신한다.
    # 단 BMI 30 이상은 어느 유형이든 관절 보호는 유지한다.
    adjustments = dict(body_type["adjustments"])
    if bmi >= 30 and type_id != "athletic":
        adjustments["noImpact"] = True
        adjustments["capHighIntensity"] = True

    cap = 5 if type_id == "athletic" else BMI_SPLIT_CAP[band["id"]]

    return {
        "bmi": bmi,
        "bandId": band["id"],
        "category": band["label"],
        "summary": body_type["summary"],
        "routineNote": body_type["routine"],
        "coaching": body_type["coaching"],
        "adjustments": adjustments,
        "splitCap": min(body_type["splitCap"], cap),
        **composition,
    }


# --------------------------------------------- 결과지 사진에서 읽은 값

LIMITS = {
    "height": (100, 250),
    "weight": (25, 300),
    "bmi": (10, 60),
    "bodyFat": (3, 70),
    "muscleMass": (10, 80),
}


def _sane(field, value):
    """숫자이고 상식적인 범위 안일 때만 값으로 인정한다."""
    low, high = LIMITS[field]
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number) or number <= low or number >= high:
        return None
    return _round1(number)


def fmt_number(value):
    """문구에 넣을 숫자 표기. JS 백엔드와 같은 모양으로 맞춘다(30.0 → 30)."""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _height_for_bmi(weight_kg, bmi):
    """체중과 BMI로 되돌린 키(cm)."""
    return _round1(math.sqrt(weight_kg / bmi) * 100)


def normalize_body_reading(reading):
    """사진에서 읽은 값 → 설문에 채울 수 있는 형태.

    모델이 읽은 숫자를 그대로 믿지 않는다. 범위를 벗어난 값은 버리고,
    세 값 중 둘만 있으면 나머지 하나를 계산해서 채운다.
    BMI는 언제나 키·체중에서 다시 계산한 값을 쓴다(결과지 반올림과 어긋날 수 있어서).
    """
    raw = reading or {}
    warnings = []

    height = _sane("height", raw.get("height"))
    weight = _sane("weight", raw.get("weight"))
    stated_bmi = _sane("bmi", raw.get("bmi"))
    body_fat = _sane("bodyFat", raw.get("bodyFat"))
    muscle_mass = _sane("muscleMass", raw.get("muscleMass"))

    for field in ("height", "weight", "bmi"):
        value = raw.get(field)
        if value is not None and _sane(field, value) is None:
            warnings.append(f"{field} 값({fmt_number(value)})이 상식적인 범위를 벗어나 무시했습니다.")

    # 둘만 읽혔으면 나머지 하나를 계산해서 채운다.
    if height and not weight and stated_bmi:
        weight = weight_for_bmi(height, stated_bmi)
        warnings.append("체중이 안 보여서 키와 BMI로 계산했습니다.")
    elif not height and weight and stated_bmi:
        height = _height_for_bmi(weight, stated_bmi)
        warnings.append("키가 안 보여서 체중과 BMI로 계산했습니다.")

    bmi = bmi_value(height, weight) if (height and weight) else stated_bmi

    # 결과지에 적힌 BMI와 계산값이 크게 다르면 잘못 읽었을 가능성이 높다.
    if stated_bmi and bmi and abs(stated_bmi - bmi) >= 1:
        warnings.append(
            f"결과지의 BMI({fmt_number(stated_bmi)})와 키·체중으로 계산한 값({fmt_number(bmi)})이 다릅니다. "
            "숫자를 확인해 주세요."
        )

    band = bmi_band(bmi)

    return {
        "height": height,
        "weight": weight,
        "bmi": bmi,
        "statedBmi": stated_bmi,
        "bodyFat": body_fat,
        "muscleMass": muscle_mass,
        "category": band["label"] if band else None,
        # 설문에 바로 채워 넣어도 되는가.
        "complete": bool(height and weight),
        "warnings": warnings,
    }


# ------------------------------------------- 체성분(선택 입력) 기준

# 체지방률 구간. 비만 기준(남 25% / 여 30%)은 대한비만학회, 낮음은 운동선수 범위.
FAT_LEVELS = {
    "남성": {"low": 13.0, "high": 25.0, "very_high": 30.0},
    "여성": {"low": 21.0, "high": 30.0, "very_high": 35.0},
}

# 골격근량 지수(SMI = 골격근량 / 키m²). 낮음은 아시아 근감소증 기준(AWGS).
MUSCLE_LEVELS = {
    "남성": {"low": 7.0, "high": 9.0},
    "여성": {"low": 5.7, "high": 7.5},
}

# 체성분까지 알 때 나누는 체형 유형.
# BMI만으로는 근육이 많아 무거운 사람과 지방이 많아 무거운 사람이 같은 칸에 들어간다.
BODY_TYPES = {
    "athletic": {
        "label": "근육형",
        "summary": "체중은 무겁지만 지방이 아니라 근육입니다. BMI만 보면 과체중으로 잡히는 체형입니다.",
        "routine": "BMI에 따른 강도·유산소 보정을 걸지 않고 목표대로 구성했습니다.",
        "coaching": "체중계 숫자보다 중량과 둘레 변화를 기준으로 삼으세요.",
        "adjustments": {"countOffset": 0, "cardioFirst": False, "noImpact": False, "capHighIntensity": False},
        "splitCap": 5,
    },
    "skinny_fat": {
        "label": "마른비만형",
        "summary": "BMI는 높지 않지만 체지방률이 높습니다. 체중을 줄이는 것보다 근육을 올리는 쪽이 맞습니다.",
        "routine": "유산소를 앞당기지 않고 근력 동작을 먼저 배치했습니다.",
        "coaching": "굶어서 체중을 줄이면 근육이 먼저 빠집니다. 단백질을 채우고 근력 볼륨을 늘리세요.",
        "adjustments": {"countOffset": 0, "cardioFirst": False, "noImpact": False, "capHighIntensity": False},
        "splitCap": 3,
    },
    "obese": {
        "label": "비만형",
        "summary": "BMI와 체지방률이 함께 높습니다. 관절 부담을 줄이면서 소모를 늘리는 구성이 맞습니다.",
        "routine": "유산소를 앞당기고 세션당 동작 수를 하나 줄였습니다.",
        "coaching": "체중 감량은 주 0.5~1% 속도가 가장 오래갑니다.",
        "adjustments": {"countOffset": -1, "cardioFirst": True, "noImpact": False, "capHighIntensity": False},
        "splitCap": 3,
    },
    "low_muscle": {
        "label": "근육 부족형",
        "summary": "골격근량이 나이·키 대비 적습니다. 강도보다 자세와 빈도를 먼저 쌓아야 합니다.",
        "routine": "고충격 동작을 빼고 강도를 한 단계 낮췄습니다. 전신을 자주 쓰도록 분할도 낮췄습니다.",
        "coaching": "무게를 올리기 전에 같은 무게로 횟수를 먼저 늘리세요.",
        "adjustments": {"countOffset": -1, "cardioFirst": False, "noImpact": True, "capHighIntensity": True},
        "splitCap": 2,
    },
    "sarcopenic_obese": {
        "label": "근감소 비만형",
        "summary": "지방은 많고 골격근량은 적습니다. 유산소만 하면 남은 근육까지 빠지는 체형입니다.",
        "routine": "유산소를 앞세우지 않고 근력을 먼저 두되, 강도와 충격은 낮췄습니다.",
        "coaching": "체중이 빠져도 골격근량이 유지되는지 4주마다 확인하세요.",
        "adjustments": {"countOffset": -1, "cardioFirst": False, "noImpact": True, "capHighIntensity": True},
        "splitCap": 2,
    },
}


def fat_level(sex, body_fat):
    """체지방률 → low / normal / high / very_high. 성별 기준이 다르다."""
    if not body_fat:
        return None
    cut = FAT_LEVELS.get(sex, FAT_LEVELS["남성"])

    if body_fat >= cut["very_high"]:
        return "very_high"
    if body_fat >= cut["high"]:
        return "high"
    if body_fat < cut["low"]:
        return "low"
    return "normal"


def muscle_index(height_cm, muscle_mass):
    """골격근량 지수(SMI) = 골격근량(kg) / 키(m)²."""
    if not height_cm or not muscle_mass:
        return None
    meters = height_cm / 100
    return _round1(muscle_mass / (meters * meters))


def muscle_level(sex, smi):
    """SMI → low / normal / high. 낮음은 근감소증 진단 기준을 쓴다."""
    if not smi:
        return None
    cut = MUSCLE_LEVELS.get(sex, MUSCLE_LEVELS["남성"])

    if smi < cut["low"]:
        return "low"
    if smi >= cut["high"]:
        return "high"
    return "normal"


def body_type_of(bmi, fat, muscle):
    """체지방률·골격근량까지 있을 때의 체형 유형.

    위에서부터 먼저 걸리는 것을 쓴다(안전이 급한 쪽이 위).
    판단할 재료가 없으면 None — 이때는 BMI 기준을 그대로 쓴다.
    """
    if not fat and not muscle:
        return None

    fatty = fat in ("high", "very_high")

    if muscle == "low" and fatty:
        return "sarcopenic_obese"
    if muscle == "low":
        return "low_muscle"
    if fatty and bmi is not None and bmi >= 25:
        return "obese"
    if fatty:
        return "skinny_fat"
    # BMI로는 과체중 이상인데 지방이 아닌 경우 = 근육이 무거운 것.
    if bmi is not None and bmi >= 23 and (fat == "low" or muscle == "high"):
        return "athletic"
    return None
