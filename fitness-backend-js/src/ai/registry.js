/**
 * 모델 레지스트리.
 *
 * 선택 우선순위: 요청에서 지정한 모델 → 환경변수 FITNESS_AI_MODEL → 규칙 기반.
 * 어떤 이유로든 실패하면 규칙 기반으로 되돌리고, 왜 되돌렸는지 응답에 남긴다.
 * 조용히 다른 모델이 답하는 것이 가장 나쁜 동작이다.
 */

import { ClaudeCoach } from "./claudeCoach.js";
import { GeminiCoach } from "./gemini.js";
import { RuleBasedCoach } from "./ruleBased.js";

const DEFAULT_KEY = "rule_based";

const MODELS = [new RuleBasedCoach(), new ClaudeCoach(), new GeminiCoach()];
export const REGISTRY = new Map(MODELS.map((model) => [model.key, model]));

export function listModels() {
  return MODELS.map((model) => model.info());
}

export function availableKeys() {
  return MODELS.filter((model) => model.available()).map((model) => model.key);
}

/**
 * 모델 A/B 실험을 켤 수 있는가.
 * 자격 증명이 있다는 이유만으로 켜면 사용자 절반이 유료 API로 흘러가므로
 * FITNESS_ENABLE_MODEL_AB=1 로 명시적으로 켤 때만 활성화한다.
 */
export function multiModelAvailable() {
  if (process.env.FITNESS_ENABLE_MODEL_AB !== "1") return false;
  return availableKeys().length > 1;
}

export function defaultKey() {
  const preferred = process.env.FITNESS_AI_MODEL;
  if (preferred && REGISTRY.has(preferred) && REGISTRY.get(preferred).available()) {
    return preferred;
  }
  return DEFAULT_KEY;
}

/**
 * 사진을 읽을 수 있는 모델을 고른다.
 * 규칙 기반은 사진을 못 보므로, 지정이 없으면 자격 증명이 있는 모델을 찾아 쓴다.
 * (예전에는 FITNESS_AI_MODEL을 따로 지정해야만 사진 분석이 켜졌다.)
 */
export function visionKey(key = null) {
  if (key) return key;

  const preferred = defaultKey();
  if (preferred !== DEFAULT_KEY) return preferred;

  const usable = availableKeys().filter((item) => item !== DEFAULT_KEY);
  return usable[0] ?? null;
}

/** 요청한 모델을 돌려주되, 쓸 수 없으면 폴백 정보를 함께 준다. */
export function resolve(key = null) {
  const requested = key || defaultKey();
  const model = REGISTRY.get(requested);

  if (!model) {
    return [REGISTRY.get(DEFAULT_KEY), requested, `'${requested}'는 없는 모델입니다.`];
  }
  if (!model.available()) {
    return [REGISTRY.get(DEFAULT_KEY), requested, model.unavailableReason()];
  }
  return [model, null, null];
}

export async function generate(context, key = null) {
  const [model, fallbackFrom, reason] = resolve(key);

  if (fallbackFrom) {
    const result = await model.generate(context);
    return { ...result, fallbackFrom, fallbackReason: reason };
  }

  try {
    const result = await model.generate(context);
    return { ...result, fallbackFrom: null, fallbackReason: null };
  } catch (error) {
    console.warn(`코칭 모델 ${model.key} 호출 실패: ${error.message}`);
    const result = await REGISTRY.get(DEFAULT_KEY).generate(context);
    return {
      ...result,
      fallbackFrom: model.key,
      fallbackReason: `${error.name}: ${error.message}`,
    };
  }
}

/** 운동 검색. 실패하면 규칙 기반으로 되돌리고 그 사실을 함께 돌려준다. */
export async function searchExercises(query, catalog, key = null) {
  const [model, fallbackFrom, reason] = resolve(key);
  const fallbackModel = REGISTRY.get(DEFAULT_KEY);

  if (fallbackFrom) {
    const result = await fallbackModel.searchExercises(query, catalog);
    return { ...result, model: fallbackModel.label, fallbackFrom, fallbackReason: reason };
  }

  try {
    const result = await model.searchExercises(query, catalog);
    return { ...result, model: model.label, fallbackFrom: null, fallbackReason: null };
  } catch (error) {
    console.warn(`검색 모델 ${model.key} 실패: ${error.message}`);
    const result = await fallbackModel.searchExercises(query, catalog);
    return {
      ...result,
      model: fallbackModel.label,
      fallbackFrom: model.key,
      fallbackReason: `${error.name}: ${error.message}`,
    };
  }
}

/** 식사 사진 → 음식 텍스트. 읽을 수 있는 모델이 없으면 그 사실을 알린다. */
export async function analyzeMealPhoto(imageBuffer, mediaType, key = null) {
  const [model, fallbackFrom, reason] = resolve(visionKey(key));

  if (fallbackFrom || model.key === DEFAULT_KEY) {
    return {
      text: "",
      available: false,
      model: null,
      reason:
        reason ||
        "사진을 읽을 수 있는 AI 모델이 연결되어 있지 않습니다. 음식과 양을 직접 적어주세요.",
    };
  }

  try {
    const result = await model.analyzeMealPhoto(imageBuffer, mediaType);
    return { ...result, available: true, model: model.label, reason: "" };
  } catch (error) {
    console.warn(`사진 분석 실패 (${model.key}): ${error.message}`);
    return {
      text: "",
      available: false,
      model: model.label,
      reason: `사진을 분석하지 못했습니다 (${error.name}). 직접 적어주세요.`,
    };
  }
}

/** 체성분 결과지 사진 → 키·체중·BMI. 읽을 수 있는 모델이 없으면 그 사실을 알린다. */
export async function analyzeBodyPhoto(imageBuffer, mediaType, key = null) {
  const [model, fallbackFrom, reason] = resolve(visionKey(key));

  if (fallbackFrom || model.key === DEFAULT_KEY) {
    return {
      reading: null,
      available: false,
      model: null,
      reason:
        reason ||
        "사진을 읽을 수 있는 AI 모델이 연결되어 있지 않습니다. 키와 체중을 직접 입력해 주세요.",
    };
  }

  try {
    const reading = await model.analyzeBodyPhoto(imageBuffer, mediaType);
    return { reading, available: true, model: model.label, reason: "" };
  } catch (error) {
    console.warn(`체성분 사진 분석 실패 (${model.key}): ${error.message}`);
    return {
      reading: null,
      available: false,
      model: model.label,
      reason: `사진을 분석하지 못했습니다 (${error.name}). 직접 입력해 주세요.`,
    };
  }
}

/**
 * 장르·길이에 맞는 곡 목록. 읽을 수 있는 모델이 없으면 그 사실을 알린다.
 * 화면은 이때 내장 대표 곡으로 내려간다.
 */
export async function buildPlaylist(request, key = null) {
  const [model, fallbackFrom, reason] = resolve(visionKey(key));

  if (fallbackFrom || model.key === DEFAULT_KEY) {
    return {
      tracks: [],
      available: false,
      model: null,
      reason:
        reason || "곡 목록을 짜 줄 AI 모델이 연결되어 있지 않아 기본 목록을 보여줍니다.",
    };
  }

  try {
    const result = await model.buildPlaylist(request);
    return {
      tracks: result.tracks ?? [],
      note: result.note ?? "",
      available: true,
      model: model.label,
      reason: "",
    };
  } catch (error) {
    console.warn(`플레이리스트 생성 실패 (${model.key}): ${error.message}`);
    return {
      tracks: [],
      available: false,
      model: model.label,
      reason: `목록을 만들지 못해 기본 목록을 보여줍니다 — ${describeAiError(error)}.`,
    };
  }
}

/** 모델 오류를 사용자가 이해할 문장으로. 원문에는 키·엔드포인트가 섞여 있어 그대로 못 쓴다. */
function describeAiError(error) {
  const message = error.message ?? "";
  if (message.includes(" 429")) return "오늘 AI 사용량을 다 썼습니다";
  if (/ 5\d\d/.test(message)) return "AI 서버가 잠시 혼잡합니다";
  if (message.includes(" 401") || message.includes(" 403")) return "AI 자격 증명을 확인해 주세요";
  return "잠시 후 다시 눌러 주세요";
}
