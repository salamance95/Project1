/**
 * Claude 기반 모델.
 *
 * 자격 증명이 없으면 available()이 false가 되고 레지스트리가 규칙 기반으로 되돌린다.
 * 호출 중 오류가 나면 예외를 그대로 올려서 레지스트리가 폴백을 기록하게 한다.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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

const MODEL_ID = "claude-opus-5";
const MAX_TOKENS = 2048;

function hasCredentials() {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return true;
  // `ant auth login` 프로필도 SDK가 자동으로 읽는다.
  return fs.existsSync(path.join(os.homedir(), ".config", "anthropic"));
}

async function loadSdk() {
  // 선택 의존성이라 설치돼 있을 때만 불러온다.
  const module = await import("@anthropic-ai/sdk");
  return module.default ?? module.Anthropic;
}

let sdkAvailable = null;
try {
  // require.resolve 대신 동기 파일 확인으로 설치 여부만 본다.
  const url = new URL("../../node_modules/@anthropic-ai/sdk/package.json", import.meta.url);
  sdkAvailable = fs.existsSync(url);
} catch {
  sdkAvailable = false;
}

export class ClaudeCoach extends CoachModel {
  static key = "claude";
  static label = `Claude (${MODEL_ID})`;
  static provider = "anthropic";
  static description =
    "계획과 기록을 통째로 읽고 맥락에 맞는 코칭을 생성합니다. 사진과 자유 질문에도 답합니다.";

  available() {
    return Boolean(sdkAvailable) && hasCredentials();
  }

  unavailableReason() {
    if (!sdkAvailable) {
      return "@anthropic-ai/sdk 패키지가 설치돼 있지 않습니다. npm install @anthropic-ai/sdk";
    }
    return "자격 증명이 없습니다. ANTHROPIC_API_KEY를 설정하거나 ant auth login을 실행하세요.";
  }

  async #client() {
    const Anthropic = await loadSdk();
    return new Anthropic({ timeout: 40_000 });
  }

  async generate(context) {
    const client = await this.#client();

    const response = await client.beta.messages.create({
      model: MODEL_ID,
      max_tokens: MAX_TOKENS,
      system: COACH_SYSTEM,
      messages: [{ role: "user", content: buildCoachPrompt(context) }],
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: COACH_SCHEMA } },
      // 정책상 거절되면 같은 호출 안에서 대체 모델로 다시 시도한다.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    if (response.stop_reason === "refusal") throw new Error("모델이 응답을 거절했습니다.");

    const text = response.content.find((block) => block.type === "text").text;
    const data = JSON.parse(text);

    return {
      lines: data.lines.map((line) => line.trim()).filter(Boolean),
      model: response.model !== MODEL_ID ? `${MODEL_ID} (${response.model})` : MODEL_ID,
      provider: this.provider,
    };
  }

  async searchExercises(query, catalog) {
    const client = await this.#client();

    const response = await client.beta.messages.create({
      model: MODEL_ID,
      max_tokens: MAX_TOKENS,
      system: SEARCH_SYSTEM,
      messages: [{ role: "user", content: buildSearchPrompt(query, catalog) }],
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: SEARCH_SCHEMA } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    if (response.stop_reason === "refusal") throw new Error("모델이 응답을 거절했습니다.");

    const text = response.content.find((block) => block.type === "text").text;
    const data = JSON.parse(text);
    const valid = new Set(catalog.map((item) => item.slug));

    return {
      matches: data.matches.filter((item) => valid.has(item.slug)),
      summary: data.summary,
    };
  }

  /**
   * 식사 사진에서 음식과 양을 읽어 한 줄 텍스트로 돌려준다.
   * 열량은 묻지 않는다. 기존 음식 DB로 계산해야 화면 수치와 어긋나지 않는다.
   */
  async analyzeMealPhoto(imageBuffer, mediaType) {
    const client = await this.#client();

    const response = await client.beta.messages.create({
      model: MODEL_ID,
      max_tokens: 1024,
      system: PHOTO_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: imageBuffer.toString("base64"),
              },
            },
            { type: "text", text: "이 사진의 음식과 양을 적어주세요." },
          ],
        },
      ],
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: PHOTO_SCHEMA } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    if (response.stop_reason === "refusal") throw new Error("모델이 응답을 거절했습니다.");

    const text = response.content.find((block) => block.type === "text").text;
    const data = JSON.parse(text);

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
    const client = await this.#client();

    const response = await client.beta.messages.create({
      model: MODEL_ID,
      max_tokens: 4096,
      system: PLAYLIST_SYSTEM,
      messages: [{ role: "user", content: buildPlaylistPrompt(request) }],
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: PLAYLIST_SCHEMA } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    if (response.stop_reason === "refusal") throw new Error("모델이 응답을 거절했습니다.");

    const text = response.content.find((block) => block.type === "text").text;
    return JSON.parse(text);
  }

  /** 체성분 결과지 사진 → 키·체중·BMI 수치. */
  async analyzeBodyPhoto(imageBuffer, mediaType) {
    const client = await this.#client();

    const response = await client.beta.messages.create({
      model: MODEL_ID,
      max_tokens: 1024,
      system: BODY_PHOTO_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: imageBuffer.toString("base64"),
              },
            },
            { type: "text", text: "이 결과지에 적힌 키·체중·BMI 수치를 그대로 옮겨 적어주세요." },
          ],
        },
      ],
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: BODY_PHOTO_SCHEMA } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    if (response.stop_reason === "refusal") throw new Error("모델이 응답을 거절했습니다.");

    const text = response.content.find((block) => block.type === "text").text;
    return JSON.parse(text);
  }
}
