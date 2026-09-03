"""요청/응답 pydantic 스키마."""

from datetime import date
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class OnboardingRequest(BaseModel):
    """설문 응답. 규칙 엔진(planner/nutrition/safety)이 그대로 받는 형태이기도 하다."""

    goal: str
    level: str
    frequency: str
    duration: str
    style: str
    injuries: List[str] = Field(default_factory=list)
    redFlags: List[str] = Field(default_factory=list)
    equipment: List[str] = Field(default_factory=list)  # 비어 있으면 맨몸만 가능한 것으로 본다

    sex: str = "남성"
    age: int = Field(default=30, ge=10, le=100)
    height: float = Field(default=172.0, gt=100, lt=250)
    weight: float = Field(default=70.0, gt=25, lt=300)

    userId: Optional[int] = None


class PlanSelectRequest(BaseModel):
    userId: int
    plan: Dict[str, Any]
    weekStart: Optional[date] = None


class RescheduleRequest(BaseModel):
    userId: int
    planId: int
    missedDay: str
    completedDays: List[str] = Field(default_factory=list)


class DiningEvent(BaseModel):
    day: str
    type: str = "회식"
    cuisine: str = "한식(백반/찌개)"
    alcohol: str = "없음"


class DiningRequest(BaseModel):
    userId: int
    planId: int
    event: DiningEvent


class SetEntry(BaseModel):
    """운동 한 줄. sets개의 세트를 같은 무게·횟수로 수행한 것으로 본다."""

    exerciseId: Optional[int] = None
    slug: Optional[str] = None
    exerciseName: str
    sets: int = 1
    setNo: int = 1
    weightKg: float = 0
    reps: int = 0


class WorkoutLogRequest(BaseModel):
    userId: int
    date: date
    planDayId: Optional[int] = None
    status: str = "done"  # done / partial / missed
    durationMin: Optional[int] = None
    rpe: Optional[int] = Field(default=None, ge=1, le=10)
    note: Optional[str] = None
    sets: List[SetEntry] = Field(default_factory=list)


class MealLogRequest(BaseModel):
    userId: int
    date: date
    mealType: str
    description: str = ""
    # 값을 주지 않으면 description에서 자동 추정한다.
    calories: int = 0
    protein: int = 0
    carbs: int = 0
    fat: int = 0


class EstimateRequest(BaseModel):
    text: str


class RegenerateRequest(BaseModel):
    userId: int
    weekStart: Optional[date] = None  # 분석할 주 (기본: 현재 활성 계획의 주)
    apply: bool = True  # False면 조정안만 미리보고 저장하지 않는다


class ExperimentEventRequest(BaseModel):
    userId: int
    experiment: str
    event: str
    value: float = 1.0


class CoachRequest(BaseModel):
    userId: int
    model: Optional[str] = None       # 미지정이면 실험 배정 또는 기본 모델
    question: Optional[str] = None
    includeReport: bool = True
