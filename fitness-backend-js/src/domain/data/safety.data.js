/**
 * 안전 점검 문항과 규칙.
 * 파이썬 원본에서 생성한 데이터입니다. 로직은 각 도메인 모듈에 있습니다.
 */

export const RED_FLAGS = [
  "해당 없음",
  "운동 중 흉통이나 호흡 곤란을 겪은 적이 있다",
  "심장 질환 또는 고혈압으로 약을 복용 중이다",
  "임신 중이거나 출산 후 6주 이내다",
  "최근 3개월 안에 수술이나 골절이 있었다",
  "어지럼증이나 실신을 경험한 적이 있다",
  "쉬고 있을 때도 통증이 계속된다"
];

export const NONE_OPTION = "해당 없음";

export const RED_FLAG_RULES = {
  "운동 중 흉통이나 호흡 곤란을 겪은 적이 있다": {
    "severity": "block",
    "code": "cardiac_symptom",
    "message": "운동 중 흉통이나 호흡 곤란은 심혈관 문제의 신호일 수 있습니다. 운동 계획을 만들기 전에 반드시 의사의 확인을 받으세요.",
    "restrictions": {}
  },
  "어지럼증이나 실신을 경험한 적이 있다": {
    "severity": "block",
    "code": "syncope",
    "message": "어지럼증이나 실신 이력이 있으면 원인 확인 전 고강도 운동은 위험합니다. 의료진 상담 후 이용해 주세요.",
    "restrictions": {}
  },
  "쉬고 있을 때도 통증이 계속된다": {
    "severity": "block",
    "code": "resting_pain",
    "message": "안정 시에도 지속되는 통증은 단순 근육통이 아닐 수 있습니다. 진료 후 통증 원인을 확인하고 다시 시도하세요.",
    "restrictions": {}
  },
  "심장 질환 또는 고혈압으로 약을 복용 중이다": {
    "severity": "warn",
    "code": "cardiac_medication",
    "message": "심혈관 약물 복용 중에는 고강도 구간과 발살바(숨 참기) 호흡을 피해야 합니다. 모든 세션을 중강도 이하로 낮췄습니다.",
    "restrictions": {
      "no_high_intensity": true,
      "no_valsalva": true
    }
  },
  "임신 중이거나 출산 후 6주 이내다": {
    "severity": "warn",
    "code": "pregnancy",
    "message": "임신·산후 기간에는 열량 적자와 고충격 동작을 적용하지 않습니다. 유지 열량 기준으로 계획했으며, 담당 의료진의 승인을 먼저 받으세요.",
    "restrictions": {
      "no_high_intensity": true,
      "no_impact": true,
      "no_deficit": true
    }
  },
  "최근 3개월 안에 수술이나 골절이 있었다": {
    "severity": "warn",
    "code": "recent_surgery",
    "message": "수술·골절 후 3개월 이내에는 회복 조직에 부하가 몰리지 않도록 고강도와 고충격 동작을 제외했습니다.",
    "restrictions": {
      "no_high_intensity": true,
      "no_impact": true
    }
  }
};

export const CALORIE_FLOOR = {
  "남성": 1500,
  "여성": 1200
};
