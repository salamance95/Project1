/**
 * A/B 실험 정의.
 * 파이썬 원본에서 생성한 데이터입니다. 로직은 각 도메인 모듈에 있습니다.
 */

export const EXPERIMENTS = {
  "recommendation_order": {
    "description": "추천 목록의 첫 카드를 무엇으로 둘 때 플랜 선택률이 높은가",
    "variants": {
      "balanced_first": 50,
      "sustainable_first": 50
    },
    "exposure": "recommend_view",
    "goal": "plan_selected",
    "goalLabel": "플랜 선택"
  },
  "insight_tone": {
    "description": "리포트에서 경고를 먼저 보여줄 때와 잘한 점을 먼저 보여줄 때의 재방문·기록률",
    "variants": {
      "direct": 50,
      "supportive": 50
    },
    "exposure": "report_view",
    "goal": "workout_logged",
    "goalLabel": "운동 기록"
  },
  "coach_model": {
    "description": "AI 코칭을 어느 모델이 생성할 때 더 많이 읽고 기록으로 이어지는가",
    "variants": {
      "rule_based": 50,
      "claude": 50
    },
    "exposure": "coach_view",
    "goal": "workout_logged",
    "goalLabel": "운동 기록",
    "requires_multi_model": true
  }
};

export const SALT = "fitness-ab-v1";
