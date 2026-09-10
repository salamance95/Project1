/**
 * Gemini 기반 모델.
 *
 * SDK 없이 REST로 호출한다. 의존성을 하나 더 늘릴 만큼 쓰는 기능이 많지 않고,
 * 파이썬 쪽과 요청 모양을 똑같이 맞추기도 쉽다.
 *
 * 자격 증명이 없으면 available()이 false가 되고 레지스트리가 규칙 기반으로 되돌린다.
 * 호출 중 오류가 나면 예외를 그대로 올려서 레지스트리가 폴백을 기록하게 한다.
 */

import { CoachModel } from "./base.js";
import { SEARCH_SCHEMA, SEARCH_SYSTEM } from "./search.js";
import {
  BODY_PHOTO_SCHEMA,
  BODY_PHOTO_SYSTEM,
  COACH_SCHEMA,
  COACH_SYSTEM,
  PHOTO_SCHEMA,
  PHOTO_SYSTEM,
  PLAYLIST_SCHEMA,
  PLAYLIST_SYSTEM,
  buildCoachPrompt,
  buildPlaylistPrompt,
  buildSearchPrompt,
} from "./prompts.js";

const DEFAULT_MODEL = "gemini-3.6-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 40_000;

function apiKey() {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    ""
  );
}

function modelId() {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

/**
 * JSON Schema → Gemini responseSchema.
 * Gemini는 OpenAPI 부분집합을 받는다. 타입 이름이 대문자이고
 * additionalProperties 같은 키는 넣으면 400이 난다.
 */
export function toGeminiSchema(schema) {
  if (!schema || typeof schema !== "object") return schema;

  const out = {};
  if (schema.type) {
    // ["number","null"] 같은 유니언 타입은 Gemini가 400으로 거절한다.
    // 타입 하나 + nullable 로 풀어서 넘긴다.
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = types.filter((item) => item !== "null");
    out.type = String(actual[0] ?? "string").toUpperCase();
    if (types.length !== actual.length) out.nullable = true;
  }
  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = schema.enum;

  if (schema.properties) {
    out.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      out.properties[key] = toGeminiSchema(value);
    }
    // 응답 필드 순서를 고정해 두면 결과가 덜 흔들린다.
    out.propertyOrdering = Object.keys(schema.properties);
  }
  if (schema.required) out.required = schema.required;
  if (schema.items) out.items = toGeminiSchema(schema.items);
  if (schema.minItems !== undefined) out.minItems = schema.minItems;
  if (schema.maxItems !== undefined) out.maxItems = schema.maxItems;

  return out;
}

export class GeminiCoach extends CoachModel {
  static key = "gemini";
  static label = "Gemini";
  static provider = "google";
  static description =
    "계획과 기록을 통째로 읽고 맥락에 맞는 코칭을 생성합니다. 사진과 자유 질문에도 답합니다.";

  available() {
    return Boolean(apiKey());
  }

  unavailableReason() {
    return "자격 증명이 없습니다. GEMINI_API_KEY를 설정하세요.";
  }

  /**
   * 공통 호출부. parts를 받아 스키마에 맞는 JSON을 돌려준다.
   * 503(과부하)은 대개 몇 초 뒤에 풀리므로 한 번은 다시 시도한다.
   */
  async #call(system, parts, schema, config = {}) {
    try {
      return await this.#callOnce(system, parts, schema, config);
    } catch (error) {
      if (!/Gemini 50\d/.test(error.message)) throw error;

      await new Promise((resolve) => setTimeout(resolve, 1500));
      return this.#callOnce(system, parts, schema, config);
    }
  }

  async #callOnce(system, parts, schema, config = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response;
    try {
      response = await fetch(`${ENDPOINT}/${modelId()}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey(),
        },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: toGeminiSchema(schema),
            ...config,
          },
        }),
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // 본문에 원인이 적혀 있어서 그대로 올린다. (키 오류, 모델명 오타 등)
      const body = await response.text();
      throw new Error(`Gemini ${response.status}: ${body.slice(0, 300)}`);
    }

    const payload = await response.json();
    const candidate = payload.candidates?.[0];

    if (!candidate) {
      const blocked = payload.promptFeedback?.blockReason;
      throw new Error(blocked ? `요청이 차단되었습니다 (${blocked}).` : "빈 응답입니다.");
    }
    if (candidate.finishReason && !["STOP", "MAX_TOKENS"].includes(candidate.finishReason)) {
      throw new Error(`응답이 중단되었습니다 (${candidate.finishReason}).`);
    }

    const text = (candidate.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!text) throw new Error("응답에 본문이 없습니다.");
    return JSON.parse(text);
  }

  async generate(context) {
    const data = await this.#call(
      COACH_SYSTEM,
      [{ text: buildCoachPrompt(context) }],
      COACH_SCHEMA,
    );

    return {
      lines: data.lines.map((line) => line.trim()).filter(Boolean),
      model: modelId(),
      provider: this.provider,
    };
  }

  async searchExercises(query, catalog) {
    const data = await this.#call(
      SEARCH_SYSTEM,
      [{ text: buildSearchPrompt(query, catalog) }],
      SEARCH_SCHEMA,
    );

    // 없는 운동을 지어내도 여기서 걸러진다.
    const valid = new Set(catalog.map((item) => item.slug));
    return {
      matches: (data.matches ?? []).filter((item) => valid.has(item.slug)),
      summary: data.summary ?? "",
    };
  }

  async analyzeMealPhoto(imageBuffer, mediaType) {
    const data = await this.#call(
      PHOTO_SYSTEM,
      [
        { inline_data: { mime_type: mediaType, data: imageBuffer.toString("base64") } },
        { text: "이 사진의 음식과 양, 대략적인 영양소를 적어주세요." },
      ],
      PHOTO_SCHEMA,
    );

    const foods = (data.foods ?? []).filter((item) => item.name?.trim());

    return {
      // 텍스트 상자에 그대로 들어갈 문장. 사용자가 고칠 수 있다.
      text: foods.map((item) => `${item.name.trim()} ${item.amount}${item.unit}`).join(", "),
      foods,
      confidence: data.confidence ?? "medium",
      note: data.note ?? "",
    };
  }

  /** 장르와 길이 → 그 조건에 맞는 곡 목록. */
  async buildPlaylist(request) {
    // 곡을 나열하는 일이라 깊이 생각할 게 없다. 낮추면 3배 빨라진다.
    return this.#call(
      PLAYLIST_SYSTEM,
      [{ text: buildPlaylistPrompt(request) }],
      PLAYLIST_SCHEMA,
      { thinkingConfig: { thinkingLevel: "low" } },
    );
  }

  /** 체성분 결과지 사진 → 키·체중·BMI 수치. */
  async analyzeBodyPhoto(imageBuffer, mediaType) {
    return this.#call(
      BODY_PHOTO_SYSTEM,
      [
        { inline_data: { mime_type: mediaType, data: imageBuffer.toString("base64") } },
        { text: "이 결과지에 적힌 키·체중·BMI 수치를 그대로 옮겨 적어주세요." },
      ],
      BODY_PHOTO_SCHEMA,
    );
  }
}
