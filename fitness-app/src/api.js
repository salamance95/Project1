const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function request(path, { method = "GET", body, signal } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!response.ok) {
    let detail = `요청에 실패했습니다 (${response.status})`;
    try {
      const payload = await response.json();
      if (payload.detail) detail = payload.detail;
    } catch {
      // 본문이 JSON이 아니면 기본 메시지를 쓴다.
    }
    throw new Error(detail);
  }

  return response.json();
}

export const api = {
  onboardingOptions: (signal) => request("/api/onboarding/options", { signal }),

  submitOnboarding: (profile) =>
    request("/api/onboarding", { method: "POST", body: profile }),

  recommendRoutines: (profile, signal) =>
    request("/api/recommend-routines", { method: "POST", body: profile, signal }),

  selectPlan: (userId, plan) =>
    request("/api/plans/select", { method: "POST", body: { userId, plan } }),

  activePlan: (userId, signal) =>
    request(`/api/plans/active?user_id=${userId}`, { signal }),

  reschedule: (payload) => request("/api/reschedule", { method: "POST", body: payload }),

  diningOut: (payload) => request("/api/dining-out", { method: "POST", body: payload }),

  logWorkout: (payload) => request("/api/logs/workout", { method: "POST", body: payload }),

  logMeal: (payload) => request("/api/logs/meal", { method: "POST", body: payload }),

  estimateNutrition: (text, signal) =>
    request("/api/nutrition/estimate", { method: "POST", body: { text }, signal }),

  deleteMeal: (userId, logId) =>
    request(`/api/logs/meal/${logId}?user_id=${userId}`, { method: "DELETE" }),

  logs: (userId, weekStart, signal) =>
    request(`/api/logs?user_id=${userId}&week_start=${weekStart}`, { signal }),

  logsRange: (userId, start, end, signal) =>
    request(`/api/logs?user_id=${userId}&start=${start}&end=${end}`, { signal }),

  plans: (userId, signal) => request(`/api/plans?user_id=${userId}`, { signal }),

  activatePlan: (userId, planId) =>
    request(`/api/plans/${planId}/activate?user_id=${userId}`, { method: "POST" }),

  weeklyReport: (userId, weekStart, signal) =>
    request(`/api/reports/weekly?user_id=${userId}&week_start=${weekStart}`, { signal }),

  regeneratePlan: (userId, weekStart, apply) =>
    request("/api/plans/regenerate", {
      method: "POST",
      body: { userId, weekStart, apply },
    }),

  gamification: (userId, signal) => request(`/api/gamification?user_id=${userId}`, { signal }),

  exercises: (query, signal) =>
    request(`/api/exercises?q=${encodeURIComponent(query ?? "")}`, { signal }),

  exerciseDetail: (slug, signal) => request(`/api/exercises/${slug}`, { signal }),

  experiments: (userId, signal) => request(`/api/experiments?user_id=${userId}`, { signal }),

  experimentResults: (signal) => request("/api/experiments/results", { signal }),

  aiModels: (signal) => request("/api/ai/models", { signal }),

  aiCoach: (payload) => request("/api/ai/coach", { method: "POST", body: payload }),
};

export const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

export function isoDate(weekStart, dayIndex) {
  // toISOString()은 UTC로 변환하며 하루를 밀어버린다. 로컬 날짜 그대로 조립한다.
  const base = new Date(`${weekStart}T00:00:00`);
  base.setDate(base.getDate() + dayIndex);

  const month = String(base.getMonth() + 1).padStart(2, "0");
  const day = String(base.getDate()).padStart(2, "0");
  return `${base.getFullYear()}-${month}-${day}`;
}

export function addDays(isoDay, count) {
  const base = new Date(`${isoDay}T00:00:00`);
  base.setDate(base.getDate() + count);
  return toIso(base);
}

export function toIso(dateObj) {
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${dateObj.getFullYear()}-${month}-${day}`;
}

export function dayIndexOf(isoDay) {
  // 월요일을 0으로 맞춘다.
  return (new Date(`${isoDay}T00:00:00`).getDay() + 6) % 7;
}

/**
 * 받침 유무에 따라 조사를 고른다. "스쿼트으로"처럼 어색해지는 것을 막는다.
 * 종성이 없거나 ㄹ이면 '로', 그 외에는 '으로'.
 */
export function withParticle(word, withJong, withoutJong) {
  const last = (word ?? "").trim().slice(-1);
  const code = last.charCodeAt(0);

  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return withJong;

  const jong = (code - 0xac00) % 28;
  return jong === 0 || jong === 8 ? withoutJong : withJong;
}

export const storage = {
  getUserId() {
    const raw = window.localStorage.getItem("fitness.userId");
    return raw ? Number(raw) : null;
  },
  setUserId(userId) {
    window.localStorage.setItem("fitness.userId", String(userId));
  },
  clear() {
    window.localStorage.removeItem("fitness.userId");
  },
};
