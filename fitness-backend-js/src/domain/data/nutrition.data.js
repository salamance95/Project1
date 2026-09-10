/**
 * 열량·매크로 계수와 식단 템플릿.
 * 파이썬 원본에서 생성한 데이터입니다. 로직은 각 도메인 모듈에 있습니다.
 */

export const ACTIVITY_BY_FREQUENCY = {
  "주 2일": 1.375,
  "주 3일": 1.45,
  "주 4일": 1.525,
  "주 5일 이상": 1.6
};

export const DURATION_BONUS = {
  "30분 이하": -0.025,
  "45분~1시간": 0.0,
  "1시간 30분 이상": 0.05
};

export const GOAL_PROFILE = {
  "체중 감량": {
    "calorie_factor": 0.82,
    "protein_per_kg": 2.0,
    "fat_ratio": 0.27
  },
  "근육량 증가": {
    "calorie_factor": 1.1,
    "protein_per_kg": 1.8,
    "fat_ratio": 0.25
  },
  "기초 체력 향상": {
    "calorie_factor": 1.0,
    "protein_per_kg": 1.5,
    "fat_ratio": 0.28
  },
  "자세 교정 및 코어 강화": {
    "calorie_factor": 0.98,
    "protein_per_kg": 1.6,
    "fat_ratio": 0.28
  }
};

export const INTENSITY_FACTOR = {
  "high": {
    "calories": 1.1,
    "carbs": 1.25
  },
  "moderate": {
    "calories": 1.0,
    "carbs": 1.0
  },
  "low": {
    "calories": 0.95,
    "carbs": 0.88
  },
  "rest": {
    "calories": 0.9,
    "carbs": 0.75
  }
};

export const INTENSITY_LABEL = {
  "high": "고강도",
  "moderate": "중강도",
  "low": "저강도",
  "rest": "휴식"
};

export const MEAL_TEMPLATES = {
  "high": {
    "target": "훈련량이 많은 날 · 탄수화물 충전 + 단백질 최대",
    "breakfast": "오트밀 80g, 달걀 3개, 바나나",
    "lunch": "잡곡밥 210g, 닭가슴살 200g, 나물 2종",
    "dinner": "고구마 200g, 소고기 살코기 150g, 구운 채소",
    "snack": "운동 전 바나나 1개 / 운동 후 유청단백 1스쿱 + 우유"
  },
  "moderate": {
    "target": "기본 유지일 · 단백질 우선, 탄수화물 보통",
    "breakfast": "그릭요거트 200g, 견과류 20g, 블루베리",
    "lunch": "현미밥 180g, 연어 또는 두부 150g, 샐러드",
    "dinner": "닭안심 180g, 채소볶음, 감자 150g",
    "snack": "운동 후 단백질 25~30g (닭가슴살 또는 프로틴)"
  },
  "low": {
    "target": "가벼운 날 · 탄수화물 약간 낮추고 채소 늘리기",
    "breakfast": "달걀 3개, 통밀빵 1쪽, 방울토마토",
    "lunch": "현미밥 130g, 흰살생선 180g, 나물",
    "dinner": "두부 200g, 대용량 샐러드, 올리브유 1큰술",
    "snack": "무가당 요거트 또는 삶은 달걀 2개"
  },
  "rest": {
    "target": "휴식일 · 열량은 낮추되 단백질은 그대로 유지",
    "breakfast": "달걀 2개, 사과, 아메리카노",
    "lunch": "샐러드볼(닭가슴살 150g), 통곡물 크래커",
    "dinner": "된장국, 두부, 나물 3종, 현미밥 120g",
    "snack": "카세인 단백 또는 코티지 치즈"
  }
};
