import { useEffect, useRef, useState } from "react";

import { PROVIDERS, isSupabaseConfigured, signIn, signOut } from "../api/supabaseClient";

/**
 * 계정 메뉴.
 *
 * 로그인은 선택이다. 키가 없으면 버튼이 비활성으로 남고 앱은 게스트로 돌아간다.
 * 로그인하면 그때까지 게스트로 쌓은 기록이 계정에 그대로 넘어간다.
 */
export default function AuthPanel({ session, busy, error, onSignOut }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState("");
  const [localError, setLocalError] = useState("");
  const rootRef = useRef(null);

  const user = session?.user;
  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.user_metadata?.nickname ||
    user?.email ||
    "로그인 사용자";

  // 바깥을 누르면 닫는다.
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const handleSignIn = async (provider) => {
    setPending(provider);
    setLocalError("");
    try {
      await signIn(provider);
      // 성공하면 OAuth 페이지로 넘어가므로 여기로 돌아오지 않는다.
    } catch (err) {
      setLocalError(err.message);
      setPending("");
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      onSignOut?.();
    } catch (err) {
      setLocalError(err.message);
    }
  };

  const message = localError || error;

  if (user) {
    return (
      <div className="auth-panel" ref={rootRef}>
        <span className="auth-user" title={user.email ?? ""}>
          {displayName}
        </span>
        <button type="button" className="secondary-button auth-button" onClick={handleSignOut}>
          로그아웃
        </button>
        {message && <span className="auth-error">{message}</span>}
      </div>
    );
  }

  return (
    <div className="auth-panel" ref={rootRef}>
      <button
        type="button"
        className="secondary-button auth-button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={busy || !isSupabaseConfigured}
        title={
          isSupabaseConfigured
            ? "로그인하면 기록이 계정에 저장됩니다."
            : "VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 .env에 넣어야 켜집니다."
        }
      >
        {isSupabaseConfigured ? "로그인" : "로그인 (설정 필요)"}
      </button>

      {open && isSupabaseConfigured && (
        <div className="auth-menu">
          <p className="auth-menu-note">지금까지의 기록이 계정으로 넘어갑니다.</p>
          {PROVIDERS.map((provider) => (
            <button
              type="button"
              key={provider.id}
              className={`auth-provider ${provider.id}`}
              onClick={() => handleSignIn(provider.id)}
              disabled={Boolean(pending)}
            >
              {pending === provider.id ? "이동 중…" : provider.label}
            </button>
          ))}
        </div>
      )}

      {message && <span className="auth-error">{message}</span>}
    </div>
  );
}
