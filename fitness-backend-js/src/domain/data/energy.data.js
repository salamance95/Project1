/**
 * 소모 열량 MET와 추천 중량 계수.
 * 파이썬 원본에서 생성한 데이터입니다. 로직은 각 도메인 모듈에 있습니다.
 */

export const MET_BY_INTENSITY = {
  "high": 6.0,
  "moderate": 5.0,
  "low": 3.8,
  "rest": 2.5
};

export const DEFAULT_MINUTES = {
  "30분 이하": 30,
  "45분~1시간": 50,
  "1시간 30분 이상": 85
};

export const MINUTES_PER_SET = 3.0;

export const BODYWEIGHT_RATIO = {
  "back_squat": 0.9,
  "goblet_squat": 0.25,
  "leg_press": 1.6,
  "deadlift": 1.1,
  "rdl": 0.8,
  "db_rdl": 0.3,
  "hip_thrust": 0.8,
  "bench_press": 0.7,
  "db_bench": 0.22,
  "chest_press_machine": 0.5,
  "ohp": 0.45,
  "db_shoulder_press": 0.15,
  "lateral_raise": 0.06,
  "barbell_row": 0.6,
  "db_row": 0.25,
  "seated_row": 0.5,
  "lat_pulldown": 0.55,
  "face_pull": 0.2,
  "walking_lunge": 0.2,
  "split_squat": 0.2,
  "step_up": 0.15
};

export const LEVEL_FACTOR = {
  "입문": 0.55,
  "초보": 0.72,
  "중급": 1.0,
  "고급": 1.22
};

export const STYLE_FACTOR = {
  "근력 중심": 1.15,
  "근비대 중심": 1.0,
  "체력 중심": 0.85
};

export const DUMBBELL_SLUGS = [
  "db_bench",
  "db_rdl",
  "db_row",
  "db_shoulder_press",
  "goblet_squat",
  "hip_thrust",
  "lateral_raise",
  "split_squat",
  "step_up",
  "walking_lunge"
];

/**
 * 동작별 MET. 미국 스포츠의학회 Compendium of Physical Activities 값을 기준으로,
 * 동원하는 근육량과 쉬는 시간을 감안해 잡았다.
 *
 * 같은 3세트라도 스쿼트와 레터럴 레이즈가 같은 열량을 태울 수는 없다.
 * 큰 근육을 여러 개 쓰는 동작일수록 높고, 한 관절만 쓰는 고립 동작은 낮다.
 */
export const MET_BY_SLUG = {
  // 하체 — 동원 근육이 가장 많다
  back_squat: 6.0,
  deadlift: 6.0,
  rdl: 5.5,
  db_rdl: 5.0,
  goblet_squat: 5.0,
  leg_press: 5.0,
  box_squat: 4.5,
  hip_thrust: 4.5,
  glute_bridge: 3.5,
  back_ext: 3.5,
  walking_lunge: 5.5,
  split_squat: 5.0,
  step_up: 4.5,

  // 상체 밀기 — 맨몸 동작은 몸 전체를 지탱해 더 높다
  bench_press: 5.0,
  db_bench: 5.0,
  chest_press_machine: 4.0,
  pushup: 8.0,
  ohp: 5.0,
  db_shoulder_press: 4.5,
  pike_pushup: 7.0,
  lateral_raise: 3.0,

  // 상체 당기기
  barbell_row: 5.5,
  pullup: 8.0,
  inverted_row: 5.0,
  db_row: 4.5,
  seated_row: 4.5,
  lat_pulldown: 4.5,
  band_pulldown: 3.5,
  face_pull: 3.0,

  // 코어
  mountain_climber: 8.0,
  hanging_knee_raise: 4.0,
  plank: 3.8,
  dead_bug: 3.0,
  pallof_press: 3.0,

  // 유산소
  jump_rope: 12.0,
  cycle: 7.0,
  row_erg: 7.0,
  incline_walk: 6.0,
};

/** 마스터에 없는 동작을 위한 패턴별 기본값. */
export const MET_BY_PATTERN = {
  squat: 5.0,
  hinge: 5.0,
  lunge: 5.0,
  push_h: 5.0,
  push_v: 4.5,
  pull_h: 4.5,
  pull_v: 5.0,
  core: 3.5,
  cardio: 6.0,
};

export const DEFAULT_MET = 5.0;
