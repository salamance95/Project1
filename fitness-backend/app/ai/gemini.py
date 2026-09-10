"""Gemini 기반 모델.

SDK 없이 REST로 호출한다. 의존성을 하나 더 늘릴 만큼 쓰는 기능이 많지 않고,
JS 쪽과 요청 모양을 똑같이 맞추기도 쉽다. (httpx도 requests도 없어 표준 라이브러리를 쓴다.)

자격 증명이 없으면 available()이 False가 되고 레지스트리가 규칙 기반으로 되돌린다.
호출 중 오류가 나면 예외를 그대로 올려서 레지스트리가 폴백을 기록하게 한다.
"""

import base64
import json
import os
import time
import urllib.error
import urllib.request

from app.ai.base import CoachContext, CoachModel, CoachResult
from app.ai.prompts import (
    BODY_PHOTO_SCHEMA,
    BODY_PHOTO_SYSTEM,
    COACH_SCHEMA,
    COACH_SYSTEM,
    PHOTO_SCHEMA,
    PHOTO_SYSTEM,
    PLAYLIST_SCHEMA,
    PLAYLIST_SYSTEM,
    build_coach_prompt,
    build_playlist_prompt,
    build_search_prompt,
)
from app.ai.search import SEARCH_SCHEMA, SEARCH_SYSTEM

DEFAULT_MODEL = "gemini-3.6-flash"
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"
TIMEOUT = 40.0


def _api_key():
    return (
        os.environ.get("GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
        or os.environ.get("GOOGLE_GENAI_API_KEY")
        or ""
    )


def _model_id():
    return os.environ.get("GEMINI_MODEL") or DEFAULT_MODEL


def to_gemini_schema(schema):
    """JSON Schema → Gemini responseSchema.

    Gemini는 OpenAPI 부분집합을 받는다. 타입 이름이 대문자이고
    additionalProperties 같은 키는 넣으면 400이 난다.
    """
    if not isinstance(schema, dict):
        return schema

    out = {}
    if "type" in schema:
        # ["number", "null"] 같은 유니언 타입은 Gemini가 400으로 거절한다.
        # 타입 하나 + nullable 로 풀어서 넘긴다.
        raw = schema["type"]
        types = raw if isinstance(raw, list) else [raw]
        actual = [item for item in types if item != "null"]
        out["type"] = str(actual[0] if actual else "string").upper()
        if len(actual) != len(types):
            out["nullable"] = True
    if "description" in schema:
        out["description"] = schema["description"]
    if "enum" in schema:
        out["enum"] = schema["enum"]

    if "properties" in schema:
        out["properties"] = {
            key: to_gemini_schema(value) for key, value in schema["properties"].items()
        }
        # 응답 필드 순서를 고정해 두면 결과가 덜 흔들린다.
        out["propertyOrdering"] = list(schema["properties"])
    if "required" in schema:
        out["required"] = schema["required"]
    if "items" in schema:
        out["items"] = to_gemini_schema(schema["items"])
    if "minItems" in schema:
        out["minItems"] = schema["minItems"]
    if "maxItems" in schema:
        out["maxItems"] = schema["maxItems"]

    return out


class GeminiCoach(CoachModel):
    key = "gemini"
    label = "Gemini"
    provider = "google"
    description = (
        "계획과 기록을 통째로 읽고 맥락에 맞는 코칭을 생성합니다. 사진과 자유 질문에도 답합니다."
    )

    def available(self) -> bool:
        return bool(_api_key())

    def unavailable_reason(self) -> str:
        return "자격 증명이 없습니다. GEMINI_API_KEY를 설정하세요."

    def _call(self, system, parts, schema, retried=False, config=None):
        """공통 호출부. parts를 받아 스키마에 맞는 JSON을 돌려준다."""
        body = json.dumps(
            {
                "systemInstruction": {"parts": [{"text": system}]},
                "contents": [{"role": "user", "parts": parts}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "responseSchema": to_gemini_schema(schema),
                    **(config or {}),
                },
            },
            ensure_ascii=False,
        ).encode("utf-8")

        request = urllib.request.Request(
            f"{ENDPOINT}/{_model_id()}:generateContent",
            data=body,
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": _api_key(),
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            # 본문에 원인이 적혀 있어서 그대로 올린다. (키 오류, 모델명 오타 등)
            detail = error.read().decode("utf-8", "replace")[:300]
            # 503(과부하)은 대개 몇 초 뒤에 풀리므로 한 번은 다시 시도한다.
            if 500 <= error.code < 600 and not retried:
                time.sleep(1.5)
                return self._call(system, parts, schema, retried=True, config=config)
            raise RuntimeError(f"Gemini {error.code}: {detail}") from error

        candidates = payload.get("candidates") or []
        if not candidates:
            blocked = (payload.get("promptFeedback") or {}).get("blockReason")
            raise RuntimeError(
                f"요청이 차단되었습니다 ({blocked})." if blocked else "빈 응답입니다."
            )

        candidate = candidates[0]
        finish = candidate.get("finishReason")
        if finish and finish not in ("STOP", "MAX_TOKENS"):
            raise RuntimeError(f"응답이 중단되었습니다 ({finish}).")

        text = "".join(
            part.get("text", "") for part in candidate.get("content", {}).get("parts", [])
        ).strip()

        if not text:
            raise RuntimeError("응답에 본문이 없습니다.")
        return json.loads(text)

    def generate(self, context: CoachContext) -> CoachResult:
        data = self._call(COACH_SYSTEM, [{"text": build_coach_prompt(context)}], COACH_SCHEMA)

        return CoachResult(
            lines=[line.strip() for line in data["lines"] if line.strip()],
            model=_model_id(),
            provider=self.provider,
        )

    def search_exercises(self, query, catalog):
        data = self._call(
            SEARCH_SYSTEM, [{"text": build_search_prompt(query, catalog)}], SEARCH_SCHEMA
        )

        # 없는 운동을 지어내도 여기서 걸러진다.
        valid = {item["slug"] for item in catalog}
        return {
            "matches": [m for m in data.get("matches", []) if m["slug"] in valid],
            "summary": data.get("summary", ""),
        }

    def analyze_meal_photo(self, image_bytes, media_type):
        encoded = base64.b64encode(image_bytes).decode("ascii")
        data = self._call(
            PHOTO_SYSTEM,
            [
                {"inline_data": {"mime_type": media_type, "data": encoded}},
                {"text": "이 사진의 음식과 양, 대략적인 영양소를 적어주세요."},
            ],
            PHOTO_SCHEMA,
        )

        foods = [item for item in data.get("foods", []) if item.get("name", "").strip()]

        return {
            # 텍스트 상자에 그대로 들어갈 문장. 사용자가 고칠 수 있다.
            "text": ", ".join(
                f"{item['name'].strip()} {item['amount']}{item['unit']}" for item in foods
            ),
            "foods": foods,
            "confidence": data.get("confidence", "medium"),
            "note": data.get("note", ""),
        }

    def build_playlist(self, genre, bpm, minutes, count):
        """장르와 길이 → 그 조건에 맞는 곡 목록."""
        # 곡을 나열하는 일이라 깊이 생각할 게 없다. 낮추면 3배 빨라진다.
        return self._call(
            PLAYLIST_SYSTEM,
            [{"text": build_playlist_prompt(genre, bpm, minutes, count)}],
            PLAYLIST_SCHEMA,
            config={"thinkingConfig": {"thinkingLevel": "low"}},
        )

    def analyze_body_photo(self, image_bytes, media_type):
        """체성분 결과지 사진 → 키·체중·BMI 수치."""
        encoded = base64.b64encode(image_bytes).decode("ascii")
        return self._call(
            BODY_PHOTO_SYSTEM,
            [
                {"inline_data": {"mime_type": media_type, "data": encoded}},
                {"text": "이 결과지에 적힌 키·체중·BMI 수치를 그대로 옮겨 적어주세요."},
            ],
            BODY_PHOTO_SCHEMA,
        )
