"""코칭 모델 공통 인터페이스.

모델을 갈아끼워도 호출부(main.py)는 그대로여야 한다. 그래서 입력은 CoachContext
하나로, 출력은 CoachResult 하나로 고정한다.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class CoachContext:
    """코칭 생성에 필요한 모든 것. 모델은 이 안에 있는 정보만 본다."""

    profile: Dict[str, Any] = field(default_factory=dict)
    plan: Optional[Dict[str, Any]] = None
    report: Optional[Dict[str, Any]] = None
    question: Optional[str] = None


@dataclass
class CoachResult:
    lines: List[str]
    model: str
    provider: str
    fallback_from: Optional[str] = None
    fallback_reason: Optional[str] = None

    def to_dict(self):
        return {
            "lines": self.lines,
            "model": self.model,
            "provider": self.provider,
            "fallbackFrom": self.fallback_from,
            "fallbackReason": self.fallback_reason,
        }


class CoachModel:
    """모든 코칭 모델이 구현하는 인터페이스."""

    key = "base"
    label = "기본"
    provider = "none"
    description = ""

    def available(self):
        """지금 이 모델을 쓸 수 있는가(패키지 설치, 자격 증명 등)."""
        raise NotImplementedError

    def unavailable_reason(self):
        return ""

    def generate(self, context: CoachContext) -> CoachResult:
        raise NotImplementedError

    def search_exercises(self, query, catalog):
        """검색어 + 운동 목록 → [{slug, reason}] 과 한 줄 요약."""
        raise NotImplementedError

    def analyze_meal_photo(self, image_bytes, media_type):
        """식사 사진 → 음식 이름과 양을 적은 한 줄 텍스트."""
        raise NotImplementedError

    def analyze_body_photo(self, image_bytes, media_type):
        """체성분 결과지 사진 → 키·체중·BMI 수치."""
        raise NotImplementedError

    def build_playlist(self, genre, bpm, minutes, count):
        """장르와 길이 → 그 조건에 맞는 곡 목록."""
        raise NotImplementedError

    def info(self):
        return {
            "key": self.key,
            "label": self.label,
            "provider": self.provider,
            "description": self.description,
            "available": self.available(),
            "reason": "" if self.available() else self.unavailable_reason(),
        }
