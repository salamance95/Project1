import { useEffect, useMemo, useState } from "react";
import { DAYS, addDays, api, dayIndexOf, isoDate, toIso } from "../api";
import LogCalendar from "./LogCalendar";
import { muscleClass } from "../muscles";
import MealForm from "./MealForm";

// 백엔드 energy.py 와 같은 값. 입력 중에도 추가 소모를 바로 보여주기 위해 함께 둔다.
const MET_BY_INTENSITY = { high: 6.0, moderate: 5.0, low: 3.8, rest: 2.5 };
const MINUTES_PER_SET = 3.0;

const STATUSES = [
  { value: "done", label: "완료" },
  { value: "partial", label: "부분 수행" },
  { value: "missed", label: "미수행" },
];

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstOfMonth(iso) {
  const date = new Date(`${iso}T00:00:00`);
  return toIso(new Date(date.getFullYear(), date.getMonth(), 1));
}

/** 운동/식단 기록 폼이 각자 갖는 요일 선택기. 둘 다 같은 날짜 상태를 본다. */
function DayPicker({ id, label, weekStart, value, onChange }) {
  const options = DAYS.map((day, index) => {
    const iso = isoDate(weekStart, index);
    return { iso, label: `${day}요일 · ${iso.slice(5)}` };
  });

  const outside = !options.some((option) => option.iso === value);

  return (
    <label className="day-picker" htmlFor={id}>
      {label}
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {outside && <option value={value}>{value} (계획 주 밖)</option>}
        {options.map((option) => (
          <option key={option.iso} value={option.iso}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function LogPanel({ userId, plan, onLogged, initialDate, weightKg = 70 }) {
  const weekStart = plan.weekStart;
  const weekEnd = addDays(weekStart, 6);

  const [selectedDate, setSelectedDate] = useState(() => {
    if (initialDate) return initialDate;
    const today = toIso(new Date());
    return today >= weekStart && today <= weekEnd ? today : weekStart;
  });
  const [monthAnchor, setMonthAnchor] = useState(() => firstOfMonth(weekStart));
  const [logs, setLogs] = useState({ workouts: [], meals: [] });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // 달력에 표시할 범위. 달 경계에 걸친 주까지 덮도록 넉넉히 잡는다.
  const rangeStart = addDays(monthAnchor, -7);
  const rangeEnd = addDays(monthAnchor, 45);

  useEffect(() => {
    const controller = new AbortController();

    const run = async () => {
      let next = { workouts: [], meals: [] };
      let nextError = "";

      try {
        next = await api.logsRange(userId, rangeStart, rangeEnd, controller.signal);
      } catch (err) {
        if (err.name === "AbortError") return;
        nextError = err.message;
      }

      if (controller.signal.aborted) return;
      setLogs(next);
      setError(nextError);
    };

    run();
    return () => controller.abort();
  }, [userId, rangeStart, rangeEnd, reloadToken]);

  const dailyByDate = useMemo(() => {
    const map = {};
    for (const item of logs.daily ?? []) map[item.date] = item;
    return map;
  }, [logs.daily]);

  const todaySummary = dailyByDate[selectedDate] ?? null;

  const workoutsByDate = useMemo(() => {
    const map = {};
    for (const item of logs.workouts) map[item.date] = item.status;
    return map;
  }, [logs.workouts]);

  const mealCountByDate = useMemo(() => {
    const map = {};
    for (const item of logs.meals) map[item.date] = (map[item.date] ?? 0) + 1;
    return map;
  }, [logs.meals]);

  const existingWorkout = useMemo(
    () => logs.workouts.find((item) => item.date === selectedDate) ?? null,
    [logs.workouts, selectedDate],
  );

  const dayMeals = useMemo(
    () => logs.meals.filter((meal) => meal.date === selectedDate),
    [logs.meals, selectedDate],
  );

  const mealTotals = useMemo(
    () =>
      dayMeals.reduce(
        (acc, meal) => ({
          calories: acc.calories + meal.calories,
          protein: acc.protein + meal.protein,
          carbs: acc.carbs + meal.carbs,
          fat: acc.fat + meal.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      ),
    [dayMeals],
  );

  // 계획 주 안의 날짜에만 그날 계획이 있다.
  const inPlanWeek = selectedDate >= weekStart && selectedDate <= weekEnd;
  const dayPlan = inPlanWeek ? plan.schedule[dayIndexOf(selectedDate)] : null;

  const pickDate = (iso) => {
    setSelectedDate(iso);
    setMessage("");
    if (firstOfMonth(iso) !== monthAnchor) setMonthAnchor(firstOfMonth(iso));
  };

  const saveWorkout = async (form) => {
    setIsBusy(true);
    setError("");
    setMessage("");

    try {
      await api.logWorkout({
        userId,
        date: selectedDate,
        status: form.status,
        durationMin: form.durationMin === "" ? null : toNumber(form.durationMin),
        rpe: form.rpe === "" ? null : toNumber(form.rpe),
        note: form.note || null,
        sets: form.sets
          .filter((entry) => entry.exerciseName && toNumber(entry.sets) > 0)
          .map((entry) => ({
            exerciseName: entry.exerciseName,
            sets: toNumber(entry.sets),
            weightKg: toNumber(entry.weightKg),
            reps: toNumber(entry.reps),
          })),
      });
      setMessage(`${selectedDate} 운동 기록을 저장했습니다.`);
      setReloadToken((prev) => prev + 1);
      onLogged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsBusy(false);
    }
  };

  const saveMeal = async ({ mealType, description }) => {
    setIsBusy(true);
    setError("");
    setMessage("");

    try {
      // 열량을 비워 보내면 서버가 먹은 음식 텍스트에서 추정해 채운다.
      const result = await api.logMeal({
        userId,
        date: selectedDate,
        mealType,
        description,
      });
      setMessage(
        `${selectedDate} ${mealType} 기록 추가 — ${result.calories.toLocaleString()}kcal, ` +
          `단백질 ${result.protein}g`,
      );
      setReloadToken((prev) => prev + 1);
      onLogged?.();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  const removeMeal = async (logId) => {
    setIsBusy(true);
    try {
      await api.deleteMeal(userId, logId);
      setReloadToken((prev) => prev + 1);
      onLogged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="log-layout">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Daily Log</p>
            <h2>기록 달력</h2>
            <p>날짜를 눌러 기록할 날을 고르세요. 기록한 값이 주간 리포트의 근거가 됩니다.</p>
          </div>
        </div>

        <LogCalendar
          monthAnchor={monthAnchor}
          selectedDate={selectedDate}
          weekStart={weekStart}
          weekEnd={weekEnd}
          workoutsByDate={workoutsByDate}
          mealCountByDate={mealCountByDate}
          onSelect={pickDate}
          onMonthChange={setMonthAnchor}
        />

        {todaySummary?.muscles?.length > 0 && (
          <p className="trained-muscles">
            <span>이날 한 부위</span>
            {todaySummary.muscles.map((muscle) => (
              <em className="tag muscle" key={muscle}>
                {muscle}
              </em>
            ))}
          </p>
        )}

        <p className="log-date">
          {selectedDate} ({DAYS[dayIndexOf(selectedDate)]}) ·{" "}
          {dayPlan ? dayPlan.workout.focus : "이 주 계획에 없는 날"}
          {dayPlan && (
            <em className={`intensity ${dayPlan.intensity}`}>{dayPlan.intensityLabel}</em>
          )}
        </p>

        {(todaySummary || dayPlan) && (
          <div className="day-energy">
            <article>
              <span>흡수한 칼로리</span>
              <strong>{mealTotals.calories.toLocaleString()} kcal</strong>
              {dayPlan && <small>목표 {dayPlan.meal.calories.toLocaleString()}</small>}
            </article>
            <article>
              <span>태운 칼로리</span>
              <strong>{(todaySummary?.burnedKcal ?? 0).toLocaleString()} kcal</strong>
              <small>
                {todaySummary?.durationMin
                  ? `${todaySummary.durationMin}분 기준`
                  : todaySummary?.workoutStatus
                    ? "기본 시간으로 추정"
                    : "운동 기록 없음"}
              </small>
              {todaySummary?.extraSets > 0 && (
                <small className="extra-inline">
                  {todaySummary.extraIncluded
                    ? `+${todaySummary.extraKcal}kcal (초과 ${todaySummary.extraSets}세트)`
                    : `초과 ${todaySummary.extraSets}세트는 소요 시간에 포함`}
                </small>
              )}
            </article>
            <article>
              <span>단백질</span>
              <strong>{mealTotals.protein}g</strong>
              {dayPlan && <small>목표 {dayPlan.meal.protein}g</small>}
            </article>
            <article>
              <span>순 섭취</span>
              <strong>
                {(mealTotals.calories - (todaySummary?.burnedKcal ?? 0)).toLocaleString()} kcal
              </strong>
              <small>흡수 − 소모</small>
            </article>
          </div>
        )}

        {dayPlan && (
          <div className="macro-progress">
            {[
              ["칼로리", mealTotals.calories, dayPlan.meal.calories, "kcal"],
              ["단백질", mealTotals.protein, dayPlan.meal.protein, "g"],
              ["탄수화물", mealTotals.carbs, dayPlan.meal.carbs, "g"],
              ["지방", mealTotals.fat, dayPlan.meal.fat, "g"],
            ].map(([label, actual, target, unit]) => {
              const rate = target ? Math.round((actual / target) * 100) : 0;
              const tone = rate >= 115 ? "over" : rate >= 85 ? "good" : "under";
              return (
                <div className="macro-row" key={label}>
                  <div className="macro-head">
                    <span>{label}</span>
                    <strong>
                      {actual.toLocaleString()} / {target.toLocaleString()}
                      {unit} <em className={`rate ${tone}`}>{rate}%</em>
                    </strong>
                  </div>
                  <div className="report-bar-track">
                    <div
                      className={`report-bar-fill ${tone}`}
                      style={{ width: `${Math.min(rate, 130)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>이번 주 요일별 기록</h2>
            <p>완료한 운동, 먹은 것, 흡수·소모 칼로리와 단백질을 한눈에 봅니다.</p>
          </div>
        </div>

        <div className="week-lines">
          {DAYS.map((dayName, index) => {
            const iso = isoDate(weekStart, index);
            const entry = dailyByDate[iso];
            const planDay = plan.schedule[index];
            const intake = entry?.intake ?? { calories: 0, protein: 0 };
            const logged = Boolean(entry?.workoutStatus || entry?.meals?.length);

            return (
              <button
                type="button"
                key={iso}
                className={[
                  "week-line",
                  iso === selectedDate ? "selected" : "",
                  logged ? "" : "quiet",
                ].join(" ")}
                onClick={() => pickDate(iso)}
              >
                <span className="week-line-day">{dayName}</span>

                <span className="week-line-main">
                  <span className="week-line-top">
                    <strong>{planDay.workout.focus}</strong>
                    {entry?.workoutStatus === "done" && <em className="dot done">완료</em>}
                    {entry?.workoutStatus === "partial" && <em className="dot partial">부분</em>}
                    {entry?.workoutStatus === "missed" && <em className="dot missed">미수행</em>}
                  </span>

                  {entry?.muscles?.length > 0 && (
                    <span className="muscle-row">
                      {entry.muscles.map((muscle) => (
                        <em className={`tag ${muscleClass(muscle)}`} key={muscle}>
                          {muscle}
                        </em>
                      ))}
                    </span>
                  )}

                  {entry?.meals?.length > 0 && (
                    <small className="week-line-meal">
                      {entry.meals.map((meal) => meal.description).join(" / ")}
                    </small>
                  )}
                </span>

                <span className="week-line-num">
                  <span className="in">+{intake.calories.toLocaleString()}</span>
                  <span className="out">−{(entry?.burnedKcal ?? 0).toLocaleString()}</span>
                  <small>
                    P {intake.protein}/{planDay.meal.protein}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {message && <p className="log-message">{message}</p>}
      {error && <p className="form-error">{error}</p>}

      <WorkoutForm
        key={`${selectedDate}-${existingWorkout?.id ?? "new"}`}
        dayPlan={dayPlan}
        existing={existingWorkout}
        isBusy={isBusy}
        weekStart={weekStart}
        selectedDate={selectedDate}
        weightKg={weightKg}
        onDateChange={pickDate}
        onSave={saveWorkout}
      />

      <section className="panel log-form">
        <h3>식단 기록</h3>

        <DayPicker
          id="meal-day"
          label="기록할 요일"
          weekStart={weekStart}
          value={selectedDate}
          onChange={pickDate}
        />

        <MealForm isBusy={isBusy} onSave={saveMeal} />

        <ul className="meal-log-list">
          {dayMeals.length === 0 && <li className="empty-note">아직 기록이 없습니다.</li>}
          {dayMeals.map((meal) => (
            <li key={meal.id}>
              <span className="meal-type">{meal.mealType}</span>
              <span className="meal-desc-text">{meal.description || "-"}</span>
              <span className="meal-macros">
                {meal.calories}kcal · P{meal.protein} C{meal.carbs} F{meal.fat}
              </span>
              <button type="button" className="icon-button" onClick={() => removeMeal(meal.id)}>
                삭제
              </button>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}

/**
 * 운동 기록 폼.
 * 날짜가 바뀌면 부모가 key를 갈아끼워 다시 마운트하므로,
 * props에서 초기값을 만드는 useState 초기화만으로 충분하다.
 */
function WorkoutForm({
  dayPlan,
  existing,
  isBusy,
  weekStart,
  selectedDate,
  weightKg,
  onDateChange,
  onSave,
}) {
  const [status, setStatus] = useState(existing?.status ?? "done");
  const [durationMin, setDurationMin] = useState(existing?.durationMin ?? "");
  const [rpe, setRpe] = useState(existing?.rpe ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [sets, setSets] = useState(() => {
    if (existing) {
      // 저장된 기록은 서버가 운동 단위로 합쳐서 돌려준다.
      const plannedNames = new Set(
        (dayPlan?.workout.items ?? []).map((item) =>
          item.muscle ? `${item.name}(${item.muscle})` : item.name,
        ),
      );
      return (existing.exercises ?? []).map((entry) => ({
        exerciseName: entry.exerciseName,
        sets: entry.sets,
        weightKg: entry.weightKg,
        reps: entry.reps,
        planned: plannedNames.has(entry.exerciseName),
      }));
    }

    // 기록이 없으면 계획된 운동을 추천 수치와 함께 한 줄씩 채운다.
    return (dayPlan?.workout.items ?? []).map((item) => ({
      exerciseName: item.muscle ? `${item.name}(${item.muscle})` : item.name,
      sets: item.sets ?? 3,
      weightKg: item.recommendedWeight ?? "",
      reps: item.reps ?? "",
      planned: true,
    }));
  });

  const updateSet = (index, field, value) => {
    setSets((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry)),
    );
  };

  // 계획에 없던 운동을 직접 추가한다.
  const addExerciseRow = () => {
    setSets((prev) => [
      ...prev,
      { exerciseName: "", sets: 3, weightKg: "", reps: 10, planned: false },
    ]);
  };

  // 계획된 운동은 지울 수 없다. 안 했다면 세트를 0으로 두면 된다.
  const removeExerciseRow = (index) =>
    setSets((prev) => prev.filter((entry, i) => i !== index || entry.planned));

  const plannedSets = (dayPlan?.workout.items ?? []).reduce(
    (total, item) => total + (item.sets ?? 0),
    0,
  );
  const loggedSets = sets.reduce((total, entry) => total + (Number(entry.sets) || 0), 0);
  const extraSets = Math.max(loggedSets - plannedSets, 0);
  const met = MET_BY_INTENSITY[dayPlan?.intensity] ?? MET_BY_INTENSITY.moderate;
  const extraKcal = Math.round(met * weightKg * ((extraSets * MINUTES_PER_SET) / 60));

  return (
    <section className="panel log-form">
      <h3>운동 기록{existing && <span className="saved-badge">저장됨</span>}</h3>

      <DayPicker
        id="workout-day"
        label="기록할 요일"
        weekStart={weekStart}
        value={selectedDate}
        onChange={onDateChange}
      />

      <div className="log-controls">
        <label>
          수행 상태
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          소요 시간(분)
          <input
            type="number"
            min="0"
            value={durationMin}
            onChange={(e) => setDurationMin(e.target.value)}
          />
        </label>
        <label>
          체감 강도(RPE 1~10)
          <input
            type="number"
            min="1"
            max="10"
            value={rpe}
            onChange={(e) => setRpe(e.target.value)}
          />
        </label>
      </div>

      <div className="set-table">
        <div className="set-row header">
          <span>운동</span>
          <span>세트</span>
          <span>무게(kg)</span>
          <span>횟수</span>
          <span />
        </div>

        {sets.length === 0 && <p className="empty-note">이 날짜에는 계획된 운동이 없습니다.</p>}
        {sets.length > 0 && !existing && (
          <p className="prefill-note">
            추천 수치가 미리 채워져 있습니다. 실제로 한 세트·무게·횟수로 고쳐 저장하세요.
          </p>
        )}

        {sets.map((entry, index) => (
          <div className={entry.planned ? "set-row planned" : "set-row"} key={index}>
            <input
              className="set-name"
              aria-label="운동 이름"
              value={entry.exerciseName}
              onChange={(e) => updateSet(index, "exerciseName", e.target.value)}
              placeholder="운동 이름"
            />
            <input
              type="number"
              min="0"
              aria-label="세트 수"
              placeholder="세트"
              value={entry.sets}
              onChange={(e) => updateSet(index, "sets", e.target.value)}
            />
            <input
              type="number"
              min="0"
              step="0.5"
              aria-label="무게(kg)"
              placeholder="kg"
              value={entry.weightKg}
              onChange={(e) => updateSet(index, "weightKg", e.target.value)}
            />
            <input
              type="number"
              min="0"
              aria-label="횟수"
              placeholder="횟수"
              value={entry.reps}
              onChange={(e) => updateSet(index, "reps", e.target.value)}
            />
            {entry.planned ? (
              <span className="planned-tag" title="계획된 운동은 지울 수 없습니다">
                계획
              </span>
            ) : (
              <button
                type="button"
                className="icon-button"
                onClick={() => removeExerciseRow(index)}
              >
                삭제
              </button>
            )}
          </div>
        ))}

        {plannedSets > 0 && (
          <p className={extraSets > 0 ? "extra-note active" : "extra-note"}>
            계획 {plannedSets}세트 / 기록 {loggedSets}세트
            {extraSets > 0 && (
              <>
                {" "}
                — <strong>{extraSets}세트 더 함</strong>
                <span className="extra-kcal">추가 소모 약 {extraKcal}kcal</span>
              </>
            )}
          </p>
        )}
      </div>

      <div className="log-actions">
        <button type="button" className="secondary-button" onClick={addExerciseRow}>
          운동 추가
        </button>
        <input
          className="note-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="메모 (선택)"
        />
        <button
          type="button"
          className="primary-button"
          disabled={isBusy}
          onClick={() => onSave({ status, durationMin, rpe, note, sets })}
        >
          운동 기록 저장
        </button>
      </div>
    </section>
  );
}
