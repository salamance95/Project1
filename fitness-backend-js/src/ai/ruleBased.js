/** 규칙 기반 코칭 모델. 기본값이며 외부 의존성이 없어 항상 사용 가능하다. */

import { coachingFor } from "../domain/planner.js";
import { CoachModel } from "./base.js";
import { ruleBasedSearch } from "./search.js";

export class RuleBasedCoach extends CoachModel {
  static key = "rule_based";
  static label = "규칙 기반 코치";
  static provider = "local";
  static description =
    "설문·계획·기록에서 규칙으로 코칭 문구를 만듭니다. 외부 호출이 없어 항상 동작합니다.";

  available() {
    return true;
  }

  async generate(context) {
    const lines = [];

    if (context.profile && Object.keys(context.profile).length > 0) {
      lines.push(...coachingFor(context.profile));
    }

    const { report } = context;
    if (report) {
      const { adherence, avgRpe } = report.workout;
      const proteinRate = report.nutrition.rates.protein;

      if (adherence >= 90) {
        lines.push(`이번 주 수행률 ${adherence}%입니다. 다음 주 볼륨을 조금 올려도 됩니다.`);
      } else if (adherence < 60) {
        lines.push(`이번 주 수행률 ${adherence}%입니다. 계획을 줄여서라도 완주하는 편이 낫습니다.`);
      }

      if (avgRpe && avgRpe >= 8.5) {
        lines.push(`평균 체감 강도 ${avgRpe}/10입니다. 한 세션은 의도적으로 가볍게 가세요.`);
      }

      if (report.nutrition.loggedDays >= 3 && proteinRate < 80) {
        lines.push(`단백질 달성률 ${proteinRate}%입니다. 매 끼니 단백질을 먼저 채우세요.`);
      }
    }

    if (context.question) {
      lines.push(
        "규칙 기반 모델은 정해진 지표만 해석합니다. 자유 질문에 답하려면 AI 모델을 연결하세요.",
      );
    }

    return { lines: lines.slice(0, 6), model: this.label, provider: this.provider };
  }

  async searchExercises(query, catalog) {
    const scored = ruleBasedSearch(query, catalog);
    const bySlug = new Set(catalog.map((item) => item.slug));

    const matches = scored
      .filter((item) => bySlug.has(item.slug))
      .map((item) => ({
        slug: item.slug,
        reason: item.reasons.slice(0, 2).join(", ") || "이름이 비슷함",
      }));

    const summary = query
      ? `'${query}'에 맞는 운동 ${matches.length}개를 찾았습니다.`
      : `전체 운동 ${matches.length}개입니다.`;

    return { matches, summary };
  }

  async analyzeMealPhoto() {
    throw new Error("규칙 기반 모델은 사진을 읽을 수 없습니다. 음식과 양을 직접 적어주세요.");
  }
}
