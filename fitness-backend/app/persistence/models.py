"""정규화된 ORM 스키마.

설계 원칙
- 마스터 데이터(부위, 운동)와 사용자 데이터를 분리한다.
- 반복되는 문자열(부상 부위, 운동명)은 참조 테이블로 빼고 FK로만 연결한다.
- 계획(plan)과 실제 기록(log)을 분리해 "계획 대비 실제" 비교가 가능하게 한다.
"""

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


# ------------------------------------------------------------- 마스터 데이터

class BodyPart(Base):
    """부상/주의 부위 마스터. 온보딩 선택지와 운동 위험도가 공유한다."""

    __tablename__ = "body_parts"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)


class Equipment(Base):
    """가용 기구 마스터. 온보딩 선택지와 운동 요구 기구가 공유한다."""

    __tablename__ = "equipment"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)


class Exercise(Base):
    """운동 마스터. 루틴 생성기가 이 테이블을 읽어 동작을 고른다."""

    __tablename__ = "exercises"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    pattern: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    muscle: Mapped[str] = mapped_column(String(20), nullable=False, default="전신")
    equipment_id: Mapped[int | None] = mapped_column(
        ForeignKey("equipment.id", ondelete="SET NULL"), nullable=True
    )
    load: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_high_impact: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    alt_slug: Mapped[str | None] = mapped_column(String(60), nullable=True)

    equipment: Mapped["Equipment | None"] = relationship()
    risks: Mapped[list["ExerciseRisk"]] = relationship(
        back_populates="exercise", cascade="all, delete-orphan"
    )


class ExerciseRisk(Base):
    """운동 ↔ 주의 부위 다대다."""

    __tablename__ = "exercise_risks"
    __table_args__ = (UniqueConstraint("exercise_id", "body_part_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id", ondelete="CASCADE"))
    body_part_id: Mapped[int] = mapped_column(ForeignKey("body_parts.id", ondelete="CASCADE"))

    exercise: Mapped[Exercise] = relationship(back_populates="risks")
    body_part: Mapped[BodyPart] = relationship()


# ------------------------------------------------------------- 사용자와 설문

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    display_name: Mapped[str | None] = mapped_column(String(60), nullable=True)
    sex: Mapped[str] = mapped_column(String(10), nullable=False)
    age: Mapped[int] = mapped_column(Integer, nullable=False)
    height_cm: Mapped[float] = mapped_column(Float, nullable=False)
    weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    body_fat_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    muscle_mass_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    profiles: Mapped[list["Profile"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class SupabaseIdentity(Base):
    """Supabase Auth user id to local numeric user id mapping."""

    __tablename__ = "supabase_identities"

    id: Mapped[int] = mapped_column(primary_key=True)
    supabase_user_id: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    user: Mapped[User | None] = relationship()


class Profile(Base):
    """설문 응답 1회분. 다시 설문하면 새 행이 쌓이고 최신 것만 active."""

    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    goal: Mapped[str] = mapped_column(String(40), nullable=False)
    level: Mapped[str] = mapped_column(String(20), nullable=False)
    frequency: Mapped[str] = mapped_column(String(20), nullable=False)
    split: Mapped[str | None] = mapped_column(String(20), nullable=True)
    duration: Mapped[str] = mapped_column(String(20), nullable=False)
    style: Mapped[str] = mapped_column(String(20), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped[User] = relationship(back_populates="profiles")
    injuries: Mapped[list["ProfileInjury"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan"
    )
    equipment: Mapped[list["ProfileEquipment"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan"
    )
    safety_flags: Mapped[list["SafetyFlag"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan"
    )


class ProfileInjury(Base):
    """설문 ↔ 주의 부위 다대다."""

    __tablename__ = "profile_injuries"
    __table_args__ = (UniqueConstraint("profile_id", "body_part_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    body_part_id: Mapped[int] = mapped_column(ForeignKey("body_parts.id", ondelete="CASCADE"))

    profile: Mapped[Profile] = relationship(back_populates="injuries")
    body_part: Mapped[BodyPart] = relationship()


class ProfileEquipment(Base):
    """설문 ↔ 가용 기구 다대다."""

    __tablename__ = "profile_equipment"
    __table_args__ = (UniqueConstraint("profile_id", "equipment_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    equipment_id: Mapped[int] = mapped_column(ForeignKey("equipment.id", ondelete="CASCADE"))

    profile: Mapped["Profile"] = relationship(back_populates="equipment")
    equipment: Mapped[Equipment] = relationship()


class SafetyFlag(Base):
    """안전 점검 결과. 차단/경고 이력을 남겨 추후 감사에 쓴다."""

    __tablename__ = "safety_flags"

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    severity: Mapped[str] = mapped_column(String(10), nullable=False)  # block / warn / info
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    profile: Mapped[Profile] = relationship(back_populates="safety_flags")


# --------------------------------------------------------------------- 계획

class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    variant: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    week_start: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    baseline_calories: Mapped[int] = mapped_column(Integer, nullable=False)
    baseline_protein: Mapped[int] = mapped_column(Integer, nullable=False)
    baseline_carbs: Mapped[int] = mapped_column(Integer, nullable=False)
    baseline_fat: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    days: Mapped[list["PlanDay"]] = relationship(
        back_populates="plan", cascade="all, delete-orphan", order_by="PlanDay.day_index"
    )
    adjustments: Mapped[list["Adjustment"]] = relationship(
        back_populates="plan", cascade="all, delete-orphan"
    )


class PlanDay(Base):
    __tablename__ = "plan_days"
    __table_args__ = (UniqueConstraint("plan_id", "day_index"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plans.id", ondelete="CASCADE"), index=True)
    day_index: Mapped[int] = mapped_column(Integer, nullable=False)  # 0=월 … 6=일
    is_rest: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    intensity: Mapped[str] = mapped_column(String(10), nullable=False)
    focus: Mapped[str] = mapped_column(String(60), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str | None] = mapped_column(String(20), nullable=True)

    plan: Mapped[Plan] = relationship(back_populates="days")
    items: Mapped[list["PlanDayExercise"]] = relationship(
        back_populates="day", cascade="all, delete-orphan", order_by="PlanDayExercise.position"
    )
    meal: Mapped["MealTarget"] = relationship(
        back_populates="day", cascade="all, delete-orphan", uselist=False
    )


class PlanDayExercise(Base):
    """그날 배정된 동작 한 줄. 처방(세트x횟수)은 계획값이라 로그와 분리한다."""

    __tablename__ = "plan_day_exercises"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_day_id: Mapped[int] = mapped_column(ForeignKey("plan_days.id", ondelete="CASCADE"), index=True)
    exercise_id: Mapped[int | None] = mapped_column(
        ForeignKey("exercises.id", ondelete="SET NULL"), nullable=True
    )
    display_name: Mapped[str] = mapped_column(String(80), nullable=False)
    muscle: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    prescription: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    day: Mapped[PlanDay] = relationship(back_populates="items")
    exercise: Mapped[Exercise | None] = relationship()


class MealTarget(Base):
    """요일별 식단 목표. 운동 강도에 맞춰 계산된 값이 들어간다."""

    __tablename__ = "meal_targets"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_day_id: Mapped[int] = mapped_column(
        ForeignKey("plan_days.id", ondelete="CASCADE"), unique=True, index=True
    )
    target_text: Mapped[str] = mapped_column(String(120), nullable=False)
    calories: Mapped[int] = mapped_column(Integer, nullable=False)
    protein: Mapped[int] = mapped_column(Integer, nullable=False)
    carbs: Mapped[int] = mapped_column(Integer, nullable=False)
    fat: Mapped[int] = mapped_column(Integer, nullable=False)
    breakfast: Mapped[str] = mapped_column(String(200), default="")
    lunch: Mapped[str] = mapped_column(String(200), default="")
    dinner: Mapped[str] = mapped_column(String(200), default="")
    snack: Mapped[str] = mapped_column(String(200), default="")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    day: Mapped[PlanDay] = relationship(back_populates="meal")


# --------------------------------------------------------------------- 기록

class WorkoutLog(Base):
    """하루치 운동 수행 기록."""

    __tablename__ = "workout_logs"
    __table_args__ = (UniqueConstraint("user_id", "log_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    plan_day_id: Mapped[int | None] = mapped_column(
        ForeignKey("plan_days.id", ondelete="SET NULL"), nullable=True
    )
    log_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(12), nullable=False)  # done / partial / missed
    duration_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rpe: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 자각 강도 1~10
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    sets: Mapped[list["SetLog"]] = relationship(
        back_populates="workout", cascade="all, delete-orphan"
    )


class SetLog(Base):
    """세트 단위 기록. 볼륨(무게x횟수) 계산의 원천."""

    __tablename__ = "set_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    workout_log_id: Mapped[int] = mapped_column(
        ForeignKey("workout_logs.id", ondelete="CASCADE"), index=True
    )
    exercise_id: Mapped[int | None] = mapped_column(
        ForeignKey("exercises.id", ondelete="SET NULL"), nullable=True
    )
    exercise_name: Mapped[str] = mapped_column(String(80), nullable=False)
    set_no: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    weight_kg: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    reps: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 걷기·자전거처럼 거리로 재는 운동만 채운다.
    distance_km: Mapped[float] = mapped_column(Float, nullable=False, default=0)

    workout: Mapped[WorkoutLog] = relationship(back_populates="sets")
    exercise: Mapped[Exercise | None] = relationship()


class MusicLink(Base):
    """사용자가 직접 저장한 플레이리스트 링크. 음원이 아니라 링크만 갖는다."""

    __tablename__ = "music_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(60), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class MealLog(Base):
    """끼니 단위 식단 기록."""

    __tablename__ = "meal_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    log_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    meal_type: Mapped[str] = mapped_column(String(12), nullable=False)  # 아침/점심/저녁/간식
    description: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    calories: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    protein: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    carbs: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fat: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DiningEventLog(Base):
    """회식/외식 일정과 그때 적용한 보정량."""

    __tablename__ = "dining_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    plan_id: Mapped[int | None] = mapped_column(ForeignKey("plans.id", ondelete="CASCADE"), nullable=True)
    day_index: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(String(20), nullable=False)
    cuisine: Mapped[str] = mapped_column(String(30), nullable=False)
    alcohol: Mapped[str] = mapped_column(String(20), nullable=False)
    surplus_kcal: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    applied_kcal: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Adjustment(Base):
    """재배치/보정 이력. 주간 리포트에서 '무엇이 왜 밀렸는지' 설명에 쓴다."""

    __tablename__ = "adjustments"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plans.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # missed / event
    day_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    plan: Mapped[Plan] = relationship(back_populates="adjustments")


# --------------------------------------------------------- 게이미피케이션

class PointEvent(Base):
    """포인트 원장. (사용자, 날짜, 종류)로 유일해 재계산해도 중복 지급되지 않는다."""

    __tablename__ = "point_events"
    __table_args__ = (UniqueConstraint("user_id", "log_date", "kind"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    log_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reason: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class UserBadge(Base):
    """획득한 뱃지. 한 번 얻으면 유지된다."""

    __tablename__ = "user_badges"
    __table_args__ = (UniqueConstraint("user_id", "code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    earned_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ------------------------------------------------------------- A/B 테스트

class ExperimentAssignment(Base):
    """실험 배정. 한 번 배정되면 고정돼 사용자가 매번 같은 변형을 본다."""

    __tablename__ = "experiment_assignments"
    __table_args__ = (UniqueConstraint("user_id", "experiment"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    experiment: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    variant: Mapped[str] = mapped_column(String(40), nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ExperimentEvent(Base):
    """실험 지표 이벤트. 노출(exposure)과 전환(conversion)을 같은 표에 남긴다."""

    __tablename__ = "experiment_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    experiment: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    variant: Mapped[str] = mapped_column(String(40), nullable=False)
    event: Mapped[str] = mapped_column(String(40), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
