import { createClient } from "@supabase/supabase-js";

/**
 * 소셜 로그인.
 *
 * 로그인은 선택이다. 키가 없으면 supabase가 null이 되고 앱은 게스트로 그대로
 * 돌아간다 — 발표나 데모 자리에서 키 하나 때문에 앱이 멈추면 안 된다.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/** 화면에 띄울 제공자 목록. Supabase 대시보드에서 켠 것만 실제로 동작한다. */
export const PROVIDERS = [
  { id: "google", label: "Google로 계속하기" },
  { id: "kakao", label: "카카오로 계속하기" },
];

export async function signIn(provider) {
  if (!supabase) {
    throw new Error("Supabase URL과 anon key를 .env에 설정해주세요.");
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    // 로그인 후 돌아올 곳. Supabase 대시보드의 Redirect URLs에도 같은 주소를 넣어야 한다.
    options: { redirectTo: window.location.origin },
  });

  if (error) throw error;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** 지금 로그인된 세션. 없으면 null. */
export async function currentSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

/**
 * 로그인·로그아웃을 구독한다. 구독을 끊는 함수를 돌려준다.
 * OAuth는 리다이렉트로 돌아오므로, 첫 렌더 뒤에 세션이 생기는 경우가 있다.
 */
export function onAuthChange(handler) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    handler(session ?? null);
  });
  return () => data.subscription.unsubscribe();
}
