"""규칙 기반 코칭 모델. 기본값이며 외부 의존성이 없어 항상 사용 가능하다."""

from app.ai.base import CoachContext, CoachModel, CoachResult
from app.ai.search import rule_based_search


class RuleBasedCoach(CoachModel):
    key = "rule_based"
    label = "규칙 기반 코치"
    provider = "local"
    description = "설문·계획·기록에서 규칙으로 코칭 문구를 만듭니다. 외부 호출이 없어 항상 동작합니다."

    def available(self):
        return True

    def generate(self, context: CoachContext) -> CoachResult:
        from app.domain.planner import coaching_for
        from app.schemas import OnboardingRequest

        lines = []

        if context.profile:
            payload = OnboardingRequest(**context.profile)
            lines.extend(coaching_for(payload))

        report = context.report
        if report:
            adherence = report["workout"]["adherence"]
            avg_rpe = report["workout"]["avgRpe"]
            protein_rate = report["nutrition"]["rates"]["protein"]

            if adherence >= 90:
                lines.append(f"이번 주 수행률 {adherence}%입니다. 다음 주 볼륨을 조금 올려도 됩니다.")
            elif adherence < 60:
                lines.append(
                    f"이번 주 수행률 {adherence}%입니다. 계획을 줄여서라도 완주하는 편이 낫습니다."
                )

            if avg_rpe and avg_rpe >= 8.5:
                lines.append(f"평균 체감 강도 {avg_rpe}/10입니다. 한 세션은 의도적으로 가볍게 가세요.")

            if report["nutrition"]["loggedDays"] >= 3 and protein_rate < 80:
                lines.append(f"단백질 달성률 {protein_rate}%입니다. 매 끼니 단백질을 먼저 채우세요.")

        if context.question:
            lines.append(
                "규칙 기반 모델은 정해진 지표만 해석합니다. 자유 질문에 답하려면 "
                "AI 모델을 연결하세요."
            )

        return CoachResult(lines=lines[:6], model=self.label, provider=self.provider)

    def search_exercises(self, query, catalog):
        scored = rule_based_search(query, catalog)
        by_slug = {item["slug"]: item for item in catalog}

        matches = [
            {
                "slug": item["slug"],
                "reason": ", ".join(item["reasons"][:2]) or "이름이 비슷함",
            }
            for item in scored
            if item["slug"] in by_slug
        ]

        summary = (
            f"'{query}'에 맞는 운동 {len(matches)}개를 찾았습니다."
            if query
            else f"전체 운동 {len(matches)}개입니다."
        )
        return {"matches": matches, "summary": summary}

    def analyze_meal_photo(self, image_bytes, media_type):
        raise NotImplementedError(
            "규칙 기반 모델은 사진을 읽을 수 없습니다. 음식과 양을 직접 적어주세요."
        )
