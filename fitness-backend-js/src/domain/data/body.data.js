/**
 * BMI 구간과 구간별 루틴 방향.
 * 기준은 대한비만학회(아시아-태평양) 구분을 따른다. WHO 기준(25/30)보다 한 단계 낮다.
 */

export const BMI_BANDS = [
  {
    id: "underweight",
    label: "저체중",
    min: 0,
    max: 18.5,
    summary: "체중이 부족합니다. 유산소보다 근력 볼륨을 먼저 채우는 편이 좋습니다.",
    routine: "유산소 비중을 줄이고 근력 동작을 우선 배치했습니다.",
    coaching: "체중이 늘지 않으면 훈련량보다 식사량을 먼저 점검하세요.",
  },
  {
    id: "normal",
    label: "정상",
    min: 18.5,
    max: 23,
    summary: "표준 범위입니다. 목표에 맞춰 그대로 진행하면 됩니다.",
    routine: "체형 보정 없이 목표와 경력 기준으로만 구성했습니다.",
    coaching: "체중보다 수행 능력(중량·횟수)이 오르는지를 기준으로 삼으세요.",
  },
  {
    id: "overweight",
    label: "과체중",
    min: 23,
    max: 25,
    summary: "약간 높습니다. 근력은 유지하고 유산소를 조금 늘리는 구성이 맞습니다.",
    routine: "세션 끝에 유산소를 우선 배치했습니다.",
    coaching: "체중 변화는 주 0.5kg 이내로 천천히 잡으세요.",
  },
  {
    id: "obese",
    label: "비만",
    min: 25,
    max: 30,
    summary: "관절 부담이 커지는 구간입니다. 전신을 자주 쓰는 구성이 완주율이 높습니다.",
    routine: "유산소를 앞당기고 세션당 동작 수를 하나 줄였습니다.",
    coaching: "무릎이 불편하면 점프 동작 대신 걷기·자전거로 대체하세요.",
  },
  {
    id: "severely_obese",
    label: "고도비만",
    min: 30,
    max: Infinity,
    summary: "충격이 큰 동작은 피하고 강도를 한 단계 낮춰 시작해야 합니다.",
    routine: "점프 등 고충격 동작을 빼고 고강도 세션을 중강도로 낮췄습니다.",
    coaching: "통증 없이 4주를 채우는 것을 1차 목표로 삼으세요.",
  },
];

/** 구간별 루틴 보정값. planner가 그대로 읽는다. */
export const BMI_ADJUSTMENTS = {
  underweight: { countOffset: 0, cardioFirst: false, noImpact: false, capHighIntensity: false },
  normal: { countOffset: 0, cardioFirst: false, noImpact: false, capHighIntensity: false },
  overweight: { countOffset: 0, cardioFirst: true, noImpact: false, capHighIntensity: false },
  obese: { countOffset: -1, cardioFirst: true, noImpact: false, capHighIntensity: false },
  severely_obese: { countOffset: -1, cardioFirst: true, noImpact: true, capHighIntensity: true },
};

/** BMI 구간별로 권장하는 최대 분할 수. 체중이 많이 나갈수록 전신 빈도를 높인다. */
export const BMI_SPLIT_CAP = {
  underweight: 5,
  normal: 5,
  overweight: 4,
  obese: 3,
  severely_obese: 2,
};

/* ------------------------------------------------- 체성분(선택 입력) 기준 */

/**
 * 체지방률 구간. 성별로 기준이 다르다.
 * 비만 기준(남 25% / 여 30%)은 대한비만학회, 낮음 기준은 운동선수 범위를 따른다.
 */
export const FAT_LEVELS = {
  "남성": { low: 13, high: 25, veryHigh: 30 },
  "여성": { low: 21, high: 30, veryHigh: 35 },
};

/**
 * 골격근량 지수(SMI = 골격근량 / 키m²) 구간.
 * 낮음 기준은 아시아 근감소증 진단 기준(AWGS: 남 7.0 / 여 5.7)을 쓴다.
 */
export const MUSCLE_LEVELS = {
  "남성": { low: 7.0, high: 9.0 },
  "여성": { low: 5.7, high: 7.5 },
};

/**
 * 체성분까지 알 때 나누는 체형 유형.
 * BMI만으로는 근육이 많아 무거운 사람과 지방이 많아 무거운 사람이 같은 칸에 들어간다.
 * 체지방률·골격근량이 있으면 그 둘을 갈라서 루틴을 다르게 준다.
 */
export const BODY_TYPES = {
  athletic: {
    label: "근육형",
    summary: "체중은 무겁지만 지방이 아니라 근육입니다. BMI만 보면 과체중으로 잡히는 체형입니다.",
    routine: "BMI에 따른 강도·유산소 보정을 걸지 않고 목표대로 구성했습니다.",
    coaching: "체중계 숫자보다 중량과 둘레 변화를 기준으로 삼으세요.",
    adjustments: { countOffset: 0, cardioFirst: false, noImpact: false, capHighIntensity: false },
    splitCap: 5,
  },
  skinny_fat: {
    label: "마른비만형",
    summary: "BMI는 높지 않지만 체지방률이 높습니다. 체중을 줄이는 것보다 근육을 올리는 쪽이 맞습니다.",
    routine: "유산소를 앞당기지 않고 근력 동작을 먼저 배치했습니다.",
    coaching: "굶어서 체중을 줄이면 근육이 먼저 빠집니다. 단백질을 채우고 근력 볼륨을 늘리세요.",
    adjustments: { countOffset: 0, cardioFirst: false, noImpact: false, capHighIntensity: false },
    splitCap: 3,
  },
  obese: {
    label: "비만형",
    summary: "BMI와 체지방률이 함께 높습니다. 관절 부담을 줄이면서 소모를 늘리는 구성이 맞습니다.",
    routine: "유산소를 앞당기고 세션당 동작 수를 하나 줄였습니다.",
    coaching: "체중 감량은 주 0.5~1% 속도가 가장 오래갑니다.",
    adjustments: { countOffset: -1, cardioFirst: true, noImpact: false, capHighIntensity: false },
    splitCap: 3,
  },
  low_muscle: {
    label: "근육 부족형",
    summary: "골격근량이 나이·키 대비 적습니다. 강도보다 자세와 빈도를 먼저 쌓아야 합니다.",
    routine: "고충격 동작을 빼고 강도를 한 단계 낮췄습니다. 전신을 자주 쓰도록 분할도 낮췄습니다.",
    coaching: "무게를 올리기 전에 같은 무게로 횟수를 먼저 늘리세요.",
    adjustments: { countOffset: -1, cardioFirst: false, noImpact: true, capHighIntensity: true },
    splitCap: 2,
  },
  sarcopenic_obese: {
    label: "근감소 비만형",
    summary: "지방은 많고 골격근량은 적습니다. 유산소만 하면 남은 근육까지 빠지는 체형입니다.",
    routine: "유산소를 앞세우지 않고 근력을 먼저 두되, 강도와 충격은 낮췄습니다.",
    coaching: "체중이 빠져도 골격근량이 유지되는지 4주마다 확인하세요.",
    adjustments: { countOffset: -1, cardioFirst: false, noImpact: true, capHighIntensity: true },
    splitCap: 2,
  },
};
