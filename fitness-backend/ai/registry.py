"""모델 레지스트리.

선택 우선순위: 요청에서 지정한 모델 → 환경변수 FITNESS_AI_MODEL → 규칙 기반.
어떤 이유로든 실패하면 규칙 기반으로 되돌리고, 왜 되돌렸는지 응답에 남긴다.
조용히 다른 모델이 답하는 것이 가장 나쁜 동작이다.
"""

import logging
import os

from ai.base import CoachContext, CoachResult
from ai.claude_coach import ClaudeCoach
from ai.rule_based import RuleBasedCoach

logger = logging.getLogger(__name__)

DEFAULT_KEY = "rule_based"

_MODELS = [RuleBasedCoach(), ClaudeCoach()]
REGISTRY = {model.key: model for model in _MODELS}


def list_models():
    return [model.info() for model in _MODELS]


def available_keys():
    return [model.key for model in _MODELS if model.available()]


def multi_model_available():
    """모델 A/B 실험을 켤 수 있는가.

    자격 증명이 있다는 이유만으로 실험을 켜면 사용자 절반이 유료 API로 흘러간다.
    그래서 FITNESS_ENABLE_MODEL_AB=1 로 명시적으로 켤 때만 활성화한다.
    """
    if os.environ.get("FITNESS_ENABLE_MODEL_AB") != "1":
        return False
    return len(available_keys()) > 1


def default_key():
    preferred = os.environ.get("FITNESS_AI_MODEL")
    if preferred and preferred in REGISTRY and REGISTRY[preferred].available():
        return preferred
    return DEFAULT_KEY


def resolve(key=None):
    """요청한 모델을 돌려주되, 쓸 수 없으면 (모델, 사유)로 폴백 정보를 준다."""
    requested = key or default_key()

    model = REGISTRY.get(requested)
    if model is None:
        return REGISTRY[DEFAULT_KEY], requested, f"'{requested}'는 없는 모델입니다."

    if not model.available():
        return REGISTRY[DEFAULT_KEY], requested, model.unavailable_reason()

    return model, None, None


def generate(context: CoachContext, key=None) -> CoachResult:
    model, fallback_from, reason = resolve(key)

    if fallback_from:
        result = model.generate(context)
        result.fallback_from = fallback_from
        result.fallback_reason = reason
        return result

    try:
        return model.generate(context)
    except Exception as error:  # 외부 호출 실패로 기능 전체가 죽으면 안 된다.
        logger.warning("코칭 모델 %s 호출 실패: %s", model.key, error)
        result = REGISTRY[DEFAULT_KEY].generate(context)
        result.fallback_from = model.key
        result.fallback_reason = f"{type(error).__name__}: {error}"
        return result


def search_exercises(query, catalog, key=None):
    """운동 검색. 실패하면 규칙 기반으로 되돌리고 그 사실을 함께 돌려준다."""
    model, fallback_from, reason = resolve(key)

    if fallback_from:
        result = REGISTRY[DEFAULT_KEY].search_exercises(query, catalog)
        return {**result, "model": REGISTRY[DEFAULT_KEY].label,
                "fallbackFrom": fallback_from, "fallbackReason": reason}

    try:
        result = model.search_exercises(query, catalog)
        return {**result, "model": model.label, "fallbackFrom": None, "fallbackReason": None}
    except Exception as error:
        logger.warning("검색 모델 %s 실패: %s", model.key, error)
        result = REGISTRY[DEFAULT_KEY].search_exercises(query, catalog)
        return {**result, "model": REGISTRY[DEFAULT_KEY].label,
                "fallbackFrom": model.key, "fallbackReason": f"{type(error).__name__}: {error}"}
