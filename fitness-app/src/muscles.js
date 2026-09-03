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

/** 추천 수치를 한 줄로. 맨몸이면 무게를 빼고 세트x횟수만. */
export function prescriptionText(item) {
  const scheme = item.sets && item.reps ? `${item.sets}×${item.reps}` : item.prescription;
  return item.recommendedWeight ? `${item.recommendedWeight}kg · ${scheme}` : scheme;
}
