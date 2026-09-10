"""Claude 기반 코칭 모델.

자격 증명이 없으면 available()이 False가 되고 레지스트리가 규칙 기반으로 되돌린다.
호출 중 오류가 나면 예외를 그대로 올려서 레지스트리가 폴백을 기록하게 한다.
"""

import json
import os
from pathlib import Path

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

MODEL_ID = "claude-opus-5"
MAX_TOKENS = 2048

def _has_credentials():
    if os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        return True
    # `ant auth login` 프로필도 SDK가 자동으로 읽는다.
    return (Path.home() / ".config" / "anthropic").exists()


class ClaudeCoach(CoachModel):
    key = "claude"
    label = f"Claude ({MODEL_ID})"
    provider = "anthropic"
    description = "계획과 기록을 통째로 읽고 맥락에 맞는 코칭을 생성합니다. 사진과 자유 질문에도 답합니다."

    def available(self):
        try:
            import anthropic  # noqa: F401
        except ImportError:
            return False
        return _has_credentials()

    def unavailable_reason(self):
        try:
            import anthropic  # noqa: F401
        except ImportError:
            return "anthropic 패키지가 설치돼 있지 않습니다. pip install anthropic"
        return "자격 증명이 없습니다. ANTHROPIC_API_KEY를 설정하거나 ant auth login을 실행하세요."

    def generate(self, context: CoachContext) -> CoachResult:
        import anthropic

        client = anthropic.Anthropic(timeout=30.0)

        response = client.beta.messages.create(
            model=MODEL_ID,
            max_tokens=MAX_TOKENS,
            system=COACH_SYSTEM,
            messages=[{"role": "user", "content": build_coach_prompt(context)}],
            thinking={"type": "adaptive"},
            output_config={"format": {"type": "json_schema", "schema": COACH_SCHEMA}},
            # 정책상 거절되면 같은 호출 안에서 대체 모델로 다시 시도한다.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )

        if response.stop_reason == "refusal":
            raise RuntimeError("모델이 응답을 거절했습니다.")

        text = next(block.text for block in response.content if block.type == "text")
        data = json.loads(text)

        return CoachResult(
            lines=[line.strip() for line in data["lines"] if line.strip()],
            model=f"{MODEL_ID} ({response.model})" if response.model != MODEL_ID else MODEL_ID,
            provider=self.provider,
        )

    def search_exercises(self, query, catalog):
        import anthropic

        client = anthropic.Anthropic(timeout=20.0)

        response = client.beta.messages.create(
            model=MODEL_ID,
            max_tokens=MAX_TOKENS,
            system=SEARCH_SYSTEM,
            messages=[{"role": "user", "content": build_search_prompt(query, catalog)}],
            thinking={"type": "adaptive"},
            output_config={"format": {"type": "json_schema", "schema": SEARCH_SCHEMA}},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )

        if response.stop_reason == "refusal":
            raise RuntimeError("모델이 응답을 거절했습니다.")

        text = next(block.text for block in response.content if block.type == "text")
        data = json.loads(text)

        valid = {item["slug"] for item in catalog}
        matches = [item for item in data["matches"] if item["slug"] in valid]
        return {"matches": matches, "summary": data["summary"]}

    def analyze_meal_photo(self, image_bytes, media_type):
        """식사 사진에서 음식과 양을 읽어 한 줄 텍스트로 돌려준다.

        열량을 모델에게 직접 묻지 않는다. 음식 이름과 양만 받아서
        기존 음식 DB(foods.py)로 계산해야 화면에 보이는 수치와 어긋나지 않는다.
        """
        import base64

        import anthropic

        client = anthropic.Anthropic(timeout=40.0)
        encoded = base64.standard_b64encode(image_bytes).decode("utf-8")

        response = client.beta.messages.create(
            model=MODEL_ID,
            max_tokens=1024,
            system=PHOTO_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": encoded,
                            },
                        },
                        {"type": "text", "text": "이 사진의 음식과 양을 적어주세요."},
                    ],
                }
            ],
            thinking={"type": "adaptive"},
            output_config={"format": {"type": "json_schema", "schema": PHOTO_SCHEMA}},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )

        if response.stop_reason == "refusal":
            raise RuntimeError("모델이 응답을 거절했습니다.")

        text = next(block.text for block in response.content if block.type == "text")
        data = json.loads(text)

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
        import anthropic

        client = anthropic.Anthropic(timeout=60.0)
        response = client.beta.messages.create(
            model=MODEL_ID,
            max_tokens=4096,
            system=PLAYLIST_SYSTEM,
            messages=[
                {"role": "user", "content": build_playlist_prompt(genre, bpm, minutes, count)}
            ],
            thinking={"type": "adaptive"},
            output_config={"format": {"type": "json_schema", "schema": PLAYLIST_SCHEMA}},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )

        if response.stop_reason == "refusal":
            raise RuntimeError("모델이 응답을 거절했습니다.")

        text = next(block.text for block in response.content if block.type == "text")
        return json.loads(text)

    def analyze_body_photo(self, image_bytes, media_type):
        """체성분 결과지 사진 → 키·체중·BMI 수치."""
        import base64

        import anthropic

        client = anthropic.Anthropic(timeout=40.0)
        encoded = base64.standard_b64encode(image_bytes).decode("utf-8")

        response = client.beta.messages.create(
            model=MODEL_ID,
            max_tokens=1024,
            system=BODY_PHOTO_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": encoded,
                            },
                        },
                        {
                            "type": "text",
                            "text": "이 결과지에 적힌 키·체중·BMI 수치를 그대로 옮겨 적어주세요.",
                        },
                    ],
                }
            ],
            thinking={"type": "adaptive"},
            output_config={"format": {"type": "json_schema", "schema": BODY_PHOTO_SCHEMA}},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )

        if response.stop_reason == "refusal":
            raise RuntimeError("모델이 응답을 거절했습니다.")

        text = next(block.text for block in response.content if block.type == "text")
        return json.loads(text)
