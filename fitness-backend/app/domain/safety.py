"""안전장치(contraindication check).

루틴을 만들기 전에 먼저 통과해야 하는 관문이다. 결과는 세 등급으로 나뉜다.

- block : 계획을 생성하지 않는다. 의료적 확인이 먼저 필요한 상태.
- warn  : 계획은 만들되 강도/동작/열량에 제한을 건다.
- info  : 알려만 준다.

여기서 만든 restrictions는 planner와 nutrition이 그대로 따른다.
"""

NONE_OPTION = "해당 없음"

# 온보딩 건강 문진 항목 (PAR-Q를 단순화한 형태)
RED_FLAGS = [
    NONE_OPTION,
    "운동 중 흉통이나 호흡 곤란을 겪은 적이 있다",
    "심장 질환 또는 고혈압으로 약을 복용 중이다",
    "임신 중이거나 출산 후 6주 이내다",
    "최근 3개월 안에 수술이나 골절이 있었다",
    "어지럼증이나 실신을 경험한 적이 있다",
    "쉬고 있을 때도 통증이 계속된다",
]

# 문진 항목 → (등급, 코드, 안내 문구, 제한)
RED_FLAG_RULES = {
    "운동 중 흉통이나 호흡 곤란을 겪은 적이 있다": (
        "block",
        "cardiac_symptom",
        "운동 중 흉통이나 호흡 곤란은 심혈관 문제의 신호일 수 있습니다. "
        "운동 계획을 만들기 전에 반드시 의사의 확인을 받으세요.",
        {},
    ),
    "어지럼증이나 실신을 경험한 적이 있다": (
        "block",
        "syncope",
        "어지럼증이나 실신 이력이 있으면 원인 확인 전 고강도 운동은 위험합니다. "
        "의료진 상담 후 이용해 주세요.",
        {},
    ),
    "쉬고 있을 때도 통증이 계속된다": (
        "block",
        "resting_pain",
        "안정 시에도 지속되는 통증은 단순 근육통이 아닐 수 있습니다. "
        "진료 후 통증 원인을 확인하고 다시 시도하세요.",
        {},
    ),
    "심장 질환 또는 고혈압으로 약을 복용 중이다": (
        "warn",
        "cardiac_medication",
        "심혈관 약물 복용 중에는 고강도 구간과 발살바(숨 참기) 호흡을 피해야 합니다. "
        "모든 세션을 중강도 이하로 낮췄습니다.",
        {"no_high_intensity": True, "no_valsalva": True},
    ),
    "임신 중이거나 출산 후 6주 이내다": (
        "warn",
        "pregnancy",
        "임신·산후 기간에는 열량 적자와 고충격 동작을 적용하지 않습니다. "
        "유지 열량 기준으로 계획했으며, 담당 의료진의 승인을 먼저 받으세요.",
        {"no_high_intensity": True, "no_impact": True, "no_deficit": True},
    ),
    "최근 3개월 안에 수술이나 골절이 있었다": (
        "warn",
        "recent_surgery",
        "수술·골절 후 3개월 이내에는 회복 조직에 부하가 몰리지 않도록 "
        "고강도와 고충격 동작을 제외했습니다.",
        {"no_high_intensity": True, "no_impact": True},
    ),
}

# 성별 최소 섭취 열량 (일반적인 안전 하한선)
CALORIE_FLOOR = {"남성": 1500, "여성": 1200}


def _empty_restrictions():
    return {
        "no_high_intensity": False,
        "no_impact": False,
        "no_deficit": False,
        "no_valsalva": False,
    }


def _bmi(profile):
    height_m = profile.height / 100
    if height_m <= 0:
        return 0
    return profile.weight / (height_m * height_m)


def check_profile(profile):
    """설문 응답을 점검해 (findings, restrictions, blocked)를 돌려준다."""
    findings = []
    restrictions = _empty_restrictions()

    def add(severity, code, message, extra=None):
        findings.append({"severity": severity, "code": code, "message": message})
        for key, value in (extra or {}).items():
            if value:
                restrictions[key] = True

    # 1) 건강 문진
    for flag in getattr(profile, "redFlags", []) or []:
        if flag == NONE_OPTION:
            continue
        rule = RED_FLAG_RULES.get(flag)
        if rule:
            severity, code, message, extra = rule
            add(severity, code, message, extra)

    # 2) 연령
    if profile.age < 16:
        add(
            "warn",
            "minor",
            "성장기에는 고중량 근력 훈련보다 동작 숙련과 체력 위주가 안전합니다. "
            "보호자와 지도자의 감독 아래 수행하세요.",
            {"no_high_intensity": True},
        )
    elif profile.age >= 65:
        add(
            "warn",
            "senior",
            "65세 이상은 고강도 구간에서 혈압 변동과 낙상 위험이 커집니다. "
            "중강도 이하로 구성하고 균형 운동을 함께 하세요.",
            {"no_high_intensity": True, "no_impact": True},
        )

    # 3) 체격 지표
    bmi = _bmi(profile)
    if bmi and bmi < 17.5:
        if profile.goal == "체중 감량":
            add(
                "block",
                "underweight_cut",
                f"현재 BMI가 {bmi:.1f}로 저체중 범위입니다. 이 상태에서 감량 목표는 "
                "건강을 해칠 수 있어 계획을 만들지 않습니다. 목표를 바꾸거나 전문가와 상담하세요.",
            )
        else:
            add(
                "warn",
                "underweight",
                f"현재 BMI가 {bmi:.1f}로 낮습니다. 열량 적자 없이 유지 이상으로 계획했습니다.",
                {"no_deficit": True},
            )
    elif bmi >= 35:
        add(
            "warn",
            "high_bmi",
            f"현재 BMI가 {bmi:.1f}입니다. 관절 부담을 줄이기 위해 점프 같은 고충격 동작을 제외했습니다.",
            {"no_impact": True},
        )

    # 4) 부상 부위
    injuries = [item for item in (profile.injuries or []) if item != NONE_OPTION]
    if len(injuries) >= 3:
        add(
            "warn",
            "multi_injury",
            f"주의 부위가 {len(injuries)}곳({', '.join(injuries)})입니다. 대체 동작으로 구성했지만, "
            "이 정도 범위라면 한 번은 전문가에게 직접 평가받는 편이 좋습니다.",
            {"no_high_intensity": True},
        )
    elif injuries:
        add(
            "info",
            "injury_substitution",
            f"{', '.join(injuries)}에 부담이 큰 동작은 대체 동작으로 교체합니다.",
        )

    # 5) 과훈련 위험
    if profile.frequency == "주 5일 이상" and profile.duration == "1시간 30분 이상":
        if profile.level in ("입문", "초보"):
            add(
                "warn",
                "overreaching",
                "경력 대비 훈련량이 많습니다. 부상과 중도 포기 위험이 커지므로 "
                "첫 4주는 주 3~4일로 시작하는 편을 권합니다.",
            )

    blocked = any(item["severity"] == "block" for item in findings)
    return findings, restrictions, blocked


def clamp_calories(calories, profile, restrictions):
    """안전 하한선 아래로는 절대 내려가지 않게 막는다."""
    floor = CALORIE_FLOOR.get(profile.sex, 1200)
    if restrictions.get("no_deficit"):
        return max(calories, floor)
    return max(calories, floor)


def summarize(findings):
    """프론트에 보여줄 한 줄 요약."""
    if not findings:
        return "안전 점검에서 특이사항이 없습니다."

    blocks = [f for f in findings if f["severity"] == "block"]
    if blocks:
        return "의료적 확인이 필요한 항목이 있어 루틴 생성을 중단했습니다."

    warns = [f for f in findings if f["severity"] == "warn"]
    if warns:
        return f"{len(warns)}건의 주의사항을 반영해 강도와 동작을 조정했습니다."

    return "안전 점검을 통과했습니다."
