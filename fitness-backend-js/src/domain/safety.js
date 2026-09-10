/**
 * 안전장치(contraindication check).
 * 루틴을 만들기 전에 통과해야 하는 관문이다. block / warn / info 세 등급.
 */

import {
  CALORIE_FLOOR,
  NONE_OPTION,
  RED_FLAGS,
  RED_FLAG_RULES,
} from "./data/safety.data.js";

export { RED_FLAGS, NONE_OPTION };

function emptyRestrictions() {
  return {
    no_high_intensity: false,
    no_impact: false,
    no_deficit: false,
    no_valsalva: false,
  };
}

function bmiOf(profile) {
  const heightM = profile.height / 100;
  if (heightM <= 0) return 0;
  return profile.weight / (heightM * heightM);
}

/** 설문 응답 → { findings, restrictions, blocked } */
export function checkProfile(profile) {
  const findings = [];
  const restrictions = emptyRestrictions();

  const add = (severity, code, message, extra = {}) => {
    findings.push({ severity, code, message });
    for (const [key, value] of Object.entries(extra)) {
      if (value) restrictions[key] = true;
    }
  };

  // 1) 건강 문진
  for (const flag of profile.redFlags ?? []) {
    if (flag === NONE_OPTION) continue;
    const rule = RED_FLAG_RULES[flag];
    if (rule) add(rule.severity, rule.code, rule.message, rule.restrictions);
  }

  // 2) 연령
  if (profile.age < 16) {
    add(
      "warn",
      "minor",
      "성장기에는 고중량 근력 훈련보다 동작 숙련과 체력 위주가 안전합니다. " +
        "보호자와 지도자의 감독 아래 수행하세요.",
      { no_high_intensity: true },
    );
  } else if (profile.age >= 65) {
    add(
      "warn",
      "senior",
      "65세 이상은 고강도 구간에서 혈압 변동과 낙상 위험이 커집니다. " +
        "중강도 이하로 구성하고 균형 운동을 함께 하세요.",
      { no_high_intensity: true, no_impact: true },
    );
  }

  // 3) 체격 지표
  const bmi = bmiOf(profile);
  if (bmi && bmi < 17.5) {
    if (profile.goal === "체중 감량") {
      add(
        "block",
        "underweight_cut",
        `현재 BMI가 ${bmi.toFixed(1)}로 저체중 범위입니다. 이 상태에서 감량 목표는 ` +
          "건강을 해칠 수 있어 계획을 만들지 않습니다. 목표를 바꾸거나 전문가와 상담하세요.",
      );
    } else {
      add(
        "warn",
        "underweight",
        `현재 BMI가 ${bmi.toFixed(1)}로 낮습니다. 열량 적자 없이 유지 이상으로 계획했습니다.`,
        { no_deficit: true },
      );
    }
  } else if (bmi >= 35) {
    add(
      "warn",
      "high_bmi",
      `현재 BMI가 ${bmi.toFixed(1)}입니다. 관절 부담을 줄이기 위해 점프 같은 고충격 동작을 제외했습니다.`,
      { no_impact: true },
    );
  }

  // 4) 부상 부위
  const injuries = (profile.injuries ?? []).filter((item) => item !== NONE_OPTION);
  if (injuries.length >= 3) {
    add(
      "warn",
      "multi_injury",
      `주의 부위가 ${injuries.length}곳(${injuries.join(", ")})입니다. 대체 동작으로 구성했지만, ` +
        "이 정도 범위라면 한 번은 전문가에게 직접 평가받는 편이 좋습니다.",
      { no_high_intensity: true },
    );
  } else if (injuries.length > 0) {
    add(
      "info",
      "injury_substitution",
      `${injuries.join(", ")}에 부담이 큰 동작은 대체 동작으로 교체합니다.`,
    );
  }

  // 5) 과훈련 위험
  if (
    profile.frequency === "주 5일 이상" &&
    profile.duration === "1시간 30분 이상" &&
    ["입문", "초보"].includes(profile.level)
  ) {
    add(
      "warn",
      "overreaching",
      "경력 대비 훈련량이 많습니다. 부상과 중도 포기 위험이 커지므로 " +
        "첫 4주는 주 3~4일로 시작하는 편을 권합니다.",
    );
  }

  const blocked = findings.some((item) => item.severity === "block");
  return { findings, restrictions, blocked };
}

/** 안전 하한선 아래로는 절대 내려가지 않게 막는다. */
export function clampCalories(calories, profile) {
  const floor = CALORIE_FLOOR[profile.sex] ?? 1200;
  return Math.max(calories, floor);
}

export function summarize(findings) {
  if (findings.length === 0) return "안전 점검에서 특이사항이 없습니다.";

  if (findings.some((item) => item.severity === "block")) {
    return "의료적 확인이 필요한 항목이 있어 루틴 생성을 중단했습니다.";
  }

  const warns = findings.filter((item) => item.severity === "warn");
  if (warns.length > 0) {
    return `${warns.length}건의 주의사항을 반영해 강도와 동작을 조정했습니다.`;
  }
  return "안전 점검을 통과했습니다.";
}
