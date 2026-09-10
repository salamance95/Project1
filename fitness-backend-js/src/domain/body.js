/** BMI 계산과 BMI 기반 루틴 보정. 진단이 아니라 루틴을 고르는 기준으로만 쓴다. */

import {
  BMI_ADJUSTMENTS,
  BMI_BANDS,
  BMI_SPLIT_CAP,
  BODY_TYPES,
  FAT_LEVELS,
  MUSCLE_LEVELS,
} from "./data/body.data.js";

export { BMI_BANDS, BODY_TYPES };

/** 소수 첫째 자리까지. 파이썬 백엔드와 값이 어긋나지 않게 반올림 방식을 고정한다. */
function round1(value) {
  return Math.floor(value * 10 + 0.5) / 10;
}

/** kg / m^2. 키나 몸무게가 없으면 null. */
export function bmiValue(heightCm, weightKg) {
  if (!heightCm || !weightKg) return null;
  const meters = heightCm / 100;
  return round1(weightKg / (meters * meters));
}

export function bmiBand(bmi) {
  if (bmi === null) return null;
  return BMI_BANDS.find((band) => bmi >= band.min && bmi < band.max) ?? BMI_BANDS[BMI_BANDS.length - 1];
}

/** BMI로 되돌린 체중(kg). 설문에서 BMI를 직접 입력했을 때 쓴다. */
export function weightForBmi(heightCm, bmi) {
  const meters = heightCm / 100;
  return round1(bmi * meters * meters);
}

/** 체지방률 → low / normal / high / very_high. 성별 기준이 다르다. */
export function fatLevel(sex, bodyFat) {
  if (!bodyFat) return null;
  const cut = FAT_LEVELS[sex] ?? FAT_LEVELS["남성"];

  if (bodyFat >= cut.veryHigh) return "very_high";
  if (bodyFat >= cut.high) return "high";
  if (bodyFat < cut.low) return "low";
  return "normal";
}

/** 골격근량 지수(SMI) = 골격근량(kg) / 키(m)². */
export function muscleIndex(heightCm, muscleMass) {
  if (!heightCm || !muscleMass) return null;
  const meters = heightCm / 100;
  return round1(muscleMass / (meters * meters));
}

/** SMI → low / normal / high. 낮음은 근감소증 진단 기준을 쓴다. */
export function muscleLevel(sex, smi) {
  if (!smi) return null;
  const cut = MUSCLE_LEVELS[sex] ?? MUSCLE_LEVELS["남성"];

  if (smi < cut.low) return "low";
  if (smi >= cut.high) return "high";
  return "normal";
}

/**
 * 체지방률·골격근량까지 있을 때의 체형 유형.
 * 위에서부터 먼저 걸리는 것을 쓴다(안전이 급한 쪽이 위).
 * 판단할 재료가 없으면 null — 이때는 BMI 기준을 그대로 쓴다.
 */
export function bodyTypeOf(bmi, fat, muscle) {
  if (!fat && !muscle) return null;

  const fatty = fat === "high" || fat === "very_high";

  if (muscle === "low" && fatty) return "sarcopenic_obese";
  if (muscle === "low") return "low_muscle";
  if (fatty && bmi !== null && bmi >= 25) return "obese";
  if (fatty) return "skinny_fat";
  // BMI로는 과체중 이상인데 지방이 아닌 경우 = 근육이 무거운 것.
  if (bmi !== null && bmi >= 23 && (fat === "low" || muscle === "high")) return "athletic";
  return null;
}

/**
 * 설문 응답 → 체형 요약과 루틴 보정값.
 * 반환값의 adjustments는 planner가, splitCap은 분할 추천이 읽는다.
 *
 * 체지방률·골격근량이 없으면 BMI 구간만으로 판단하고(기존 동작),
 * 있으면 체형 유형으로 한 번 더 갈라서 보정을 덮어쓴다.
 */
export function bodyProfile(profile) {
  const bmi = bmiValue(profile.height, profile.weight);
  const band = bmiBand(bmi);

  const bodyFat = profile.bodyFat ?? null;
  const muscleMass = profile.muscleMass ?? null;
  const smi = muscleIndex(profile.height, muscleMass);
  const fat = fatLevel(profile.sex, bodyFat);
  const muscle = muscleLevel(profile.sex, smi);
  const typeId = bodyTypeOf(bmi, fat, muscle);
  const type = typeId ? BODY_TYPES[typeId] : null;

  const composition = {
    bodyFat,
    muscleMass,
    smi,
    fatLevel: fat,
    muscleLevel: muscle,
    typeId,
    typeLabel: type ? type.label : null,
    // 체성분 수치로 판단했는가. false면 키·체중(BMI)만 본 것이다.
    precise: Boolean(fat || muscle),
  };

  if (!band) {
    return {
      bmi: null,
      bandId: null,
      category: null,
      summary: "",
      routineNote: "",
      coaching: "",
      adjustments: { countOffset: 0, cardioFirst: false, noImpact: false, capHighIntensity: false },
      splitCap: 5,
      ...composition,
    };
  }

  if (!type) {
    return {
      bmi,
      bandId: band.id,
      category: band.label,
      summary: band.summary,
      routineNote: band.routine,
      coaching: band.coaching,
      adjustments: BMI_ADJUSTMENTS[band.id],
      splitCap: BMI_SPLIT_CAP[band.id],
      ...composition,
    };
  }

  // 체형 유형이 잡히면 그쪽 보정이 BMI 보정을 대신한다.
  // 단 BMI 30 이상은 어느 유형이든 관절 보호는 유지한다.
  const adjustments = { ...type.adjustments };
  if (bmi >= 30 && typeId !== "athletic") {
    adjustments.noImpact = true;
    adjustments.capHighIntensity = true;
  }

  return {
    bmi,
    bandId: band.id,
    category: band.label,
    summary: type.summary,
    routineNote: type.routine,
    coaching: type.coaching,
    adjustments,
    splitCap: Math.min(type.splitCap, typeId === "athletic" ? 5 : BMI_SPLIT_CAP[band.id]),
    ...composition,
  };
}

/* --------------------------------------------------- 결과지 사진에서 읽은 값 */

const LIMITS = {
  height: [100, 250],
  weight: [25, 300],
  bmi: [10, 60],
  bodyFat: [3, 70],
  muscleMass: [10, 80],
};

/** 숫자이고 상식적인 범위 안일 때만 값으로 인정한다. */
function sane(field, value) {
  const [min, max] = LIMITS[field];
  const number = Number(value);
  if (!Number.isFinite(number) || number <= min || number >= max) return null;
  return round1(number);
}

/** 키(cm)와 BMI로 되돌린 키. 체중과 BMI만 읽혔을 때 쓴다. */
function heightForBmi(weightKg, bmi) {
  return round1(Math.sqrt(weightKg / bmi) * 100);
}

/**
 * 사진에서 읽은 값 → 설문에 채울 수 있는 형태.
 *
 * 모델이 읽은 숫자를 그대로 믿지 않는다. 범위를 벗어난 값은 버리고,
 * 세 값 중 둘만 있으면 나머지 하나를 계산해서 채운다.
 * BMI는 언제나 키·체중에서 다시 계산한 값을 쓴다(결과지 반올림과 어긋날 수 있어서).
 */
export function normalizeBodyReading(reading) {
  const warnings = [];
  const raw = reading ?? {};

  let height = sane("height", raw.height);
  let weight = sane("weight", raw.weight);
  const statedBmi = sane("bmi", raw.bmi);
  const bodyFat = sane("bodyFat", raw.bodyFat);
  const muscleMass = sane("muscleMass", raw.muscleMass);

  for (const [field, value] of [["height", raw.height], ["weight", raw.weight], ["bmi", raw.bmi]]) {
    if (value !== null && value !== undefined && sane(field, value) === null) {
      warnings.push(`${field} 값(${value})이 상식적인 범위를 벗어나 무시했습니다.`);
    }
  }

  // 둘만 읽혔으면 나머지 하나를 계산해서 채운다.
  if (height && !weight && statedBmi) {
    weight = weightForBmi(height, statedBmi);
    warnings.push("체중이 안 보여서 키와 BMI로 계산했습니다.");
  } else if (!height && weight && statedBmi) {
    height = heightForBmi(weight, statedBmi);
    warnings.push("키가 안 보여서 체중과 BMI로 계산했습니다.");
  }

  const bmi = height && weight ? bmiValue(height, weight) : statedBmi;

  // 결과지에 적힌 BMI와 계산값이 크게 다르면 잘못 읽었을 가능성이 높다.
  if (statedBmi && bmi && Math.abs(statedBmi - bmi) >= 1) {
    warnings.push(
      `결과지의 BMI(${statedBmi})와 키·체중으로 계산한 값(${bmi})이 다릅니다. 숫자를 확인해 주세요.`,
    );
  }

  const band = bmiBand(bmi);

  return {
    height,
    weight,
    bmi,
    statedBmi,
    bodyFat,
    muscleMass,
    category: band ? band.label : null,
    // 설문에 바로 채워 넣어도 되는가.
    complete: Boolean(height && weight),
    warnings,
  };
}
