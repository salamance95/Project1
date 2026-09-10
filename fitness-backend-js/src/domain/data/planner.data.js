/**
 * 루틴 후보와 분할 템플릿, 목표별 코칭 문구.
 * 로직은 각 도메인 모듈에 있고 여기에는 데이터만 둔다.
 */

export const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

export const TRAINING_DAYS = {
  "주 2일": ["월", "목"],
  "주 3일": ["월", "수", "금"],
  "주 4일": ["월", "화", "목", "금"],
  "주 5일 이상": ["월", "화", "수", "금", "토"],
};

export const EXERCISE_COUNT = {
  "30분 이하": 3,
  "45분~1시간": 4,
  "1시간 30분 이상": 5,
};

/* ------------------------------------------------------------------ 분할 */

export const AUTO_SPLIT = "자동 추천";

/**
 * 분할 선택지. sessions는 한 사이클에 도는 세션 수, minDays는 그 분할을 쓰려면
 * 필요한 최소 훈련일이다. 훈련일이 사이클보다 많으면 처음부터 다시 돈다.
 */
export const SPLIT_OPTIONS = [
  {
    id: AUTO_SPLIT,
    label: "자동 추천",
    sessions: 0,
    minDays: 1,
    desc: "경력·운동 일수·BMI로 알아서 고릅니다",
  },
  {
    id: "무분할(전신)",
    label: "무분할(전신)",
    sessions: 1,
    minDays: 2,
    desc: "매 세션 전신을 한 번씩",
  },
  { id: "2분할", label: "2분할", sessions: 2, minDays: 2, desc: "상체 / 하체" },
  { id: "3분할", label: "3분할", sessions: 3, minDays: 3, desc: "푸시 / 풀 / 레그" },
  {
    id: "4분할",
    label: "4분할",
    sessions: 4,
    minDays: 4,
    desc: "가슴·삼두 / 등·이두 / 어깨·코어 / 하체",
  },
  {
    id: "5분할",
    label: "5분할",
    sessions: 5,
    minDays: 5,
    desc: "가슴 / 등 / 어깨 / 하체 / 팔·코어",
  },
];

/** 분할별 세션. (포커스, 패턴 우선순위, 강도) — 앞쪽 패턴부터 세션 동작 수만큼 쓴다. */
export const SPLIT_SESSIONS = {
  "무분할(전신)": [
    ["전신 A", ["squat", "push_h", "pull_h", "core", "cardio"], "high"],
    ["전신 B", ["hinge", "push_v", "pull_v", "core", "cardio"], "moderate"],
    ["전신 C", ["lunge", "push_h", "pull_v", "core", "cardio"], "high"],
  ],
  "2분할": [
    ["상체", ["push_h", "pull_h", "push_v", "pull_v", "core"], "high"],
    ["하체", ["squat", "hinge", "lunge", "core", "cardio"], "high"],
  ],
  "3분할": [
    ["푸시(가슴/어깨/삼두)", ["push_h", "push_v", "push_h", "core", "cardio"], "high"],
    ["풀(등/이두)", ["pull_v", "pull_h", "pull_v", "core", "cardio"], "high"],
    ["레그(하체 전체)", ["squat", "hinge", "lunge", "core", "cardio"], "high"],
  ],
  "4분할": [
    ["가슴/삼두", ["push_h", "push_h", "push_v", "core", "cardio"], "high"],
    ["등/이두", ["pull_v", "pull_h", "pull_h", "core", "cardio"], "high"],
    ["어깨/코어", ["push_v", "push_v", "core", "core", "cardio"], "moderate"],
    ["하체", ["squat", "hinge", "lunge", "core", "cardio"], "high"],
  ],
  "5분할": [
    ["가슴", ["push_h", "push_h", "push_h", "core", "cardio"], "high"],
    ["등", ["pull_v", "pull_h", "pull_v", "core", "cardio"], "high"],
    ["어깨", ["push_v", "push_v", "push_v", "core", "cardio"], "moderate"],
    ["하체", ["squat", "hinge", "lunge", "core", "cardio"], "high"],
    ["팔/코어", ["push_h", "pull_h", "core", "core", "cardio"], "moderate"],
  ],
};

/** 경력별로 무리 없이 소화할 수 있는 최대 분할 수. 1이면 전신. */
export const LEVEL_SPLIT_CAP = {
  "입문": 1,
  "초보": 2,
  "중급": 3,
  "고급": 5,
};

/* ------------------------------------------------------------------ 후보 */

/**
 * 추천 후보 3가지. 구조(어떤 부위를 언제)는 분할이 정하고,
 * 후보는 같은 분할을 얼마나 무겁게 소화할지(동작 수·강도·유산소 배치)를 정한다.
 */
export const VARIANTS = [
  {
    id: "balanced",
    title: "균형 성장형",
    count_offset: 0,
    cardio_first: false,
    ease_intensity: false,
    description:
      "고른 볼륨으로 근력과 체력을 함께 올립니다. 하루를 빠뜨려도 회복이 쉬운 구성입니다.",
    guide: [
      "운동 전 5분 관절 가동성 워밍업",
      "첫 세트는 목표 무게의 60%로 예열",
      "운동 후 30분 안에 단백질 25~35g 섭취",
    ],
  },
  {
    id: "focused",
    title: "부위 집중형",
    count_offset: 1,
    cardio_first: false,
    ease_intensity: false,
    description:
      "세션마다 동작을 하나 더 얹어 그날 부위에 볼륨을 몰아줍니다. 정해진 요일을 지킬 수 있을 때 성장이 가장 빠릅니다.",
    guide: [
      "마지막 세트는 2회 남기고 종료(RIR 2)",
      "같은 부위는 최소 48시간 간격 유지",
      "고강도일 전날은 수면 7시간 이상 확보",
    ],
  },
  {
    id: "sustainable",
    title: "지속 가능형",
    count_offset: -1,
    cardio_first: true,
    ease_intensity: true,
    description:
      "세션당 동작 수와 강도를 낮추고 유산소를 앞에 뒀습니다. 일정이 자주 흔들리는 사람에게 완주율이 가장 높습니다.",
    guide: [
      "세트 사이 휴식은 45~60초로 짧게",
      "통증이 있는 동작은 가동 범위를 줄여 수행",
      "운동을 놓친 날은 20분 걷기로 대체",
    ],
  },
];

export const COACHING_BY_GOAL = {
  "체중 감량": [
    "주간 열량 적자는 하루 단위가 아니라 7일 평균으로 관리하세요.",
    "단백질을 먼저 채우면 같은 열량에서도 포만감이 오래갑니다.",
    "체중은 매일 재되 7일 이동평균으로만 판단하세요.",
  ],
  "근육량 증가": [
    "고강도일에는 탄수화물을 늘려 훈련 볼륨을 지키세요.",
    "주당 총 세트 수가 늘어나고 있는지 2주마다 확인하세요.",
    "체중이 2주간 정체되면 하루 200kcal씩 올리세요.",
  ],
  "기초 체력 향상": [
    "유산소는 대화가 가능한 강도로 시간을 먼저 늘리세요.",
    "훈련일 사이에 최소 하루는 완전 휴식을 배치하세요.",
    "주 1회는 평소보다 10분 긴 세션으로 지구력을 자극하세요.",
  ],
  "자세 교정 및 코어 강화": [
    "코어 동작은 횟수보다 호흡과 자세 유지 시간을 우선하세요.",
    "앉아 있는 시간이 길면 1시간마다 힙 힌지 스트레칭을 넣으세요.",
    "당기는 운동을 미는 운동보다 한 세트 더 배치하세요.",
  ],
};
