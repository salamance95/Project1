/**
 * 소셜 로그인 토큰 확인.
 *
 * 프론트가 보낸 access token을 Supabase에 되물어 확인한다. 토큰 안의 값을 그대로
 * 믿으면 누구나 남의 계정 id를 적어 보내 그 사람의 기록을 열 수 있다.
 *
 * 서명을 직접 검증하지 않고 Supabase에 묻는 이유: JWT 시크릿을 백엔드에 두지
 * 않아도 되고, 로그아웃·계정 삭제로 무효가 된 토큰까지 걸러지기 때문이다.
 */

const AUTH_TIMEOUT_MS = 8000;

function config() {
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY ?? "";
  return { url, anonKey, ready: Boolean(url && anonKey) };
}

export function isAuthConfigured() {
  return config().ready;
}

/**
 * access token → 계정 정보. 토큰이 유효하지 않으면 null.
 * 설정이 안 되어 있으면 그 사실을 구분해서 알린다(로그인 실패와 다르다).
 */
export async function verifyAccessToken(accessToken) {
  const { url, anonKey, ready } = config();
  if (!ready) {
    return {
      ok: false,
      configured: false,
      reason:
        "서버에 SUPABASE_URL과 SUPABASE_ANON_KEY가 없습니다. 로그인 없이 게스트로 이용해 주세요.",
    };
  }
  if (!accessToken) {
    return { ok: false, configured: true, reason: "로그인 토큰이 없습니다." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${accessToken}`, apikey: anonKey },
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, configured: true, reason: "로그인이 만료되었습니다. 다시 로그인해 주세요." };
    }

    const user = await response.json();
    if (!user?.id) {
      return { ok: false, configured: true, reason: "계정 정보를 읽지 못했습니다." };
    }

    const meta = user.user_metadata ?? {};
    return {
      ok: true,
      configured: true,
      account: {
        supabaseUserId: user.id,
        email: user.email ?? null,
        // 제공자마다 이름을 담는 칸이 다르다.
        displayName: meta.name ?? meta.full_name ?? meta.nickname ?? null,
        provider: user.app_metadata?.provider ?? null,
      },
    };
  } catch (error) {
    const reason =
      error.name === "AbortError"
        ? "로그인 서버 응답이 없습니다. 잠시 후 다시 시도해 주세요."
        : `로그인 확인에 실패했습니다 (${error.name}).`;
    return { ok: false, configured: true, reason };
  } finally {
    clearTimeout(timer);
  }
}
