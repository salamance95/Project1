"""Claude 기반 코칭 모델.

자격 증명이 없으면 available()이 False가 되고 레지스트리가 규칙 기반으로 되돌린다.
호출 중 오류가 나면 예외를 그대로 올려서 레지스트리가 폴백을 기록하게 한다.
"""

import json
import os
from pathlib import Path

from ai.base import CoachContext, CoachModel, CoachResult
from ai.search import SEARCH_SCHEMA, SEARCH_SYSTEM

MODEL_ID = "claude-opus-5"
MAX_TOKENS = 2048

SYSTEM_PROMPT = """당신은 피트니스 코치입니다. 사용자의 설문, 이번 주 계획, 실제 기록을 보고
행동으로 옮길 수 있는 조언만 한국어로 씁니다.

규칙
- 각 줄은 한 문장, 최대 60자. 3~5줄.
- 주어진 숫자만 인용하고 없는 수치를 만들지 않습니다.
- 의학적 진단이나 처방은 하지 않습니다. 통증이 지속되면 전문가 상담을 권합니다.
- 칭찬만 하거나 겁주지 않습니다. 다음에 무엇을 할지 말합니다."""

# 응답 형태를 스키마로 고정해 파싱 실패를 없앤다.
OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "lines": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 3,
            "maxItems": 5,
        }
    },
    "required": ["lines"],
    "additionalProperties": False,
}


def _has_credentials():
    if os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        return True
    # `ant auth login` 프로필도 SDK가 자동으로 읽는다.
    return (Path.home() / ".config" / "anthropic").exists()


class ClaudeCoach(CoachModel):
    key = "claude"
    label = f"Claude ({MODEL_ID})"
    provider = "anthropic"
    description = "계획과 기록을 통째로 읽고 맥락에 맞는 코칭을 생성합니다. 자유 질문에도 답합니다."

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

    def _build_prompt(self, context: CoachContext):
        payload = {"프로필": context.profile}

        if context.plan:
            payload["이번주계획"] = {
                "제목": context.plan.get("title"),
                "하루목표": context.plan.get("dailyTargets"),
                "요일별": [
                    {
                        "요일": day["day"],
                        "휴식": day["isRestDay"],
                        "포커스": day["workout"]["focus"],
                        "강도": day.get("intensityLabel"),
                        "열량": day["meal"]["calories"],
                        "단백질": day["meal"]["protein"],
                    }
                    for day in context.plan.get("schedule", [])
                ],
            }

        if context.report:
            payload["이번주기록"] = {
                "운동": context.report["workout"],
                "영양달성률": context.report["nutrition"]["rates"],
                "식단기록일수": context.report["nutrition"]["loggedDays"],
            }

        text = json.dumps(payload, ensure_ascii=False, indent=2)
        if context.question:
            return f"{text}\n\n사용자 질문: {context.question}\n\n위 자료를 근거로 답하세요."
        return f"{text}\n\n위 자료를 보고 이번 주 코칭을 작성하세요."

    def generate(self, context: CoachContext) -> CoachResult:
        import anthropic

        client = anthropic.Anthropic(timeout=30.0)

        response = client.beta.messages.create(
            model=MODEL_ID,
            max_tokens=MAX_TOKENS,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": self._build_prompt(context)}],
            thinking={"type": "adaptive"},
            output_config={"format": {"type": "json_schema", "schema": OUTPUT_SCHEMA}},
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

        # 목록은 그대로 넘긴다. 모델이 없는 운동을 지어내지 못하게 slug를 고정한다.
        listing = json.dumps(
            [
                {
                    "slug": item["slug"],
                    "name": item["name"],
                    "muscle": item["muscle"],
                    "equipment": item["equipment"],
                    "pattern": item["pattern"],
                    "risk": item["risk"],
                }
                for item in catalog
            ],
            ensure_ascii=False,
        )

        response = client.beta.messages.create(
            model=MODEL_ID,
            max_tokens=MAX_TOKENS,
            system=SEARCH_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": f"운동 목록:\n{listing}\n\n사용자 요청: {query}",
                }
            ],
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
