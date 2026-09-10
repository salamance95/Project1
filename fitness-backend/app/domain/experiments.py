"""A/B 테스트 프레임워크.

- 배정은 (사용자, 실험) 해시로 결정되므로 DB가 비어 있어도 같은 결과가 나온다.
  첫 배정은 DB에 저장해 고정한다. 나중에 가중치를 바꿔도 기존 사용자는 흔들리지 않는다.
- 지표는 노출(exposure)과 전환(conversion) 두 종류만 쓴다.
  전환율은 '노출된 사용자 중 전환한 사용자 수'로 계산한다(중복 이벤트에 영향받지 않음).
"""

import hashlib

from sqlalchemy import select

from app.persistence.models import ExperimentAssignment, ExperimentEvent

SALT = "fitness-ab-v1"

EXPERIMENTS = {
    "recommendation_order": {
        "description": "추천 목록의 첫 카드를 무엇으로 둘 때 플랜 선택률이 높은가",
        "variants": {"balanced_first": 50, "sustainable_first": 50},
        "exposure": "recommend_view",
        "goal": "plan_selected",
        "goalLabel": "플랜 선택",
    },
    "insight_tone": {
        "description": "리포트에서 경고를 먼저 보여줄 때와 잘한 점을 먼저 보여줄 때의 재방문·기록률",
        "variants": {"direct": 50, "supportive": 50},
        "exposure": "report_view",
        "goal": "workout_logged",
        "goalLabel": "운동 기록",
    },
    "coach_model": {
        "description": "AI 코칭을 어느 모델이 생성할 때 더 많이 읽고 기록으로 이어지는가",
        "variants": {"rule_based": 50, "claude": 50},
        "exposure": "coach_view",
        "goal": "workout_logged",
        "goalLabel": "운동 기록",
        # 사용 가능한 모델이 하나뿐이면 이 실험은 비교 의미가 없어 건너뛴다.
        "requires_multi_model": True,
    },
}


def _bucket(user_id, experiment):
    """0~99 사이의 안정적인 버킷 번호."""
    raw = f"{SALT}:{experiment}:{user_id}".encode("utf-8")
    return int(hashlib.sha1(raw).hexdigest()[:8], 16) % 100


def pick_variant(user_id, experiment):
    """가중치에 따라 변형을 고른다. 같은 입력이면 항상 같은 결과."""
    spec = EXPERIMENTS[experiment]
    bucket = _bucket(user_id, experiment)

    cursor = 0
    for variant, weight in spec["variants"].items():
        cursor += weight
        if bucket < cursor:
            return variant
    return list(spec["variants"])[-1]


def active_experiments(multi_model_available=False):
    return {
        key: spec
        for key, spec in EXPERIMENTS.items()
        if not spec.get("requires_multi_model") or multi_model_available
    }


def assign(db, user_id, experiment):
    """배정을 조회하거나 새로 만든다."""
    if experiment not in EXPERIMENTS:
        return None

    row = db.scalars(
        select(ExperimentAssignment).where(
            ExperimentAssignment.user_id == user_id,
            ExperimentAssignment.experiment == experiment,
        )
    ).first()

    if row is not None:
        return row.variant

    variant = pick_variant(user_id, experiment)
    db.add(ExperimentAssignment(user_id=user_id, experiment=experiment, variant=variant))
    db.commit()
    return variant


def assign_all(db, user_id, multi_model_available=False):
    return {
        key: assign(db, user_id, key)
        for key in active_experiments(multi_model_available)
    }


def record(db, user_id, experiment, event, value=1.0, once=False):
    """이벤트를 남긴다. once=True면 사용자당 한 번만 기록한다(노출용)."""
    if experiment not in EXPERIMENTS:
        return None

    variant = assign(db, user_id, experiment)

    if once:
        existing = db.scalars(
            select(ExperimentEvent).where(
                ExperimentEvent.user_id == user_id,
                ExperimentEvent.experiment == experiment,
                ExperimentEvent.event == event,
            )
        ).first()
        if existing is not None:
            return variant

    db.add(
        ExperimentEvent(
            user_id=user_id,
            experiment=experiment,
            variant=variant,
            event=event,
            value=value,
        )
    )
    db.commit()
    return variant


def record_goal(db, user_id, event):
    """이 이벤트를 목표로 삼는 모든 실험에 전환을 기록한다."""
    touched = []
    for key, spec in EXPERIMENTS.items():
        if spec["goal"] != event:
            continue
        # 노출된 적이 없으면 전환으로 세지 않는다(그 화면을 본 적 없는 사용자).
        exposed = db.scalars(
            select(ExperimentEvent).where(
                ExperimentEvent.user_id == user_id,
                ExperimentEvent.experiment == key,
                ExperimentEvent.event == spec["exposure"],
            )
        ).first()
        if exposed is None:
            continue
        record(db, user_id, key, event, once=True)
        touched.append(key)
    return touched


def _verdict(leader, tied, total_exposed):
    """표본이 적거나 동률이면 결론을 내지 않는다."""
    if not total_exposed:
        return "데이터 없음"
    if tied:
        return "변형 간 차이 없음"
    if total_exposed < 30:
        return f"{leader['variant']} 우세 (표본 {total_exposed}명, 판단하기 이릅니다)"
    return f"{leader['variant']} 우세"


def results(db, multi_model_available=False):
    """실험별 변형별 집계. 사용자 단위 중복을 제거해 센다."""
    assignments = db.scalars(select(ExperimentAssignment)).all()
    events = db.scalars(select(ExperimentEvent)).all()

    report = []
    for key, spec in active_experiments(multi_model_available).items():
        by_variant = {
            variant: {
                "variant": variant,
                "weight": weight,
                "assigned": 0,
                "exposed": 0,
                "converted": 0,
                "conversionRate": 0.0,
            }
            for variant, weight in spec["variants"].items()
        }

        for row in assignments:
            if row.experiment == key and row.variant in by_variant:
                by_variant[row.variant]["assigned"] += 1

        exposed_users = {variant: set() for variant in by_variant}
        converted_users = {variant: set() for variant in by_variant}

        for row in events:
            if row.experiment != key or row.variant not in by_variant:
                continue
            if row.event == spec["exposure"]:
                exposed_users[row.variant].add(row.user_id)
            elif row.event == spec["goal"]:
                converted_users[row.variant].add(row.user_id)

        for variant, stats in by_variant.items():
            stats["exposed"] = len(exposed_users[variant])
            stats["converted"] = len(converted_users[variant] & exposed_users[variant])
            stats["conversionRate"] = (
                round(stats["converted"] / stats["exposed"] * 100, 1)
                if stats["exposed"]
                else 0.0
            )

        variants = list(by_variant.values())
        total_exposed = sum(item["exposed"] for item in variants)
        ranked = sorted(variants, key=lambda item: -item["conversionRate"])
        leader = ranked[0]
        tied = len(ranked) > 1 and ranked[0]["conversionRate"] == ranked[1]["conversionRate"]

        report.append({
            "key": key,
            "description": spec["description"],
            "goal": spec["goal"],
            "goalLabel": spec["goalLabel"],
            "variants": variants,
            "totalExposed": total_exposed,
            # 표본이 적을 때 우열을 말하지 않는다. 우연히 갈린 차이를 결론처럼 읽으면 안 된다.
            "verdict": _verdict(leader, tied, total_exposed),
        })

    return report
