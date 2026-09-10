"""모델 레지스트리.

선택 우선순위: 요청에서 지정한 모델 → 환경변수 FITNESS_AI_MODEL → 규칙 기반.
어떤 이유로든 실패하면 규칙 기반으로 되돌리고, 왜 되돌렸는지 응답에 남긴다.
조용히 다른 모델이 답하는 것이 가장 나쁜 동작이다.
"""

import logging
import re
import os

from app.ai.base import CoachContext, CoachResult
from app.ai.claude_coach import ClaudeCoach
from app.ai.gemini import GeminiCoach
from app.ai.rule_based import RuleBasedCoach

logger = logging.getLogger(__name__)

DEFAULT_KEY = "rule_based"

_MODELS = [RuleBasedCoach(), ClaudeCoach(), GeminiCoach()]
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


def vision_key(key=None):
    """사진을 읽을 수 있는 모델을 고른다.

    규칙 기반은 사진을 못 보므로, 지정이 없으면 자격 증명이 있는 모델을 찾아 쓴다.
    (예전에는 FITNESS_AI_MODEL을 따로 지정해야만 사진 분석이 켜졌다.)
    """
    if key:
        return key

    preferred = default_key()
    if preferred != DEFAULT_KEY:
        return preferred

    usable = [item for item in available_keys() if item != DEFAULT_KEY]
    return usable[0] if usable else None


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


def analyze_meal_photo(image_bytes, media_type, key=None):
    """식사 사진 → 음식 텍스트. 사진을 읽을 수 있는 모델이 없으면 그 사실을 알린다."""
    model, fallback_from, reason = resolve(vision_key(key))

    if fallback_from or model.key == DEFAULT_KEY:
        return {
            "text": "",
            "available": False,
            "model": None,
            "reason": reason
            or "사진을 읽을 수 있는 AI 모델이 연결되어 있지 않습니다. "
               "음식과 양을 직접 적어주세요.",
        }

    try:
        result = model.analyze_meal_photo(image_bytes, media_type)
        return {**result, "available": True, "model": model.label, "reason": ""}
    except Exception as error:
        logger.warning("사진 분석 실패 (%s): %s", model.key, error)
        return {
            "text": "",
            "available": False,
            "model": model.label,
            "reason": f"사진을 분석하지 못했습니다 ({type(error).__name__}). 직접 적어주세요.",
        }


def analyze_body_photo(image_bytes, media_type, key=None):
    """체성분 결과지 사진 → 키·체중·BMI. 읽을 수 있는 모델이 없으면 그 사실을 알린다."""
    model, fallback_from, reason = resolve(vision_key(key))

    if fallback_from or model.key == DEFAULT_KEY:
        return {
            "reading": None,
            "available": False,
            "model": None,
            "reason": reason
            or "사진을 읽을 수 있는 AI 모델이 연결되어 있지 않습니다. "
               "키와 체중을 직접 입력해 주세요.",
        }

    try:
        reading = model.analyze_body_photo(image_bytes, media_type)
        return {"reading": reading, "available": True, "model": model.label, "reason": ""}
    except Exception as error:
        logger.warning("체성분 사진 분석 실패 (%s): %s", model.key, error)
        return {
            "reading": None,
            "available": False,
            "model": model.label,
            "reason": f"사진을 분석하지 못했습니다 ({type(error).__name__}). 직접 입력해 주세요.",
        }


def build_playlist(genre, bpm, minutes, count, key=None):
    """장르·길이에 맞는 곡 목록. 읽을 수 있는 모델이 없으면 그 사실을 알린다.

    화면은 이때 내장 대표 곡으로 내려간다.
    """
    model, fallback_from, reason = resolve(vision_key(key))

    if fallback_from or model.key == DEFAULT_KEY:
        return {
            "tracks": [],
            "available": False,
            "model": None,
            "reason": reason
            or "곡 목록을 짜 줄 AI 모델이 연결되어 있지 않아 기본 목록을 보여줍니다.",
        }

    try:
        result = model.build_playlist(genre, bpm, minutes, count)
        return {
            "tracks": result.get("tracks", []),
            "note": result.get("note", ""),
            "available": True,
            "model": model.label,
            "reason": "",
        }
    except Exception as error:
        logger.warning("플레이리스트 생성 실패 (%s): %s", model.key, error)
        return {
            "tracks": [],
            "available": False,
            "model": model.label,
            "reason": f"목록을 만들지 못해 기본 목록을 보여줍니다 — {_describe_ai_error(error)}.",
        }


def _describe_ai_error(error):
    """모델 오류를 사용자가 이해할 문장으로.

    원문에는 키·엔드포인트가 섞여 있어 그대로 내보낼 수 없다.
    """
    message = str(error)
    if " 429" in message:
        return "오늘 AI 사용량을 다 썼습니다"
    if re.search(r" 5\d\d", message):
        return "AI 서버가 잠시 혼잡합니다"
    if " 401" in message or " 403" in message:
        return "AI 자격 증명을 확인해 주세요"
    return "잠시 후 다시 눌러 주세요"
