/**
 * 운동 마스터 시드와 처방 테이블.
 * 파이썬 원본에서 생성한 데이터입니다. 로직은 각 도메인 모듈에 있습니다.
 */

export const BODY_PARTS = [
  "목/어깨",
  "허리",
  "무릎",
  "손목/발목"
];

export const EQUIPMENT_LIST = [
  "맨몸",
  "덤벨",
  "바벨/랙",
  "머신/케이블",
  "철봉",
  "밴드",
  "유산소 장비"
];

export const BODYWEIGHT = "맨몸";

export const FALLBACK_PATTERN = {
  "squat": [
    "lunge",
    "hinge"
  ],
  "hinge": [
    "lunge",
    "squat"
  ],
  "lunge": [
    "squat",
    "hinge"
  ],
  "push_h": [
    "push_v"
  ],
  "push_v": [
    "push_h"
  ],
  "pull_h": [
    "pull_v"
  ],
  "pull_v": [
    "pull_h"
  ],
  "core": [],
  "cardio": []
};

export const SEED_EXERCISES = [
  {
    "slug": "back_squat",
    "name": "바벨 백스쿼트",
    "pattern": "squat",
    "muscle": "하체",
    "equipment": "바벨/랙",
    "risk": [
      "무릎",
      "허리"
    ],
    "alt": "goblet_squat",
    "load": 3,
    "impact": false
  },
  {
    "slug": "goblet_squat",
    "name": "고블릿 스쿼트",
    "pattern": "squat",
    "muscle": "하체",
    "equipment": "덤벨",
    "risk": [
      "무릎"
    ],
    "alt": "box_squat",
    "load": 2,
    "impact": false
  },
  {
    "slug": "box_squat",
    "name": "박스 스쿼트(의자 활용)",
    "pattern": "squat",
    "muscle": "하체",
    "equipment": "맨몸",
    "risk": [],
    "alt": null,
    "load": 1,
    "impact": false
  },
  {
    "slug": "leg_press",
    "name": "레그 프레스",
    "pattern": "squat",
    "muscle": "하체",
    "equipment": "머신/케이블",
    "risk": [],
    "alt": null,
    "load": 2,
    "impact": false
  },
  {
    "slug": "deadlift",
    "name": "컨벤셔널 데드리프트",
    "pattern": "hinge",
    "muscle": "후면 전체",
    "equipment": "바벨/랙",
    "risk": [
      "허리"
    ],
    "alt": "hip_thrust",
    "load": 3,
    "impact": false
  },
  {
    "slug": "rdl",
    "name": "루마니안 데드리프트",
    "pattern": "hinge",
    "muscle": "햄스트링",
    "equipment": "바벨/랙",
    "risk": [
      "허리"
    ],
    "alt": "db_rdl",
    "load": 3,
    "impact": false
  },
  {
    "slug": "db_rdl",
    "name": "덤벨 루마니안 데드리프트",
    "pattern": "hinge",
    "muscle": "햄스트링",
    "equipment": "덤벨",
    "risk": [
      "허리"
    ],
    "alt": "hip_thrust",
    "load": 2,
    "impact": false
  },
  {
    "slug": "hip_thrust",
    "name": "힙 쓰러스트",
    "pattern": "hinge",
    "muscle": "둔근",
    "equipment": "덤벨",
    "risk": [],
    "alt": "glute_bridge",
    "load": 2,
    "impact": false
  },
  {
    "slug": "glute_bridge",
    "name": "글루트 브리지",
    "pattern": "hinge",
    "muscle": "둔근",
    "equipment": "맨몸",
    "risk": [],
    "alt": null,
    "load": 1,
    "impact": false
  },
  {
    "slug": "back_ext",
    "name": "백 익스텐션",
    "pattern": "hinge",
    "muscle": "허리/둔근",
    "equipment": "맨몸",
    "risk": [],
    "alt": null,
    "load": 1,
    "impact": false
  },
  {
    "slug": "walking_lunge",
    "name": "워킹 런지",
    "pattern": "lunge",
    "muscle": "하체",
    "equipment": "맨몸",
    "risk": [
      "무릎"
    ],
    "alt": "split_squat",
    "load": 2,
    "impact": false
  },
  {
    "slug": "split_squat",
    "name": "스플릿 스쿼트",
    "pattern": "lunge",
    "muscle": "하체",
    "equipment": "맨몸",
    "risk": [
      "무릎"
    ],
    "alt": "step_up",
    "load": 2,
    "impact": false
  },
  {
    "slug": "step_up",
    "name": "낮은 박스 스텝업",
    "pattern": "lunge",
    "muscle": "하체",
    "equipment": "맨몸",
    "risk": [],
    "alt": null,
    "load": 1,
    "impact": false
  },
  {
    "slug": "bench_press",
    "name": "바벨 벤치 프레스",
    "pattern": "push_h",
    "muscle": "가슴",
    "equipment": "바벨/랙",
    "risk": [
      "목/어깨"
    ],
    "alt": "db_bench",
    "load": 3,
    "impact": false
  },
  {
    "slug": "db_bench",
    "name": "덤벨 벤치 프레스",
    "pattern": "push_h",
    "muscle": "가슴",
    "equipment": "덤벨",
    "risk": [
      "목/어깨"
    ],
    "alt": "chest_press_machine",
    "load": 2,
    "impact": false
  },
  {
    "slug": "chest_press_machine",
    "name": "체스트 프레스 머신",
    "pattern": "push_h",
    "muscle": "가슴",
    "equipment": "머신/케이블",
    "risk": [],
    "alt": null,
    "load": 2,
    "impact": false
  },
  {
    "slug": "pushup",
    "name": "푸시업",
    "pattern": "push_h",
    "muscle": "가슴",
    "equipment": "맨몸",
    "risk": [
      "손목/발목"
    ],
    "alt": "chest_press_machine",
    "load": 2,
    "impact": false
  },
  {
    "slug": "ohp",
    "name": "바벨 오버헤드 프레스",
    "pattern": "push_v",
    "muscle": "어깨",
    "equipment": "바벨/랙",
    "risk": [
      "목/어깨",
      "허리"
    ],
    "alt": "db_shoulder_press",
    "load": 3,
    "impact": false
  },
  {
    "slug": "db_shoulder_press",
    "name": "덤벨 숄더 프레스(시티드)",
    "pattern": "push_v",
    "muscle": "어깨",
    "equipment": "덤벨",
    "risk": [
      "목/어깨"
    ],
    "alt": "lateral_raise",
    "load": 2,
    "impact": false
  },
  {
    "slug": "lateral_raise",
    "name": "래터럴 레이즈",
    "pattern": "push_v",
    "muscle": "어깨",
    "equipment": "덤벨",
    "risk": [],
    "alt": "pike_pushup",
    "load": 1,
    "impact": false
  },
  {
    "slug": "pike_pushup",
    "name": "파이크 푸시업",
    "pattern": "push_v",
    "muscle": "어깨",
    "equipment": "맨몸",
    "risk": [
      "목/어깨",
      "손목/발목"
    ],
    "alt": null,
    "load": 2,
    "impact": false
  },
  {
    "slug": "barbell_row",
    "name": "바벨 로우",
    "pattern": "pull_h",
    "muscle": "등",
    "equipment": "바벨/랙",
    "risk": [
      "허리"
    ],
    "alt": "seated_row",
    "load": 3,
    "impact": false
  },
  {
    "slug": "db_row",
    "name": "원암 덤벨 로우",
    "pattern": "pull_h",
    "muscle": "등",
    "equipment": "덤벨",
    "risk": [],
    "alt": null,
    "load": 2,
    "impact": false
  },
  {
    "slug": "seated_row",
    "name": "시티드 케이블 로우",
    "pattern": "pull_h",
    "muscle": "등",
    "equipment": "머신/케이블",
    "risk": [],
    "alt": null,
    "load": 2,
    "impact": false
  },
  {
    "slug": "inverted_row",
    "name": "인버티드 로우(테이블/바)",
    "pattern": "pull_h",
    "muscle": "등",
    "equipment": "맨몸",
    "risk": [],
    "alt": null,
    "load": 1,
    "impact": false
  },
  {
    "slug": "pullup",
    "name": "풀업",
    "pattern": "pull_v",
    "muscle": "등",
    "equipment": "철봉",
    "risk": [
      "목/어깨",
      "손목/발목"
    ],
    "alt": "lat_pulldown",
    "load": 3,
    "impact": false
  },
  {
    "slug": "lat_pulldown",
    "name": "랫 풀다운",
    "pattern": "pull_v",
    "muscle": "등",
    "equipment": "머신/케이블",
    "risk": [],
    "alt": "band_pulldown",
    "load": 2,
    "impact": false
  },
  {
    "slug": "band_pulldown",
    "name": "밴드 풀다운",
    "pattern": "pull_v",
    "muscle": "등",
    "equipment": "밴드",
    "risk": [],
    "alt": null,
    "load": 1,
    "impact": false
  },
  {
    "slug": "face_pull",
    "name": "페이스 풀",
    "pattern": "pull_v",
    "muscle": "후면 어깨",
    "equipment": "머신/케이블",
    "risk": [],
    "alt": null,
    "load": 1,
    "impact": false
  },
  {
    "slug": "plank",
    "name": "플랭크",
    "pattern": "core",
    "muscle": "코어",
    "equipment": "맨몸",
    "risk": [
      "손목/발목"
    ],
    "alt": "dead_bug",
    "load": 1,
    "impact": false
  },
  {
    "slug": "dead_bug",
    "name": "데드버그",
    "pattern": "core",
    "muscle": "코어",
    "equipment": "맨몸",
    "risk": [],
    "alt": null,
    "load": 1,
    "impact": false
  },
  {
    "slug": "hanging_knee_raise",
    "name": "행잉 니레이즈",
    "pattern": "core",
    "muscle": "코어",
    "equipment": "철봉",
    "risk": [
      "목/어깨",
      "허리"
    ],
    "alt": "dead_bug",
    "load": 2,
    "impact": false
  },
  {
    "slug": "pallof_press",
    "name": "팔로프 프레스",
    "pattern": "core",
    "muscle": "코어",
    "equipment": "밴드",
    "risk": [],
    "alt": "dead_bug",
    "load": 1,
    "impact": false
  },
  {
    "slug": "mountain_climber",
    "name": "마운틴 클라이머",
    "pattern": "core",
    "muscle": "코어",
    "equipment": "맨몸",
    "risk": [
      "손목/발목"
    ],
    "alt": "dead_bug",
    "load": 2,
    "impact": false
  },
  {
    "slug": "incline_walk",
    "name": "경사 빠르게 걷기",
    "pattern": "cardio",
    "muscle": "유산소",
    "equipment": "맨몸",
    "risk": [],
    "alt": null,
    "load": 1,
    "impact": false
  },
  {
    "slug": "cycle",
    "name": "실내 자전거",
    "pattern": "cardio",
    "muscle": "유산소",
    "equipment": "유산소 장비",
    "risk": [],
    "alt": "incline_walk",
    "load": 1,
    "impact": false
  },
  {
    "slug": "row_erg",
    "name": "로잉 머신",
    "pattern": "cardio",
    "muscle": "유산소",
    "equipment": "유산소 장비",
    "risk": [
      "허리"
    ],
    "alt": "cycle",
    "load": 2,
    "impact": false
  },
  {
    "slug": "jump_rope",
    "name": "줄넘기",
    "pattern": "cardio",
    "muscle": "유산소",
    "equipment": "맨몸",
    "risk": [
      "무릎",
      "손목/발목"
    ],
    "alt": "incline_walk",
    "load": 2,
    "impact": true
  }
];

export const SET_SCHEME = {
  "근력 중심": {
    "입문": "3세트 x 8회",
    "초보": "4세트 x 6회",
    "중급": "4세트 x 5회",
    "고급": "5세트 x 4회"
  },
  "근비대 중심": {
    "입문": "3세트 x 12회",
    "초보": "3세트 x 10회",
    "중급": "4세트 x 10회",
    "고급": "4세트 x 8회"
  },
  "체력 중심": {
    "입문": "2세트 x 15회",
    "초보": "3세트 x 15회",
    "중급": "3세트 x 12회",
    "고급": "4세트 x 12회"
  }
};

export const SAFE_SCHEME = {
  "입문": "2세트 x 12회",
  "초보": "3세트 x 12회",
  "중급": "3세트 x 12회",
  "고급": "3세트 x 12회"
};

export const CARDIO_SCHEME = {
  "30분 이하": "10분",
  "45분~1시간": "20분",
  "1시간 30분 이상": "30분"
};

/**
 * 거리로 재는 유산소와 계획 강도 기준 평균 속도(km/h).
 * 여기 있는 동작만 "몇 km"로 처방하고, 나머지 유산소는 시간으로 둔다.
 * (줄넘기처럼 이동하지 않는 동작은 거리가 의미 없다.)
 */
/**
 * 휴식일·회복일에 넣는 가벼운 걷기.
 * 회복이 목적이라 경사 빠르게 걷기(5.5km/h)보다 느린 속도로 본다.
 */
export const LIGHT_WALK_KMH = 4.5;
export const LIGHT_WALK_MINUTES = 20;
export const LIGHT_WALK = `가벼운 걷기 ${
  Math.round((LIGHT_WALK_KMH * LIGHT_WALK_MINUTES) / 60 * 10) / 10
}km(${LIGHT_WALK_MINUTES}분)`;

export const DISTANCE_SPEED_KMH = {
  incline_walk: 5.5,
  cycle: 20,
  row_erg: 12,
};
