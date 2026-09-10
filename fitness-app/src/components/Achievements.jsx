import { useEffect, useState } from "react";
import { api } from "../api";
import GrowthBody, { START_BUILD } from "./GrowthBody";

const KIND_LABEL = {
  workout: "운동",
  meal: "식단",
  protein: "단백질",
};

export default function Achievements({ userId, refreshToken }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    const run = async () => {
      let next = null;
      let nextError = "";

      try {
        const result = await api.gamification(userId, controller.signal);
        next = result.summary;
      } catch (err) {
        if (err.name === "AbortError") return;
        nextError = err.message;
      }

      if (controller.signal.aborted) return;
      setSummary(next);
      setError(nextError);
      setIsLoading(false);
    };

    run();
    return () => controller.abort();
  }, [userId, refreshToken]);

  if (isLoading) {
    return <div className="panel loading-state">기록을 집계하는 중입니다.</div>;
  }
  if (error) return <p className="form-error">{error}</p>;
  if (!summary) return null;

  const nextAt = summary.nextAt;
  const progressToNext = nextAt
    ? Math.min(Math.round((summary.points / nextAt) * 100), 100)
    : 100;

  // 체형은 획득한 뱃지 비율로 정한다. 뱃지는 회수되지 않으므로 몸이 되돌아가지
  // 않는다. (레벨 진행도는 레벨이 오를 때마다 분모가 커져 되레 줄어든다.)
  const badgeRate = summary.badges.length
    ? summary.earnedCount / summary.badges.length
    : 0;
  const build = START_BUILD + (1 - START_BUILD) * badgeRate;

  // 가장 가까운 다음 도전과제 하나만 짚어 준다.
  const nextBadge = summary.badges
    .filter((badge) => !badge.earned)
    .sort(
      (a, b) =>
        b.progress.current / b.progress.target - a.progress.current / a.progress.target,
    )[0];

  return (
    <section className="achievement-layout">
      <header className="page-head">
        <div>
          <span className="page-eyebrow">리포트 · LEVEL {summary.level}</span>
          <h1>성장</h1>
        </div>
      </header>

      <section className="panel level-card">
        <div className="level-head">
          <div>
            <p className="eyebrow">Level {summary.level}</p>
            <h2>{summary.title}</h2>
          </div>
          <strong className="point-value">{summary.points.toLocaleString()} P</strong>
        </div>

        <div className="report-bar-track">
          <div className="report-bar-fill good" style={{ width: `${progressToNext}%` }} />
        </div>
        <p className="level-note">
          {nextAt
            ? `다음 레벨까지 ${(nextAt - summary.points).toLocaleString()}P 남았습니다.`
            : "최고 레벨에 도달했습니다."}
        </p>
      </section>

      <section className="panel growth-card">
        <div className="section-heading">
          <div>
            <h2>성장</h2>
            <p>도전과제를 깰수록 몸이 붙습니다. 왼쪽이 시작할 때의 체형입니다.</p>
          </div>
          <strong className="growth-rate">{Math.round(badgeRate * 100)}%</strong>
        </div>

        <GrowthBody build={build} />

        <div className="growth-status">
          <p className="growth-count">
            도전과제 <strong>{summary.earnedCount}</strong> / {summary.badges.length} 달성
          </p>
          {nextBadge ? (
            <p className="growth-next">
              다음 <strong>{nextBadge.icon} {nextBadge.name}</strong> —{" "}
              {nextBadge.progress.current.toLocaleString()} /{" "}
              {nextBadge.progress.target.toLocaleString()}
            </p>
          ) : (
            <p className="growth-next">모든 도전과제를 달성했습니다.</p>
          )}
        </div>
      </section>

      <div className="metrics-grid">
        <article className="metric">
          <span>현재 연속</span>
          <strong>{summary.currentStreak}일</strong>
        </article>
        <article className="metric">
          <span>최고 연속</span>
          <strong>{summary.bestStreak}일</strong>
        </article>
        <article className="metric">
          <span>누적 볼륨</span>
          <strong>{summary.totalVolume.toLocaleString()} kg</strong>
        </article>
        <article className="metric">
          <span>획득 뱃지</span>
          <strong>
            {summary.earnedCount} / {summary.badges.length}
          </strong>
        </article>
      </div>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>뱃지</h2>
            <p>기록이 쌓이면 자동으로 해금됩니다.</p>
          </div>
        </div>

        <div className="badge-grid">
          {summary.badges.map((badge) => {
            const rate = Math.round((badge.progress.current / badge.progress.target) * 100);
            return (
              <article
                key={badge.code}
                className={badge.earned ? "badge-card earned" : "badge-card"}
              >
                <span className="badge-icon">{badge.icon}</span>
                <div className="badge-body">
                  <strong>{badge.name}</strong>
                  <p>{badge.description}</p>
                  {!badge.earned && (
                    <>
                      <div className="badge-track">
                        <div className="badge-fill" style={{ width: `${rate}%` }} />
                      </div>
                      <small>
                        {badge.progress.current.toLocaleString()} /{" "}
                        {badge.progress.target.toLocaleString()}
                      </small>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {summary.recent.length > 0 && (
        <section className="panel">
          <h2>최근 적립</h2>
          <ul className="point-list">
            {summary.recent.map((item, index) => (
              <li key={`${item.date}-${item.kind}-${index}`}>
                <span className="point-date">{item.date.slice(5)}</span>
                <span className="point-kind">{KIND_LABEL[item.kind] ?? item.kind}</span>
                <span className="point-reason">{item.reason}</span>
                <strong>+{item.amount}P</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
