import { useEffect, useState } from "react";
import { api } from "../api";
import SafetyNotice from "./SafetyNotice";

export default function RoutineRecommendation({ userProfile, userId, onSelect, onBack }) {
  const [plans, setPlans] = useState([]);
  const [safety, setSafety] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    const run = async () => {
      let nextPlans = [];
      let nextSafety = null;
      let nextError = "";

      try {
        const result = await api.recommendRoutines(userProfile, controller.signal);
        nextPlans = result.plans ?? [];
        nextSafety = result.safety ?? null;
      } catch (err) {
        if (err.name === "AbortError") return;
        nextError = `${err.message} 서버 연결을 확인해 주세요.`;
      }

      if (controller.signal.aborted) return;
      setPlans(nextPlans);
      setSafety(nextSafety);
      setError(nextError);
      setIsLoading(false);
    };

    run();
    return () => controller.abort();
  }, [userProfile, reloadToken]);

  const retry = () => {
    setIsLoading(true);
    setError("");
    setReloadToken((prev) => prev + 1);
  };

  const choose = async (plan) => {
    setSavingId(plan.id);
    setError("");

    try {
      const result = await api.selectPlan(userId, plan);
      onSelect(result.plan);
    } catch (err) {
      setError(`${err.message} 플랜을 저장하지 못했습니다.`);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="recommendation-layout">
      <header className="page-head">
        <div>
          <span className="page-eyebrow">ROUTINE RECOMMENDATION</span>
          <h1>맞춤 1주 플랜을 선택하세요</h1>
        </div>
      </header>

      <div className="panel section-heading">
        <div>
          <p>
            {userProfile.goal} / {userProfile.level} / {userProfile.frequency} /{" "}
            {userProfile.duration} / {userProfile.style}
          </p>
          {plans.length > 0 && (
            <p className="plan-basis">
              분할 {plans[0].split}
              {plans[0].splitAuto ? "(자동)" : ""}
              {plans[0].bmi ? ` · BMI ${plans[0].bmi}` : ""}
              {plans[0].preciseBody
                ? ` · 체지방 ${plans[0].bodyFat ?? "-"}% · ${plans[0].bodyType ?? plans[0].bmiCategory}`
                : plans[0].bmi
                  ? `(${plans[0].bmiCategory})`
                  : ""}
              {plans[0].bmiNote ? ` — ${plans[0].bmiNote}` : ""}
            </p>
          )}
        </div>
        <button type="button" className="secondary-button" onClick={onBack}>
          이전
        </button>
      </div>

      <SafetyNotice safety={safety} onBack={onBack} />

      {isLoading && <div className="panel loading-state">AI 플랜을 구성하는 중입니다.</div>}
      {error && (
        <div className="panel form-error-panel">
          <p className="form-error">{error}</p>
          <button type="button" className="secondary-button" onClick={retry}>
            다시 시도
          </button>
        </div>
      )}

      <div className="routine-grid">
        {plans.map((plan) => (
          <article className="routine-card" key={plan.id}>
            <div>
              <p className="eyebrow">
                {plan.variant} · {plan.split} · 운동 + 식단 + 코칭
              </p>
              <h3>{plan.title}</h3>
              <p>{plan.description}</p>
            </div>

            <div className="target-row">
              <span className="target-label">하루 목표</span>
              <div className="nutrition-strip">
                <span>{plan.dailyTargets.calories.toLocaleString()} kcal</span>
                <span>단백질 {plan.dailyTargets.protein}g</span>
                <span>탄수 {plan.dailyTargets.carbs}g</span>
                <span>지방 {plan.dailyTargets.fat}g</span>
              </div>
            </div>

            <ul className="mini-plan-list">
              {plan.schedule
                .filter((dayPlan) => !dayPlan.isRestDay)
                .map((dayPlan) => (
                  <li key={dayPlan.day}>
                    <strong>{dayPlan.day}</strong>
                    <span>
                      {dayPlan.workout.focus}
                      <em className={`intensity ${dayPlan.intensity}`}>
                        {dayPlan.intensityLabel}
                      </em>
                    </span>
                    <small>
                      {dayPlan.meal.calories.toLocaleString()}kcal · 탄수{" "}
                      {dayPlan.meal.carbs}g — {dayPlan.meal.target}
                    </small>
                  </li>
                ))}
            </ul>

            <p className="rest-note">
              휴식일: {plan.schedule.filter((d) => d.isRestDay).map((d) => d.day).join(", ")}
            </p>

            <div className="guide-preview">
              {plan.coaching.slice(0, 2).map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>

            <button
              type="button"
              className="primary-button"
              onClick={() => choose(plan)}
              disabled={savingId !== null}
            >
              {savingId === plan.id ? "저장 중..." : "이 플랜 선택"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
