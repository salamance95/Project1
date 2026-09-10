import { useMemo, useState } from "react";
import { api, isoDate } from "../api";
import { muscleClass, musclesOf, prescriptionText, primaryMuscleText } from "../data/muscles";
import { plannedKcalOfDay } from "../data/energy";

/**
 * 오늘 화면 — 1A 트레이닝 데스크의 첫 화면.
 *
 * 주간 계획 전체가 아니라 "오늘 할 것" 하나만 크게 보여준다.
 * 숫자(수행률·연속·볼륨·RPE)는 App 이 사이드바용으로 이미 받아 둔 값을 그대로 쓴다 —
 * 같은 것을 두 번 부르지 않기 위해서다.
 */

function localToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** "60kg · 4×10" 은 무게와 세트로 나눠 두 칸에 세운다. 나머지는 한 칸. */
function splitPrescription(item) {
  const text = prescriptionText(item);
  const parts = text.split(" · ");
  return parts.length === 2 ? { load: parts[0], rx: parts[1] } : { load: "", rx: text };
}

export default function TodayPanel({
  userId,
  routine,
  stats = {},
  weightKg = 70,
  onOpenLog,
  onOpenPlan,
  onOpenGuide,
  onPlanChange,
}) {
  const schedule = routine.schedule;
  const [swapTarget, setSwapTarget] = useState(null);
  const [alternatives, setAlternatives] = useState([]);
  const [altState, setAltState] = useState("idle");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const iso = localToday();
  const todayIndex = useMemo(
    () => schedule.findIndex((_, index) => isoDate(routine.weekStart, index) === iso),
    [schedule, routine.weekStart, iso],
  );

  const today = todayIndex >= 0 ? schedule[todayIndex] : null;
  const daily = stats.daily ?? [];

  const toggleAlternatives = async (position, item) => {
    if (swapTarget?.position === position) {
      setSwapTarget(null);
      return;
    }
    if (!item.slug) return;

    setSwapTarget({ position, slug: item.slug, name: item.name });
    setAlternatives([]);
    setAltState("loading");

    try {
      const result = await api.exerciseAlternatives(item.slug, userId);
      setAlternatives(result.alternatives ?? []);
      setAltState("ready");
    } catch (err) {
      setError(`${err.message} 대체 운동을 불러오지 못했습니다.`);
      setAltState("error");
    }
  };

  const swapExercise = async (alternative) => {
    if (!swapTarget || !today) return;
    setIsBusy(true);
    setError("");

    try {
      const result = await api.swapExercise({
        userId,
        planId: routine.planId,
        day: today.day,
        position: swapTarget.position,
        slug: alternative.slug,
      });
      setMessage(`${result.message} 로 바꿨습니다.`);
      onPlanChange?.(result.schedule);
      setSwapTarget(null);
    } catch (err) {
      setError(`${err.message} 동작을 바꾸지 못했습니다.`);
    } finally {
      setIsBusy(false);
    }
  };

  const markMissed = async () => {
    if (!today) return;
    setIsBusy(true);
    setError("");

    try {
      const result = await api.reschedule({
        userId,
        planId: routine.planId,
        missedDay: today.day,
        completedDays: daily.filter((d) => d.workoutStatus === "done").map((d) => d.day ?? ""),
      });
      setMessage(result.message ?? "세션을 뒤로 옮겼습니다.");
      onPlanChange?.(result.schedule);
    } catch (err) {
      setError(`${err.message} 일정을 옮기지 못했습니다.`);
    } finally {
      setIsBusy(false);
    }
  };

  const weekNo = stats.weekNo ? ` · ${stats.weekNo}주차` : "";
  const dateLabel = today
    ? `${iso.replace(/-/g, ".")} ${today.day}요일${weekNo}`
    : `${iso.replace(/-/g, ".")}${weekNo}`;

  const items = today?.workout.items ?? [];
  const totalSets = items.reduce((total, item) => total + (item.sets ?? 0), 0);
  const plannedKcal = today ? plannedKcalOfDay(today, weightKg) : 0;

  const rate =
    stats.totalDays && stats.doneDays !== undefined
      ? `${Math.round((stats.doneDays / Math.max(stats.totalDays, 1)) * 100)}%`
      : "—";
  const volume = stats.volume ? `${(stats.volume / 1000).toFixed(1)}t` : "—";

  return (
    <section className="today-layout">
      <header className="page-head">
        <div>
          <span className="page-eyebrow">{dateLabel}</span>
          <h1>{today ? `오늘은 ${today.workout.focus}` : "오늘은 계획에 없습니다"}</h1>
        </div>
        <div className="page-actions">
          {today && !today.isRestDay && (
            <button
              type="button"
              className="secondary-button"
              onClick={markMissed}
              disabled={isBusy}
            >
              미수행 처리
            </button>
          )}
          <button
            type="button"
            className="primary-button"
            onClick={() =>
              today ? onOpenLog?.(isoDate(routine.weekStart, todayIndex)) : onOpenPlan?.()
            }
          >
            {today ? "세션 시작" : "주간 계획 보기"}
          </button>
        </div>
      </header>

      {error && <p className="form-error">{error}</p>}
      {message && <p className="today-message">{message}</p>}

      {!today && (
        <div className="panel empty-note">
          이번 주 계획에 오늘 날짜가 없습니다. 주간 계획에서 주차를 옮기거나 다음 주를 만들어
          주세요.
        </div>
      )}

      {today && (
        <>
          <div className="today-grid">
            <div className="today-card">
              <div className="today-card-head">
                <strong>
                  오늘 {items.length || today.workout.exercises.length}동작
                  {totalSets > 0 ? ` · ${totalSets}세트` : ""}
                </strong>
                <span className="today-badge">
                  {today.intensityLabel}
                  {plannedKcal > 0 ? ` · 예상 ${plannedKcal.toLocaleString()}kcal` : ""}
                </span>
              </div>

              {items.length > 0
                ? items.map((item, position) => {
                    const { load, rx } = splitPrescription(item);
                    const isOpen = swapTarget?.position === position;
                    const muscles = primaryMuscleText(item.slug);

                    return (
                      <div className="today-item" key={`${item.name}-${position}`}>
                        <div className="today-item-row">
                          <span className="today-item-main">
                            {item.slug ? (
                              <button
                                type="button"
                                className="ex-name link"
                                onClick={() => onOpenGuide?.(item.slug)}
                                title="운동 설명 보기"
                              >
                                {item.name}
                              </button>
                            ) : (
                              <strong className="ex-name">{item.name}</strong>
                            )}
                            <small>
                              {[muscles, item.equipment].filter(Boolean).join(" — ")}
                            </small>
                          </span>
                          <span className="today-item-load">{load}</span>
                          <span className="today-item-rx">{rx}</span>
                          {item.slug && (
                            <button
                              type="button"
                              className={isOpen ? "ex-swap open" : "ex-swap"}
                              onClick={() => toggleAlternatives(position, item)}
                            >
                              {isOpen ? "닫기" : "대체"}
                            </button>
                          )}
                        </div>

                        {isOpen && (
                          <div className="alt-panel">
                            <span className="today-alts-head">
                              {item.name} 대체 — 지정 대체 · 맨몸 · 보유 기구 순
                            </span>
                            {altState === "loading" && (
                              <p className="loading-state">대체 운동을 찾는 중입니다.</p>
                            )}
                            {altState === "ready" && alternatives.length === 0 && (
                              <p className="empty-note">대신할 만한 동작이 없습니다.</p>
                            )}
                            {alternatives.map((alternative) => (
                              <button
                                type="button"
                                className="alt-item"
                                key={alternative.slug}
                                onClick={() => swapExercise(alternative)}
                                disabled={isBusy}
                              >
                                <span className="alt-head">
                                  <strong>{alternative.name}</strong>
                                  <em
                                    className={
                                      alternative.isHome ? "tag home" : "tag gear"
                                    }
                                  >
                                    {alternative.equipment}
                                  </em>
                                </span>
                                <small className="alt-reason">
                                  {primaryMuscleText(alternative.slug) || alternative.muscle} —{" "}
                                  {alternative.reason}
                                </small>
                              </button>
                            ))}
                            <span className="today-alts-note">
                              고른 동작은 그 자리만 바뀌어 저장됩니다. 아픈 부위와 안전 제한은
                              대체 동작에도 그대로 적용됩니다.
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })
                : today.workout.exercises.map((exercise) => (
                    <div className="today-item" key={exercise}>
                      <div className="today-item-row">
                        <span className="today-item-main">
                          <strong className="ex-name">{exercise}</strong>
                        </span>
                      </div>
                    </div>
                  ))}

              {today.note && <p className="today-note">{today.note}</p>}
            </div>

            <div className="today-side">
              <div className="today-meal">
                <span className="today-meal-label">오늘 식단 목표</span>
                <strong className="today-meal-kcal">
                  {today.meal.calories.toLocaleString()}
                  <small>kcal</small>
                </strong>
                <div className="today-macros">
                  <span className="today-macro on">P {today.meal.protein}g</span>
                  <span className="today-macro">C {today.meal.carbs}g</span>
                  <span className="today-macro">F {today.meal.fat}g</span>
                </div>
                <span className="today-meal-menu">
                  아침 {today.meal.breakfast} / 점심 {today.meal.lunch} / 저녁{" "}
                  {today.meal.dinner}
                </span>
              </div>

              <div className="today-stats">
                <div className="today-stat">
                  <span>주간 수행률</span>
                  <strong>{rate}</strong>
                </div>
                <div className="today-stat">
                  <span>연속 기록</span>
                  <strong>{stats.streak ? `${stats.streak}일` : "—"}</strong>
                </div>
                <div className="today-stat">
                  <span>총 볼륨</span>
                  <strong>{volume}</strong>
                </div>
                <div className="today-stat">
                  <span>평균 RPE</span>
                  <strong>{stats.rpe ?? "—"}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="week-strip-wrap">
            <div className="week-strip-head">
              <strong>이번 주</strong>
              <span>누르면 그날 기록으로 이동합니다</span>
            </div>
            <div className="week-strip">
              {schedule.map((dayPlan, index) => {
                const date = isoDate(routine.weekStart, index);
                const log = daily.find((d) => d.date === date);
                const isToday = index === todayIndex;
                const muscles = musclesOf(dayPlan.workout.items);
                const classes = ["week-strip-item"];
                if (isToday) classes.push("today");
                else if (dayPlan.isRestDay) classes.push("rest");
                else classes.push(muscleClass(muscles[0]));

                return (
                  <button
                    type="button"
                    className={classes.join(" ")}
                    key={dayPlan.day}
                    onClick={() => onOpenLog?.(date)}
                  >
                    <span className="week-strip-day">
                      {dayPlan.day} {date.slice(8)}
                    </span>
                    <strong>{dayPlan.workout.focus}</strong>
                    <span className="week-strip-meta">
                      {log?.workoutStatus === "done"
                        ? "완료"
                        : isToday
                          ? `오늘${totalSets ? ` · ${totalSets}세트` : ""}`
                          : dayPlan.isRestDay
                            ? "가벼운 회복"
                            : (dayPlan.workout.items?.[0] &&
                                prescriptionText(dayPlan.workout.items[0])) || "계획"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
