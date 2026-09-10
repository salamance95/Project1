"""요청/응답 pydantic 스키마."""

import re
from datetime import date
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


class OnboardingRequest(BaseModel):
    """설문 응답. 규칙 엔진(planner/nutrition/safety)이 그대로 받는 형태이기도 하다."""

    goal: str
    level: str
    frequency: str
    split: str = "자동 추천"
    duration: str
    style: str
    injuries: List[str] = Field(default_factory=list)
    redFlags: List[str] = Field(default_factory=list)
    equipment: List[str] = Field(default_factory=list)  # 비어 있으면 맨몸만 가능한 것으로 본다

    sex: str = "남성"
    age: int = Field(default=30, ge=10, le=100)
    height: float = Field(default=172.0, gt=100, lt=250)
    weight: float = Field(default=70.0, gt=25, lt=300)
    # 체성분 측정값. 없으면 키·체중만으로 판단한다.
    bodyFat: Optional[float] = Field(default=None, gt=3, lt=70)
    muscleMass: Optional[float] = Field(default=None, gt=10, lt=80)

    @field_validator("bodyFat", "muscleMass", mode="before")
    @classmethod
    def _blank_is_none(cls, value):
        """빈 칸("")은 "안 잰 값"으로 본다. 폼에서 지운 값이 그대로 올 수 있다."""
        return None if value == "" else value

    userId: Optional[int] = None


class PlanSelectRequest(BaseModel):
    userId: int
    plan: Dict[str, Any]
    weekStart: Optional[date] = None


class SupabaseLinkRequest(BaseModel):
    supabaseUserId: str = Field(min_length=1, max_length=120)
    email: Optional[str] = Field(default=None, max_length=255)
    displayName: Optional[str] = Field(default=None, max_length=120)
    userId: Optional[int] = None


class SwapExerciseRequest(BaseModel):
    userId: int
    planId: int
    day: str
    position: int = Field(ge=0)
    slug: str


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
    # 거리로 재는 유산소만 채운다.
    distanceKm: float = 0


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


class MusicLinkRequest(BaseModel):
    userId: int
    label: str = Field(min_length=1, max_length=60)
    url: str = Field(max_length=500)

    @field_validator("url")
    @classmethod
    def _http_only(cls, value):
        """링크를 화면에서 그대로 여는 만큼 http(s)만 받는다."""
        text = (value or "").strip()
        if not re.match(r"^https?://", text, re.IGNORECASE):
            raise ValueError("http 또는 https 주소만 넣을 수 있습니다.")
        return text

    @field_validator("label")
    @classmethod
    def _trim(cls, value):
        return (value or "").strip()


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
