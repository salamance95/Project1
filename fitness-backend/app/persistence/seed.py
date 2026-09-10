"""테이블 생성과 마스터 데이터 시드. 앱 기동 시 한 번 호출된다."""

from sqlalchemy import inspect, select, text

from app.core.db import Base, engine
from app.domain.exercises import BODY_PARTS, EQUIPMENT, SEED_EXERCISES
from app.persistence.models import BodyPart, Equipment, Exercise, ExerciseRisk


def init_db():
    Base.metadata.create_all(bind=engine)
    _add_missing_columns()


def _add_missing_columns():
    """이전 버전 DB에 없는 컬럼만 붙인다. 있으면 그대로 둔다."""
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    wanted = [
        ("profiles", "split", "VARCHAR(20)"),
        ("users", "body_fat_pct", "FLOAT"),
        ("users", "muscle_mass_kg", "FLOAT"),
        ("set_logs", "distance_km", "FLOAT NOT NULL DEFAULT 0"),
    ]

    for table, column, definition in wanted:
        if table not in tables:
            continue
        columns = {row["name"] for row in inspector.get_columns(table)}
        if column in columns:
            continue
        with engine.begin() as connection:
            connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))


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
