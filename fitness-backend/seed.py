"""테이블 생성과 마스터 데이터 시드. 앱 기동 시 한 번 호출된다."""

from sqlalchemy import select

from db import Base, engine
from exercises import BODY_PARTS, EQUIPMENT, SEED_EXERCISES
from models import BodyPart, Equipment, Exercise, ExerciseRisk


def init_db():
    Base.metadata.create_all(bind=engine)


def seed_master(db):
    """부위/기구/운동 마스터를 채운다. 여러 번 호출해도 안전하다."""
    parts = {row.name: row for row in db.scalars(select(BodyPart)).all()}
    for name in BODY_PARTS:
        if name not in parts:
            part = BodyPart(name=name)
            db.add(part)
            parts[name] = part

    gear = {row.name: row for row in db.scalars(select(Equipment)).all()}
    for name in EQUIPMENT:
        if name not in gear:
            item = Equipment(name=name)
            db.add(item)
            gear[name] = item
    db.flush()

    existing = {row.slug: row for row in db.scalars(select(Exercise)).all()}
    for item in SEED_EXERCISES:
        exercise = existing.get(item["slug"])
        if exercise is None:
            exercise = Exercise(slug=item["slug"])
            db.add(exercise)
            existing[item["slug"]] = exercise

        exercise.name = item["name"]
        exercise.pattern = item["pattern"]
        exercise.muscle = item["muscle"]
        exercise.equipment_id = gear[item["equipment"]].id
        exercise.load = item["load"]
        exercise.is_high_impact = item["impact"]
        exercise.alt_slug = item["alt"]
    db.flush()

    # 위험 부위 매핑을 시드 기준으로 맞춘다.
    for item in SEED_EXERCISES:
        exercise = existing[item["slug"]]
        wanted = {parts[name].id for name in item["risk"]}
        current = {risk.body_part_id for risk in exercise.risks}

        for risk in list(exercise.risks):
            if risk.body_part_id not in wanted:
                exercise.risks.remove(risk)

        for body_part_id in wanted - current:
            exercise.risks.append(ExerciseRisk(body_part_id=body_part_id))

    db.commit()
