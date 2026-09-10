import { useEffect, useMemo, useState } from "react";
import { DAYS, api, isoDate } from "../api";
import {
  muscleClass,
  musclesOf,
  prescriptionText,
  primaryMuscleText,
} from "../data/muscles";

const EVENT_TYPES = ["회식", "친구 약속", "가족 모임", "여행", "야근 후 야식"];
const CUISINES = [
  "한식(백반/찌개)",
  "고기·구이",
  "중식",
  "일식(초밥/돈카츠)",
  "양식(파스타/피자)",
  "치킨·야식",
  "뷔페",
];
const ALCOHOL_LEVELS = ["없음", "1~2잔", "3~5잔", "6잔 이상"];

export default function Dashboard({
  userProfile,
  userId,
  routine,
  onPlanChange,
  onPlanSwitch,
  onOpenLog,
  onOpenGuide,
  dataVersion = 0,
}) {
  const [weeks, setWeeks] = useState([]);
  const [weekBusy, setWeekBusy] = useState(false);
  const [weeklyPlan, setWeeklyPlan] = useState(routine.schedule);
  const [weekLogs, setWeekLogs] = useState([]);
  const [missedDays, setMissedDays] = useState([]);
  const [eventForm, setEventForm] = useState({
    day: "금",
    type: "회식",
    cuisine: "고기·구이",
    alcohol: "1~2잔",
  });
  const [tactics, setTactics] = useState([]);
  const [rebalance, setRebalance] = useState(null);
  const [notices, setNotices] = useState([]);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  // 대체 운동 패널: 지금 펼친 자리와 그 자리의 후보들.
  const [swapTarget, setSwapTarget] = useState(null);
  const [alternatives, setAlternatives] = useState([]);
  const [altState, setAltState] = useState("idle");

  useEffect(() => {
    const controller = new AbortController();

    const run = async () => {
      let list = [];
      let daily = [];
      try {
        const [plansResult, logsResult] = await Promise.all([
          api.plans(userId, controller.signal),
          api.logs(userId, routine.weekStart, controller.signal),
        ]);
        list = plansResult.plans ?? [];
        daily = logsResult.daily ?? [];
      } catch {
        // 목록이나 기록을 못 불러와도 이번 주 계획은 그대로 쓸 수 있다.
      }
      if (controller.signal.aborted) return;
      setWeeks(list);
      setWeekLogs(daily);
    };

    run();
    return () => controller.abort();
  }, [userId, routine.planId, routine.weekStart, dataVersion]);

  // 수행률은 로컬 토글이 아니라 실제 기록에서 계산한다.
  const completedDays = useMemo(() => {
    const done = new Set();
    for (const entry of weekLogs) {
      if (entry.workoutStatus === "done" || entry.workoutStatus === "partial") {
        const offset = Math.round(
          (new Date(`${entry.date}T00:00:00`) - new Date(`${routine.weekStart}T00:00:00`)) /
            86400000,
        );
        if (offset >= 0 && offset <= 6) done.add(DAYS[offset]);
      }
    }
    return [...done];
  }, [weekLogs, routine.weekStart]);

  // 목록은 최신 주가 먼저 오므로 뒤집어 이전/다음을 계산한다.
  const ordered = useMemo(() => [...weeks].reverse(), [weeks]);
  const currentIndex = ordered.findIndex((item) => item.planId === routine.planId);
  const prevWeek = currentIndex > 0 ? ordered[currentIndex - 1] : null;
  const nextWeek =
    currentIndex >= 0 && currentIndex < ordered.length - 1 ? ordered[currentIndex + 1] : null;
  const isLatestWeek = nextWeek === null;

  const switchWeek = async (planId) => {
    setWeekBusy(true);
    setError("");
    try {
      const result = await api.activatePlan(userId, planId);
      onPlanSwitch?.(result.plan);
    } catch (err) {
      setError(`${err.message} 주차를 바꾸지 못했습니다.`);
    } finally {
      setWeekBusy(false);
    }
  };

  const startNextWeek = async () => {
    setWeekBusy(true);
    setError("");
    try {
      const result = await api.regeneratePlan(userId, routine.weekStart, true);
      onPlanSwitch?.(result.plan);
      addNotice(
        `다음 주 계획을 만들었습니다 — ${result.adjustment.reasons[0] ?? "구성 유지"}`,
      );
    } catch (err) {
      setError(`${err.message} 다음 주 계획을 만들지 못했습니다.`);
    } finally {
      setWeekBusy(false);
    }
  };

  const weeklyNutrition = useMemo(
    () =>
      weeklyPlan.reduce(
        (acc, day) => ({
          calories: acc.calories + day.meal.calories,
          protein: acc.protein + day.meal.protein,
          carbs: acc.carbs + day.meal.carbs,
          fat: acc.fat + day.meal.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      ),
    [weeklyPlan],
  );

  const addNotice = (message) => {
    if (!message) return;
    setNotices((prev) => [message, ...prev].slice(0, 5));
  };

  // 가진 기구. 계획에 있는 동작이라도 그날 기구가 없을 수 있어 표시만 해 둔다.
  const ownedEquipment = useMemo(
    () => new Set(["맨몸", ...(userProfile?.equipment ?? [])]),
    [userProfile],
  );

  const toggleAlternatives = async (day, position, item) => {
    if (swapTarget && swapTarget.day === day && swapTarget.position === position) {
      setSwapTarget(null);
      return;
    }

    setSwapTarget({ day, position, slug: item.slug, name: item.name });
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
    if (!swapTarget) return;
    setIsBusy(true);
    setError("");

    try {
      const result = await api.swapExercise({
        userId,
        planId: routine.planId,
        day: swapTarget.day,
        position: swapTarget.position,
        slug: alternative.slug,
      });
      setWeeklyPlan(result.schedule);
      addNotice(`${result.message} 로 바꿨습니다.`);
      onPlanChange?.(result.schedule);
      setSwapTarget(null);
    } catch (err) {
      setError(`${err.message} 동작을 바꾸지 못했습니다.`);
    } finally {
      setIsBusy(false);
    }
  };

  const markMissed = async (day) => {
    setMissedDays((prev) => (prev.includes(day) ? prev : [...prev, day]));
    setIsBusy(true);
    setError("");

    try {
      const result = await api.reschedule({
        userId,
        planId: routine.planId,
        missedDay: day,
        completedDays,
      });
      setWeeklyPlan(result.schedule);
      addNotice(result.message);
      onPlanChange?.(result.schedule);
    } catch (err) {
      setMissedDays((prev) => prev.filter((item) => item !== day));
      setError(`${err.message} 재배치를 적용하지 못했습니다.`);
    } finally {
      setIsBusy(false);
    }
  };

  const registerEvent = async () => {
    const event = { ...eventForm };
    setIsBusy(true);
    setError("");

    try {
      const result = await api.diningOut({ userId, planId: routine.planId, event });
      setWeeklyPlan(result.schedule);
      setTactics(result.tactics);
      setRebalance(result.rebalance);
      addNotice(
        `${event.day}요일 ${event.type}(${event.cuisine}) 반영 — 초과 ${result.rebalance.surplus}kcal 중 ` +
          `${result.rebalance.applied ?? 0}kcal를 남은 요일에 분산했습니다.`,
      );
      onPlanChange?.(result.schedule);
    } catch (err) {
      setError(`${err.message} 가이드를 불러오지 못했습니다.`);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="dashboard-layout">
      <header className="page-head">
        <div>
          <span className="page-eyebrow">
            WEEK {ordered.length > 0 ? currentIndex + 1 : 1} · {routine.weekStart.slice(5)} –{" "}
            {isoDate(routine.weekStart, 6).slice(5)}
            {routine.split ? ` · ${routine.split}` : ""}
            {routine.bmi ? ` · BMI ${routine.bmi}` : ""}
          </span>
          <h1>주간 계획</h1>
        </div>

        <div className="page-actions" aria-label="주차 이동">
          <button
            type="button"
            className="secondary-button"
            onClick={() => prevWeek && switchWeek(prevWeek.planId)}
            disabled={!prevWeek || weekBusy}
          >
            ‹ 이전 주
          </button>

        {isLatestWeek ? (
          <button
            type="button"
            className="primary-button"
            onClick={startNextWeek}
            disabled={weekBusy}
          >
            {weekBusy ? "생성 중..." : "다음 주 시작 ›"}
          </button>
        ) : (
          <button
            type="button"
            className="secondary-button"
            onClick={() => nextWeek && switchWeek(nextWeek.planId)}
            disabled={weekBusy}
          >
            다음 주 ›
          </button>
        )}
        </div>
      </header>

      {error && <p className="form-error">{error}</p>}
      {isBusy && <p className="panel loading-state">주간 계획을 다시 계산하는 중입니다.</p>}

      <section className="panel notice-panel">
        <span className="page-eyebrow">ADJUSTMENT LOG · 조정 기록</span>
        <ul>
          {notices.length > 0 ? (
            notices.map((notice, index) => <li key={`${notice}-${index}`}>{notice}</li>)
          ) : (
            <li>이번 주에 자동 조정은 아직 없습니다.</li>
          )}
        </ul>
        <span className="notice-foot">
          미수행을 누르면 그날 세션을 이번 주 안에서 뒤로 밀어 재배치하고, 그 자리는 회복일이
          됩니다. 식단도 새 강도에 맞춰 다시 계산됩니다. 완료 기록은 그 날짜의 기록 탭으로
          이동하며, 저장해야 수행률과 리포트에 반영됩니다.
        </span>
      </section>


      <section className="panel">
        <div className="day-lines">
          {weeklyPlan.map((dayPlan, index) => {
            const muscles = musclesOf(dayPlan.workout.items);
            const date = isoDate(routine.weekStart, index);

            return (
              <article
                className={[
                  "day-line",
                  dayPlan.isRestDay && "rest",
                  // 그날의 첫 부위 색을 왼쪽 막대로 세운다. 부위 이름 태그는
                  // 그대로 두므로 색을 못 읽어도 정보가 사라지지 않는다.
                  muscles.length > 0 && muscleClass(muscles[0]),
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={dayPlan.day}
              >
                <div className="day-line-head">
                  <span className="day-letter">{dayPlan.day}</span>

                  <div className="day-line-title">
                    <h3>{dayPlan.workout.focus}</h3>
                    {muscles.length > 0 && (
                      <div className="muscle-row">
                        {muscles.map((muscle) => (
                          <em className={`tag ${muscleClass(muscle)}`} key={muscle}>
                            {muscle}
                          </em>
                        ))}
                      </div>
                    )}
                  </div>

                  <span className="day-line-meta">
                    <em className={`intensity ${dayPlan.intensity}`}>
                      {dayPlan.intensityLabel}
                    </em>
                    <small>{date.slice(5)}</small>
                  </span>
                </div>

                <ul className="ex-lines">
                  {dayPlan.workout.items?.length
                    ? dayPlan.workout.items.map((item, position) => {
                        const isOpen =
                          swapTarget?.day === dayPlan.day && swapTarget?.position === position;
                        const missingGear =
                          item.equipment && !ownedEquipment.has(item.equipment);

                        return (
                          <li key={`${item.name}-${position}`}>
                            <div className="ex-line">
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
                                <span className="ex-name">{item.name}</span>
                              )}
                              <span className="ex-num">{prescriptionText(item)}</span>
                            </div>

                            {primaryMuscleText(item.slug) && (
                              <p className="ex-muscles">
                                <span>자극</span>
                                {primaryMuscleText(item.slug)}
                              </p>
                            )}

                            {item.slug && (
                              <div className="ex-line-sub">
                                {item.equipment && (
                                  <em className={missingGear ? "tag gear missing" : "tag gear"}>
                                    {item.equipment}
                                    {missingGear && " 없음"}
                                  </em>
                                )}
                                <button
                                  type="button"
                                  className={isOpen ? "ex-swap open" : "ex-swap"}
                                  onClick={() => toggleAlternatives(dayPlan.day, position, item)}
                                  disabled={isBusy}
                                >
                                  {isOpen ? "닫기" : "기구 없어요 · 대체 운동"}
                                </button>
                              </div>
                            )}

                            {isOpen && (
                              <div className="alt-panel">
                                {altState === "loading" && (
                                  <p className="loading-state">대체 운동을 찾는 중입니다.</p>
                                )}

                                {altState === "ready" && alternatives.length === 0 && (
                                  <p className="empty-note">대신할 만한 동작이 없습니다.</p>
                                )}

                                {alternatives.map((alternative) => (
                                  <button
                                    type="button"
                                    key={alternative.slug}
                                    className="alt-item"
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
                                    {/* 부위와 고른 이유를 붙여 읽으므로, 부위 안의
                                        가운뎃점과 섞이지 않게 줄표로 나눈다. */}
                                    <small className="alt-reason">
                                      {primaryMuscleText(alternative.slug) ||
                                        alternative.muscle}{" "}
                                      — {alternative.reason}
                                    </small>
                                  </button>
                                ))}
                              </div>
                            )}
                          </li>
                        );
                      })
                    : dayPlan.workout.exercises.map((exercise) => (
                        <li key={exercise}>
                          <span className="ex-name">{exercise}</span>
                        </li>
                      ))}
                </ul>

                {dayPlan.note && <p className="plan-note">{dayPlan.note}</p>}

                <div className="meal-line">
                  <span className="meal-line-target">{dayPlan.meal.target}</span>
                  <span className="meal-line-macro">
                    {dayPlan.meal.calories.toLocaleString()}kcal · P{dayPlan.meal.protein} · C
                    {dayPlan.meal.carbs} · F{dayPlan.meal.fat}
                  </span>
                  <span className="meal-line-menu">
                    아침 {dayPlan.meal.breakfast} / 점심 {dayPlan.meal.lunch} / 저녁{" "}
                    {dayPlan.meal.dinner}
                  </span>
                  {dayPlan.meal.note && <span className="meal-note">{dayPlan.meal.note}</span>}
                </div>

                {!dayPlan.isRestDay && (
                  <div className="day-line-actions">
                    <button
                      type="button"
                      className={
                        completedDays.includes(dayPlan.day)
                          ? "line-button done"
                          : "line-button"
                      }
                      onClick={() => onOpenLog?.(date)}
                      disabled={isBusy}
                    >
                      {completedDays.includes(dayPlan.day) ? "기록됨" : "완료 기록"}
                    </button>
                    <button
                      type="button"
                      className={
                        missedDays.includes(dayPlan.day)
                          ? "line-button warning"
                          : "line-button"
                      }
                      onClick={() => markMissed(dayPlan.day)}
                      disabled={isBusy}
                    >
                      미수행
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>


      <div className="plan-bottom">
      <section className="panel control-grid">
        <div>
          <p className="eyebrow">Cheat Day Guide</p>
          <h2>치트데이 및 외식 대응</h2>
          <p>
            회식이나 약속 일정을 등록하면 실전 대처법과 함께 주간 식단 밸런스가 자동으로
            보정됩니다.
          </p>
        </div>

        <div className="event-controls">
          <select
            value={eventForm.day}
            aria-label="일정 요일"
            onChange={(e) => setEventForm((prev) => ({ ...prev, day: e.target.value }))}
          >
            {DAYS.map((day) => (
              <option value={day} key={day}>
                {day}요일
              </option>
            ))}
          </select>
          <select
            value={eventForm.type}
            aria-label="일정 종류"
            onChange={(e) => setEventForm((prev) => ({ ...prev, type: e.target.value }))}
          >
            {EVENT_TYPES.map((type) => (
              <option value={type} key={type}>
                {type}
              </option>
            ))}
          </select>
          <select
            value={eventForm.cuisine}
            aria-label="식사 종류"
            onChange={(e) => setEventForm((prev) => ({ ...prev, cuisine: e.target.value }))}
          >
            {CUISINES.map((cuisine) => (
              <option value={cuisine} key={cuisine}>
                {cuisine}
              </option>
            ))}
          </select>
          <select
            value={eventForm.alcohol}
            aria-label="음주량"
            onChange={(e) => setEventForm((prev) => ({ ...prev, alcohol: e.target.value }))}
          >
            {ALCOHOL_LEVELS.map((level) => (
              <option value={level} key={level}>
                음주 {level}
              </option>
            ))}
          </select>
          <button type="button" className="primary-button" onClick={registerEvent} disabled={isBusy}>
            가이드 받기
          </button>
        </div>

        {rebalance && (
          <div className="rebalance-summary">
            <article>
              <span>추정 초과</span>
              <strong>+{rebalance.surplus.toLocaleString()} kcal</strong>
            </article>
            <article>
              <span>자동 보정</span>
              <strong>-{(rebalance.applied ?? 0).toLocaleString()} kcal</strong>
            </article>
            <article>
              <span>보정 요일</span>
              <strong>{rebalance.days.length ? rebalance.days.join(", ") : "없음"}</strong>
            </article>
            <article>
              <span>다음 주 이월</span>
              <strong>{(rebalance.carryOver ?? 0).toLocaleString()} kcal</strong>
            </article>
          </div>
        )}

        {tactics.length > 0 && (
          <div className="tactics-grid">
            {tactics.map((phase) => (
              <article className="tactic-card" key={phase.phase}>
                <h3>{phase.phase}</h3>
                <ul>
                  {phase.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}

        <div className="nutrition-strip wide">
          <span>주간 {weeklyNutrition.calories.toLocaleString()} kcal</span>
          <span>단백질 {weeklyNutrition.protein.toLocaleString()}g</span>
          <span>탄수 {weeklyNutrition.carbs.toLocaleString()}g</span>
          <span>지방 {weeklyNutrition.fat.toLocaleString()}g</span>
        </div>
      </section>

      <section className="panel coaching-panel">
        <div>
          <p className="eyebrow">AI Coaching</p>
          <h2>주간 총량 보정 및 실전 가이드</h2>
        </div>
        <ul>
          {routine.coaching.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <div className="guide-grid">
          {routine.guide.map((item) => (
            <article key={item}>{item}</article>
          ))}
        </div>
      </section>
      </div>
    </section>
  );
}
