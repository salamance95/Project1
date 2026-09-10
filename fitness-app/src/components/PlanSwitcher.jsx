import { useEffect, useState } from "react";

import { api } from "../api";

/**
 * 플랜 갈아타기.
 *
 * 만들어 둔 플랜 사이를 오간다. 기록은 플랜이 아니라 사용자에게 붙어 있어서
 * 어느 플랜으로 바꿔도 지난 운동 기록은 그대로 남는다.
 */
export default function PlanSwitcher({ userId, onSwitched, onRestart }) {
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!open) return undefined;

    const controller = new AbortController();

    api
      .plans(userId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setPlans(result.plans ?? []);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message);
      });

    return () => controller.abort();
  }, [open, userId]);

  const activate = async (planId) => {
    setBusyId(planId);
    setError("");
    try {
      const result = await api.activatePlan(userId, planId);
      onSwitched(result.plan);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="plan-switcher">
      <button
        type="button"
        className="secondary-button"
        onClick={() => {
          setError("");
          setOpen((v) => !v);
        }}
      >
        {open ? "닫기" : "플랜 바꾸기"}
      </button>

      {open && (
        <div className="plan-switcher-panel">
          <p className="plan-switcher-note">
            지난 운동 기록은 플랜과 상관없이 그대로 남습니다.
          </p>

          {error && <p className="form-error">{error}</p>}
          {!plans && !error && <p className="loading-state">플랜을 불러오는 중입니다.</p>}

          {plans?.length === 0 && <p className="empty-note">저장된 플랜이 없습니다.</p>}

          {plans?.map((item) => (
            <div
              key={item.planId}
              className={item.isActive ? "plan-row current" : "plan-row"}
            >
              <span className="plan-row-main">
                <strong>{item.variant}</strong>
                <small>{item.weekStart} 주간</small>
              </span>
              {item.isActive ? (
                <em className="plan-row-badge">사용 중</em>
              ) : (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => activate(item.planId)}
                  disabled={busyId !== null}
                >
                  {busyId === item.planId ? "바꾸는 중…" : "이걸로"}
                </button>
              )}
            </div>
          ))}

          <button type="button" className="plan-switcher-new" onClick={onRestart}>
            새로 설문해서 만들기
          </button>
        </div>
      )}
    </div>
  );
}
