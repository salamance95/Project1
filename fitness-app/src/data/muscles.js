/**
 * 부위 → 색 클래스. 계획·기록·리포트가 같은 색을 쓰도록 한곳에서 정한다.
 * 색은 의미를 담는다: 미는 근육은 따뜻한 계열, 당기는 근육은 차가운 계열.
 */
const MUSCLE_CLASS = {
  가슴: "m-chest",
  어깨: "m-shoulder",
  "후면 어깨": "m-shoulder",
  등: "m-back",
  "후면 전체": "m-back",
  하체: "m-legs",
  햄스트링: "m-legs",
  둔근: "m-glute",
  "허리/둔근": "m-glute",
  코어: "m-core",
  유산소: "m-cardio",
  이두: "m-arm",
  삼두: "m-arm",
};

export function muscleClass(muscle) {
  return MUSCLE_CLASS[muscle] ?? "m-other";
}

/** 계획 항목 목록 → 중복 없는 부위 목록(순서 유지). */
export function musclesOf(items) {
  const seen = [];
  for (const item of items ?? []) {
    if (item.muscle && !seen.includes(item.muscle)) seen.push(item.muscle);
  }
  return seen;
}

/**
 * 추천 수치를 한 줄로. 운동을 무엇으로 재느냐에 따라 다르게 적는다.
 *  기구 운동   80kg · 4×8
 *  맨몸 운동   4×8
 *  걷기·자전거 1.8km(20분)
 */
export function prescriptionText(item) {
  // 거리·시간으로 재는 운동은 서버가 만든 문구를 그대로 쓴다.
  if (item.metric === "distance" || item.metric === "time") return item.prescription;

  const scheme = item.sets && item.reps ? `${item.sets}×${item.reps}` : item.prescription;
  return item.recommendedWeight ? `${item.recommendedWeight}kg · ${scheme}` : scheme;
}

/**
 * 동작 → 실제로 자극되는 근육. "가슴/등/하체"만으로는 무엇을 쓰는지 모르므로,
 * 계획·설명 화면에서 한 단계 더 들어간 이름을 같이 보여준다.
 *  primary   그 동작이 노리는 근육(주동근). 여기에 자극이 없으면 자세가 틀린 것.
 *  secondary 같이 동원되는 근육(협응근). 다음 날 뻐근한 곳을 설명해 준다.
 */
const MUSCLE_DETAIL = {
  // 스쿼트 계열
  back_squat: {
    primary: ["대퇴사두근", "대둔근"],
    secondary: ["햄스트링", "척추기립근", "내전근"],
  },
  goblet_squat: {
    primary: ["대퇴사두근", "대둔근"],
    secondary: ["복직근", "척추기립근"],
  },
  box_squat: {
    primary: ["대퇴사두근", "대둔근"],
    secondary: ["햄스트링", "척추기립근"],
  },
  leg_press: {
    primary: ["대퇴사두근"],
    secondary: ["대둔근", "햄스트링"],
  },

  // 힌지 계열
  deadlift: {
    primary: ["척추기립근", "대둔근", "햄스트링"],
    secondary: ["광배근", "승모근", "전완근", "대퇴사두근"],
  },
  rdl: {
    primary: ["햄스트링", "대둔근"],
    secondary: ["척추기립근", "광배근", "전완근"],
  },
  db_rdl: {
    primary: ["햄스트링", "대둔근"],
    secondary: ["척추기립근", "전완근"],
  },
  hip_thrust: {
    primary: ["대둔근"],
    secondary: ["햄스트링", "대퇴사두근"],
  },
  glute_bridge: {
    primary: ["대둔근"],
    secondary: ["햄스트링", "복직근"],
  },
  back_ext: {
    primary: ["척추기립근"],
    secondary: ["대둔근", "햄스트링"],
  },

  // 런지 / 편측
  walking_lunge: {
    primary: ["대퇴사두근", "대둔근"],
    secondary: ["햄스트링", "중둔근", "비복근"],
  },
  split_squat: {
    primary: ["대퇴사두근", "대둔근"],
    secondary: ["햄스트링", "중둔근"],
  },
  step_up: {
    primary: ["대퇴사두근", "대둔근"],
    secondary: ["햄스트링", "중둔근"],
  },

  // 수평 밀기
  bench_press: {
    primary: ["대흉근(중부)"],
    secondary: ["삼두근", "전면 삼각근"],
  },
  db_bench: {
    primary: ["대흉근(중부)"],
    secondary: ["삼두근", "전면 삼각근", "회전근개"],
  },
  chest_press_machine: {
    primary: ["대흉근"],
    secondary: ["삼두근", "전면 삼각근"],
  },
  pushup: {
    primary: ["대흉근"],
    secondary: ["삼두근", "전면 삼각근", "전거근", "복직근"],
  },

  // 수직 밀기
  ohp: {
    primary: ["전면 삼각근", "측면 삼각근"],
    secondary: ["삼두근", "상부 승모근", "복직근"],
  },
  db_shoulder_press: {
    primary: ["전면 삼각근", "측면 삼각근"],
    secondary: ["삼두근", "상부 승모근"],
  },
  lateral_raise: {
    primary: ["측면 삼각근"],
    secondary: ["극상근", "상부 승모근"],
  },
  pike_pushup: {
    primary: ["전면 삼각근"],
    secondary: ["삼두근", "상부 승모근", "전거근"],
  },

  // 수평 당기기
  barbell_row: {
    primary: ["광배근", "중부 승모근", "능형근"],
    secondary: ["후면 삼각근", "이두근", "척추기립근"],
  },
  db_row: {
    primary: ["광배근", "능형근"],
    secondary: ["후면 삼각근", "이두근"],
  },
  seated_row: {
    primary: ["광배근", "중부 승모근", "능형근"],
    secondary: ["후면 삼각근", "이두근"],
  },
  inverted_row: {
    primary: ["광배근", "능형근"],
    secondary: ["후면 삼각근", "이두근", "복직근"],
  },

  // 수직 당기기
  pullup: {
    primary: ["광배근"],
    secondary: ["대원근", "이두근", "하부 승모근", "전완근"],
  },
  lat_pulldown: {
    primary: ["광배근"],
    secondary: ["대원근", "이두근", "하부 승모근"],
  },
  band_pulldown: {
    primary: ["광배근"],
    secondary: ["대원근", "이두근"],
  },
  face_pull: {
    primary: ["후면 삼각근", "능형근"],
    secondary: ["중·하부 승모근", "회전근개"],
  },

  // 코어
  plank: {
    primary: ["복횡근", "복직근"],
    secondary: ["대둔근", "전거근", "척추기립근"],
  },
  dead_bug: {
    primary: ["복횡근", "복직근"],
    secondary: ["내·외복사근"],
  },
  hanging_knee_raise: {
    primary: ["복직근(하부)", "장요근"],
    secondary: ["내·외복사근", "전완근"],
  },
  pallof_press: {
    primary: ["내·외복사근", "복횡근"],
    secondary: ["대둔근", "어깨 안정근"],
  },
  mountain_climber: {
    primary: ["복직근", "장요근"],
    secondary: ["전면 삼각근", "대퇴사두근", "심폐 지구력"],
  },

  // 유산소 / 컨디셔닝
  incline_walk: {
    primary: ["심폐 지구력"],
    secondary: ["대둔근", "햄스트링", "비복근"],
  },
  cycle: {
    primary: ["심폐 지구력", "대퇴사두근"],
    secondary: ["대둔근", "햄스트링", "비복근"],
  },
  row_erg: {
    primary: ["심폐 지구력"],
    secondary: ["대퇴사두근", "광배근", "척추기립근", "이두근"],
  },
  jump_rope: {
    primary: ["심폐 지구력", "비복근"],
    secondary: ["전경골근", "전완근", "삼각근"],
  },
};

/** 동작 하나의 자극 부위. 아직 정리되지 않은 동작이면 null. */
export function muscleDetail(slug) {
  return MUSCLE_DETAIL[slug] ?? null;
}

/**
 * 계획 한 줄에 붙일 짧은 자극 부위 문구.
 * 좁은 자리라 주동근만 적고, 협응근은 상세 설명에서 보여준다.
 *   "대퇴사두근 · 대둔근"
 */
export function primaryMuscleText(slug) {
  const detail = MUSCLE_DETAIL[slug];
  return detail ? detail.primary.join(" · ") : "";
}

/**
 * 근육 이름 → 인체도에서 칠할 영역(MuscleMap의 영역 id).
 * 한 이름이 여러 영역에 걸치기도 한다(예: 승모근은 상·중·하부).
 * "심폐 지구력"처럼 그림에 자리가 없는 항목은 여기에 넣지 않고 목록으로만 보여준다.
 */
const MUSCLE_REGIONS = {
  대흉근: ["chest"],
  "대흉근(중부)": ["chest"],
  "전면 삼각근": ["deltFront"],
  "측면 삼각근": ["deltSide"],
  "후면 삼각근": ["deltRear"],
  삼각근: ["deltFront", "deltSide", "deltRear"],
  삼두근: ["triceps"],
  이두근: ["biceps"],
  전완근: ["forearm"],
  "상부 승모근": ["trapUpper"],
  "중부 승모근": ["trapMid"],
  "하부 승모근": ["trapLower"],
  "중·하부 승모근": ["trapMid", "trapLower"],
  승모근: ["trapUpper", "trapMid", "trapLower"],
  광배근: ["lats"],
  대원근: ["teres"],
  능형근: ["rhomboids"],
  회전근개: ["rotator"],
  극상근: ["rotator"],
  "어깨 안정근": ["rotator", "deltRear"],
  척추기립근: ["erectors"],
  복직근: ["abs"],
  "복직근(하부)": ["abs"],
  복횡근: ["abs", "obliques"],
  "내·외복사근": ["obliques"],
  장요근: ["hipFlexor"],
  전거근: ["serratus"],
  대둔근: ["glutes"],
  중둔근: ["gluteMed"],
  햄스트링: ["hamstrings"],
  대퇴사두근: ["quads"],
  내전근: ["adductors"],
  비복근: ["calves"],
  전경골근: ["tibialis"],
};

/** 근육 이름이 차지하는 인체도 영역들. 그림에 없는 이름이면 빈 배열. */
export function muscleRegions(name) {
  return MUSCLE_REGIONS[name] ?? [];
}
