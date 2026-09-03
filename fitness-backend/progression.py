"""자동 루틴 재생성.

지난주 리포트를 읽고 다음 주 계획을 스스로 조정한다. 사람이 코치라면 볼 법한
세 가지 신호만 본다: 얼마나 지켰는가(수행률), 얼마나 힘들었는가(RPE),
어느 요일에 빠졌는가(패턴).
"""

from planner import DAYS, TRAINING_DAYS, VARIANTS

FREQUENCY_ORDER = ["주 2일", "주 3일", "주 4일", "주 5일 이상"]

MAX_COUNT_OFFSET = 1
MIN_COUNT_OFFSET = -2


def _shift_frequency(frequency, step):
    if frequency not in FREQUENCY_ORDER:
        return frequency
    index = FREQUENCY_ORDER.index(frequency) + step
    index = max(0, min(index, len(FREQUENCY_ORDER) - 1))
    return FREQUENCY_ORDER[index]


def _missed_weekdays(report):
    return [item["day"] for item in report["daily"] if item["workoutStatus"] == "missed"]


def _rebuild_training_days(frequency, missed_days, report):
    """반복해서 빠진 요일을 훈련일에서 빼고 실제로 소화한 요일로 옮긴다."""
    base = list(TRAINING_DAYS.get(frequency, TRAINING_DAYS["주 3일"]))
    if not missed_days:
        return None

    # 계획에 있었지만 빠진 요일
    drop = [day for day in base if day in missed_days]
    if not drop:
        return None

    # 후보: 계획에 없던 요일 중, 지난주에 미수행으로 찍히지 않은 요일
    candidates = [day for day in DAYS if day not in base and day not in missed_days]
    if not candidates:
        return None

    rebuilt = [day for day in base if day not in drop]
    for _ in drop:
        if not candidates:
            break
        rebuilt.append(candidates.pop(0))

    rebuilt.sort(key=DAYS.index)
    return rebuilt if rebuilt != base else None


def analyze(report, profile, current_variant, current_offset=0):
    """지난주 리포트 → 다음 주 조정안."""
    adherence = report["workout"]["adherence"]
    avg_rpe = report["workout"]["avgRpe"]
    protein_rate = report["nutrition"]["rates"]["protein"]
    logged_days = report["nutrition"]["loggedDays"]

    frequency = profile.frequency
    variant_id = current_variant
    count_offset = current_offset
    reasons = []
    mode = "maintain"

    if avg_rpe is not None and avg_rpe >= 8.5:
        # 체감 강도가 계속 높으면 수행률과 무관하게 먼저 덜어낸다.
        mode = "deload"
        count_offset = max(count_offset - 1, MIN_COUNT_OFFSET)
        reasons.append(
            f"평균 체감 강도가 {avg_rpe}/10로 높아 다음 주는 세션당 동작을 하나 줄인 "
            "디로드 주간으로 구성했습니다."
        )
    elif adherence < 60:
        mode = "scale_down"
        new_frequency = _shift_frequency(frequency, -1)
        if new_frequency != frequency:
            reasons.append(
                f"수행률이 {adherence}%에 그쳐 훈련일을 {frequency}에서 {new_frequency}로 줄였습니다. "
                "지킬 수 있는 계획이 좋은 계획입니다."
            )
            frequency = new_frequency
        else:
            count_offset = max(count_offset - 1, MIN_COUNT_OFFSET)
            reasons.append(
                f"수행률이 {adherence}%로 낮아 세션당 동작 수를 줄였습니다."
            )
        if variant_id != "sustainable":
            variant_id = "sustainable"
            reasons.append("완주율이 가장 높은 '지속 가능형' 구성으로 바꿨습니다.")
    elif adherence >= 90 and (avg_rpe is None or avg_rpe <= 7.5):
        mode = "progress"
        if count_offset < MAX_COUNT_OFFSET:
            count_offset += 1
            reasons.append(
                f"수행률 {adherence}%에 여유도 있어 세션당 동작을 하나 늘렸습니다."
            )
        else:
            new_frequency = _shift_frequency(frequency, 1)
            if new_frequency != frequency:
                reasons.append(
                    f"볼륨을 더 올릴 여지가 있어 훈련일을 {frequency}에서 {new_frequency}로 늘렸습니다."
                )
                frequency = new_frequency
            else:
                reasons.append("현재 구성이 상한입니다. 같은 계획에서 중량을 올려보세요.")
    else:
        reasons.append(
            f"수행률 {adherence}%로 무리 없이 진행 중입니다. 구성을 유지하고 중량만 점진적으로 "
            "올리세요."
        )

    # 요일 패턴 보정
    missed_days = _missed_weekdays(report)
    training_days = _rebuild_training_days(frequency, missed_days, report)
    if training_days:
        reasons.append(
            f"{', '.join(missed_days)}요일에 빠짐이 반복돼 훈련일을 "
            f"{', '.join(training_days)}요일로 옮겼습니다."
        )

    # 영양 코멘트
    if logged_days >= 3 and protein_rate < 80:
        reasons.append(
            f"단백질 달성률이 {protein_rate}%였습니다. 다음 주는 매 끼니 단백질을 먼저 채우세요."
        )

    return {
        "mode": mode,
        "frequency": frequency,
        "variantId": variant_id,
        "countOffset": count_offset,
        "trainingDays": training_days,
        "reasons": reasons,
    }


def variant_by_id(variant_id):
    for variant in VARIANTS:
        if variant["id"] == variant_id:
            return variant
    return VARIANTS[0]
