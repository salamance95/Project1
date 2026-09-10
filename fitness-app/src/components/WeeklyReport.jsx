import { useEffect, useState } from "react";
import { api } from "../api";
import { muscleClass } from "../data/muscles";

const MODE_LABEL = {
  progress: "볼륨 증가",
  deload: "디로드",
  scale_down: "부담 완화",
  maintain: "유지",
};


function Bar({ label, actual, planned, unit }) {
  const rate = planned ? Math.round((actual / planned) * 100) : 0;
  const width = Math.min(rate, 130);
  const tone = rate >= 115 ? "over" : rate >= 85 ? "good" : "under";

  return (
    <div className="report-bar">
      <div className="report-bar-head">
        <span>{label}</span>
        <strong>
          {actual.toLocaleString()} / {planned.toLocaleString()}
          {unit} <em className={`rate ${tone}`}>{rate}%</em>
        </strong>
      </div>
      <div className="report-bar-track">
        <div className={`report-bar-fill ${tone}`} style={{ width: `${width}%` }} />
        <span className="report-bar-goal" />
      </div>
    </div>
  );
}

export default function WeeklyReport({ userId, weekStart, refreshToken, onPlanRegenerated }) {
  const [report, setReport] = useState(null);
  const [adjustment, setAdjustment] = useState(null);
  const [regenState, setRegenState] = useState("idle");
  const [regenError, setRegenError] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    const run = async () => {
      let next = null;
      let nextError = "";

      try {
        const result = await api.weeklyReport(userId, weekStart, controller.signal);
        next = result.report;
      } catch (err) {
        if (err.name === "AbortError") return;
        nextError = err.message;
      }

      if (controller.signal.aborted) return;
      setReport(next);
      setError(nextError);
      setIsLoading(false);
    };

    run();
    return () => controller.abort();
  }, [userId, weekStart, refreshToken]);

  if (isLoading) {
    return <div className="panel loading-state">리포트를 계산하는 중입니다.</div>;
  }

  if (error) {
    return <p className="form-error">{error}</p>;
  }

  if (!report) return null;

  const { workout, nutrition, insights } = report;

  const previewNextWeek = async () => {
    setRegenState("loading");
    setRegenError("");
    try {
      const result = await api.regeneratePlan(userId, weekStart, false);
      setAdjustment(result.adjustment);
      setRegenState("preview");
    } catch (err) {
      setRegenError(err.message);
      setRegenState("idle");
    }
  };

  const applyNextWeek = async () => {
    setRegenState("loading");
    setRegenError("");
    try {
      const result = await api.regeneratePlan(userId, weekStart, true);
      setRegenState("applied");
      onPlanRegenerated?.(result.plan);
    } catch (err) {
      setRegenError(err.message);
      setRegenState("preview");
    }
  };

  return (
    <section className="report-layout">
      <div className="panel section-heading">
        <div>
          <p className="eyebrow">Weekly Report</p>
          <h2>{report.weekStart} 주간 분석</h2>
          <p>{report.planTitle}</p>
        </div>
      </div>

      <section className="panel regen-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Auto Progression</p>
            <h2>다음 주 루틴 자동 재생성</h2>
            <p>이번 주 수행률과 체감 강도를 근거로 다음 주 계획을 스스로 조정합니다.</p>
          </div>
          {regenState === "idle" && (
            <button type="button" className="secondary-button" onClick={previewNextWeek}>
              조정안 보기
            </button>
          )}
        </div>

        {regenState === "loading" && <p className="loading-state">계획을 계산하는 중입니다.</p>}
        {regenError && <p className="form-error">{regenError}</p>}

        {adjustment && (
          <div className="adjustment-box">
            <div className="adjustment-head">
              <span className={`mode-chip ${adjustment.mode}`}>{MODE_LABEL[adjustment.mode]}</span>
              <span className="adjustment-meta">
                {adjustment.frequency}
                {adjustment.trainingDays && ` · ${adjustment.trainingDays.join(", ")}요일`}
              </span>
            </div>
            <ul>
              {adjustment.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            {regenState === "preview" && (
              <button type="button" className="primary-button" onClick={applyNextWeek}>
                다음 주 계획으로 적용
              </button>
            )}
            {regenState === "applied" && (
              <p className="log-message">다음 주 계획을 만들었습니다. 주간 계획 탭에서 확인하세요.</p>
            )}
          </div>
        )}
      </section>

      <div className="metrics-grid">
        <article className="metric">
          <span>운동 수행률</span>
          <strong>{workout.adherence}%</strong>
          <small>
            {workout.done}회 완료 / 계획 {workout.plannedSessions}회
          </small>
        </article>
        <article className="metric">
          <span>총 볼륨 (무게×횟수)</span>
          <strong>{workout.totalVolume.toLocaleString()} kg</strong>
          <small>
            {workout.volumeChange === null ? (
              "지난주 기록이 없어 비교 불가"
            ) : (
              <>
                지난주 {workout.prevVolume.toLocaleString()}kg 대비{" "}
                <em className={workout.volumeChange >= 0 ? "up" : "down"}>
                  {workout.volumeChange >= 0 ? "+" : ""}
                  {workout.volumeChange}%
                </em>
              </>
            )}
          </small>
        </article>
        <article className="metric">
          <span>평균 체감 강도</span>
          <strong>{workout.avgRpe ?? "-"}</strong>
          <small>
            {workout.avgRpe === null
              ? "RPE를 기록하면 강도를 조절합니다"
              : workout.avgRpe >= 8.5
                ? "높음 — 다음 주 자동 디로드 대상"
                : workout.avgRpe <= 5
                  ? "여유 있음 — 중량을 올려도 됩니다"
                  : "적정 범위"}
          </small>
        </article>
        <article className="metric">
          <span>기록한 세트</span>
          <strong>{workout.totalSets}세트</strong>
          <small>식단 기록 {nutrition.loggedDays}일</small>
        </article>
      </div>

      <section className="panel">
        <h2>인사이트</h2>
        <ul className="insight-list">
          {insights.map((item) => (
            <li key={item.title} className={`insight ${item.kind}`}>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>영양 달성률</h2>
            <p>
              식단을 기록한 {nutrition.loggedDays}일에 대해 같은 날 계획값과 비교했습니다.
              (주 전체 계획 {nutrition.plannedFullWeek.calories.toLocaleString()} kcal)
            </p>
          </div>
        </div>

        <div className="report-bars">
          <Bar
            label="열량"
            actual={nutrition.actual.calories}
            planned={nutrition.planned.calories}
            unit=" kcal"
          />
          <Bar
            label="단백질"
            actual={nutrition.actual.protein}
            planned={nutrition.planned.protein}
            unit="g"
          />
          <Bar
            label="탄수화물"
            actual={nutrition.actual.carbs}
            planned={nutrition.planned.carbs}
            unit="g"
          />
          <Bar
            label="지방"
            actual={nutrition.actual.fat}
            planned={nutrition.planned.fat}
            unit="g"
          />
        </div>
      </section>


      {workout.records.length > 0 && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>운동별 최고 기록</h2>
              <p>
                중량 운동은 이번 주 최고 무게를, 맨몸 운동은 최고 횟수를 보여줍니다.
              </p>
            </div>
          </div>

          <div className="record-lines">
            {workout.records.map((item) => {
              const muscle = /\(([^)]+)\)\s*$/.exec(item.name)?.[1] ?? "";
              const bare = item.name.replace(/\s*\([^)]+\)\s*$/, "");

              return (
                <div className="record-line" key={item.name}>
                  <span className="record-line-name">
                    {bare}
                    {muscle && <em className={`tag ${muscleClass(muscle)}`}>{muscle}</em>}
                  </span>
                  <span className="record-line-best">{item.best}</span>
                  <span className="record-line-sets">{item.sets}세트</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </section>
  );
}
