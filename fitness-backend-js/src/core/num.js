/**
 * 숫자 처리 헬퍼.
 *
 * 파이썬 round()는 절반일 때 짝수로 붙이고(banker's rounding), JS Math.round()는
 * 무조건 올린다. round(2.5)가 파이썬은 2, JS는 3이다. 두 백엔드의 응답을 그대로
 * 비교하려면 이 차이를 없애야 해서 파이썬 규칙을 따르는 round를 쓴다.
 */

export function pyRound(value, digits = 0) {
  if (!Number.isFinite(value)) return value;

  const factor = 10 ** digits;
  const scaled = value * factor;
  const sign = scaled < 0 ? -1 : 1;
  const abs = Math.abs(scaled);

  const floor = Math.floor(abs);
  const diff = abs - floor;

  let rounded;
  if (Math.abs(diff - 0.5) < 1e-9) {
    // 정확히 절반이면 짝수 쪽으로 붙인다.
    rounded = floor % 2 === 0 ? floor : floor + 1;
  } else {
    rounded = Math.round(abs);
  }

  const result = (sign * rounded) / factor;
  // -0을 0으로 정리한다.
  return result === 0 ? 0 : result;
}

/** 파이썬 max(a, b)와 같되 숫자 전용. */
export function clamp(value, min, max) {
  if (min !== undefined && value < min) return min;
  if (max !== undefined && value > max) return max;
  return value;
}

/**
 * DB에 저장할 시각. SQLAlchemy는 "YYYY-MM-DD HH:MM:SS.ffffff"로 넣는데
 * SQLite CURRENT_TIMESTAMP는 소수점 없는 공백 형식이라 직접 맞춰준다.
 */
export function nowIso() {
  const iso = new Date().toISOString(); // 2026-09-03T03:14:48.852Z
  return `${iso.slice(0, 10)} ${iso.slice(11, 23)}000`;
}

/** 저장 형식(공백 구분)을 응답 형식(ISO, T 구분)으로. 파이썬 쪽 직렬화와 같다. */
export function isoOut(value) {
  if (!value) return null;
  return value.replace(" ", "T");
}
