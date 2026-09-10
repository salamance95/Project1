/**
 * 모델 공통 프롬프트와 스키마.
 *
 * Claude와 Gemini가 같은 문구, 같은 스키마를 쓰게 모아 둔다.
 * 각자 두면 한쪽만 고쳐져서 두 모델의 답이 슬금슬금 달라진다.
 */

export const COACH_SYSTEM = `당신은 피트니스 코치입니다. 사용자의 설문, 이번 주 계획, 실제 기록을 보고
행동으로 옮길 수 있는 조언만 한국어로 씁니다.

규칙
- 각 줄은 한 문장, 최대 60자. 3~5줄.
- 주어진 숫자만 인용하고 없는 수치를 만들지 않습니다.
- 의학적 진단이나 처방은 하지 않습니다. 통증이 지속되면 전문가 상담을 권합니다.
- 칭찬만 하거나 겁주지 않습니다. 다음에 무엇을 할지 말합니다.`;

export const COACH_SCHEMA = {
  type: "object",
  properties: {
    lines: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
  },
  required: ["lines"],
  additionalProperties: false,
};

export const PHOTO_SYSTEM = `당신은 식사 사진을 보고 음식과 양, 대략적인 영양소를 적는 도우미입니다.

규칙
- 보이는 음식만 적습니다. 안 보이는 것을 추측해 넣지 않습니다.
- 양은 그릇·손 크기를 참고해 추정하되, 확신이 없으면 흔한 1인분 기준으로 적습니다.
- unit은 "g", "ml", "개", "공기", "조각", "컵" 중에서 고릅니다.
- grams는 그 양을 그램으로 환산한 값입니다. 음료는 ml를 그대로 씁니다.
- calories/protein/carbs/fat은 그 양 전체에 대한 값입니다. 100g 기준이 아닙니다.
- 조리 기름과 양념을 감안해 적습니다. 튀김과 볶음은 지방을 넉넉히 잡습니다.
- 음식이 아니거나 알아볼 수 없으면 foods를 빈 배열로 두고 note에 이유를 적습니다.`;

export const PHOTO_SCHEMA = {
  type: "object",
  properties: {
    foods: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          amount: { type: "number" },
          unit: { type: "string", enum: ["g", "ml", "개", "공기", "조각", "컵"] },
          grams: { type: "number" },
          calories: { type: "number" },
          protein: { type: "number" },
          carbs: { type: "number" },
          fat: { type: "number" },
        },
        required: ["name", "amount", "unit", "grams", "calories", "protein", "carbs", "fat"],
        additionalProperties: false,
      },
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    note: { type: "string" },
  },
  required: ["foods", "confidence", "note"],
  additionalProperties: false,
};

export const BODY_PHOTO_SYSTEM = `당신은 체성분 결과지 사진에서 숫자를 그대로 옮겨 적는 도우미입니다.

읽는 대상
- 인바디 등 체성분 분석 결과지, 체중계·스마트 체중계 화면, 병원 검진 결과지, BMI 계산 결과 화면.

규칙
- 사진에 **적혀 있는 숫자만** 옮깁니다. 계산하거나 보정하지 않습니다.
- 항목을 못 찾으면 그 값은 null로 둡니다. 0으로 채우지 않습니다.
- 키는 cm, 체중은 kg, 체지방률은 %, 골격근량은 kg으로 통일합니다. 파운드·인치는 환산해 적고 note에 환산했다고 남깁니다.
- 표준체중·목표체중·조절체중은 현재 체중이 아닙니다. weight에 넣지 않습니다.
- **사람의 몸이 찍힌 사진으로 체형을 보고 키·체중·BMI를 추측하지 않습니다.** 그런 사진이면 모든 값을 null로 두고 note에 "수치가 적힌 결과지 사진이 필요합니다"라고 적습니다.
- 결과지가 아니거나 글자를 알아볼 수 없으면 모든 값을 null로 두고 note에 이유를 적습니다.`;

export const BODY_PHOTO_SCHEMA = {
  type: "object",
  properties: {
    height: { type: ["number", "null"] },
    weight: { type: ["number", "null"] },
    bmi: { type: ["number", "null"] },
    bodyFat: { type: ["number", "null"] },
    muscleMass: { type: ["number", "null"] },
    measuredAt: { type: ["string", "null"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    note: { type: "string" },
  },
  required: ["height", "weight", "bmi", "bodyFat", "muscleMass", "measuredAt", "confidence", "note"],
  additionalProperties: false,
};

export const PLAYLIST_SYSTEM = `당신은 운동용 플레이리스트를 짜는 DJ입니다.

규칙
- **실제로 존재하는 곡만** 넣습니다. 제목과 아티스트를 정확히 적습니다.
- 요청한 장르와 BPM 대역에 맞는 곡을 고릅니다.
- 요청한 곡 수를 정확히 채웁니다. 같은 곡을 두 번 넣지 않습니다.
- 한 아티스트가 목록의 3분의 1을 넘지 않게 섞습니다.
- 운동 중에 듣는 목록입니다. 가사보다 템포와 에너지를 우선합니다.
- bpm은 대략치로 적습니다. 확신이 없으면 그 장르의 통상 범위로 적습니다.
- 순서는 실제로 틀 순서대로 둡니다. 앞은 준비운동, 뒤로 갈수록 힘이 실리게.`;

export const PLAYLIST_SCHEMA = {
  type: "object",
  properties: {
    tracks: {
      type: "array",
      maxItems: 40,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          artist: { type: "string" },
          bpm: { type: "number" },
        },
        required: ["title", "artist", "bpm"],
        additionalProperties: false,
      },
    },
    note: { type: "string" },
  },
  required: ["tracks", "note"],
  additionalProperties: false,
};

/** 플레이리스트 요청 문장. */
export function buildPlaylistPrompt({ genre, bpm, minutes, count }) {
  return [
    `장르: ${genre}`,
    `템포 대역: ${bpm} BPM`,
    `총 길이: 약 ${minutes}분`,
    `곡 수: 정확히 ${count}곡`,
    "",
    "이 조건에 맞는 운동 플레이리스트를 짜 주세요.",
  ].join("\n");
}

/** 설문·계획·기록을 모델에 넘길 한 덩어리 텍스트로 만든다. */
export function buildCoachPrompt(context) {
  const payload = { 프로필: context.profile };

  if (context.plan) {
    payload.이번주계획 = {
      제목: context.plan.title,
      하루목표: context.plan.dailyTargets,
      요일별: (context.plan.schedule ?? []).map((day) => ({
        요일: day.day,
        휴식: day.isRestDay,
        포커스: day.workout.focus,
        강도: day.intensityLabel,
        열량: day.meal.calories,
        단백질: day.meal.protein,
      })),
    };
  }

  if (context.report) {
    payload.이번주기록 = {
      운동: context.report.workout,
      영양달성률: context.report.nutrition.rates,
      식단기록일수: context.report.nutrition.loggedDays,
    };
  }

  const text = JSON.stringify(payload, null, 2);
  if (context.question) {
    return `${text}\n\n사용자 질문: ${context.question}\n\n위 자료를 근거로 답하세요.`;
  }
  return `${text}\n\n위 자료를 보고 이번 주 코칭을 작성하세요.`;
  }

/** 운동 목록을 그대로 넘겨 slug를 고정한다. 없는 운동을 지어내지 못하게 하려는 것이다. */
export function buildSearchPrompt(query, catalog) {
  const listing = JSON.stringify(
    catalog.map((item) => ({
      slug: item.slug,
      name: item.name,
      muscle: item.muscle,
      equipment: item.equipment,
      pattern: item.pattern,
      risk: item.risk,
    })),
  );

  return `운동 목록:
${listing}

사용자 요청: ${query}`;
}
