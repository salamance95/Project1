import { useMemo } from "react";
import { toIso } from "../api";

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

const STATUS_MARK = {
  done: "done",
  partial: "partial",
  missed: "missed",
};

/** 월 단위 달력. 날짜를 눌러 기록할 날을 고른다. */
export default function LogCalendar({
  monthAnchor,
  selectedDate,
  weekStart,
  weekEnd,
  workoutsByDate,
  mealCountByDate,
  onSelect,
  onMonthChange,
}) {
  const anchor = new Date(`${monthAnchor}T00:00:00`);
  const year = anchor.getFullYear();
  const month = anchor.getMonth();

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    // 월요일 시작으로 맞춘다.
    const lead = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - lead);

    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return {
        iso: toIso(day),
        dayNumber: day.getDate(),
        inMonth: day.getMonth() === month,
      };
    });
  }, [year, month]);

  const today = toIso(new Date());

  return (
    <div className="calendar">
      <div className="calendar-head">
        <button
          type="button"
          className="calendar-nav"
          onClick={() => onMonthChange(toIso(new Date(year, month - 1, 1)))}
          aria-label="이전 달"
        >
          ‹
        </button>
        <strong>
          {year}년 {month + 1}월
        </strong>
        <button
          type="button"
          className="calendar-nav"
          onClick={() => onMonthChange(toIso(new Date(year, month + 1, 1)))}
          aria-label="다음 달"
        >
          ›
        </button>
      </div>

      <div className="calendar-grid weekday-row">
        {WEEKDAYS.map((day) => (
          <span key={day} className="calendar-weekday">
            {day}
          </span>
        ))}
      </div>

      <div className="calendar-grid">
        {cells.map((cell) => {
          const status = workoutsByDate[cell.iso];
          const meals = mealCountByDate[cell.iso] ?? 0;
          const inPlanWeek = cell.iso >= weekStart && cell.iso <= weekEnd;

          const classes = ["calendar-cell"];
          if (!cell.inMonth) classes.push("outside");
          if (cell.iso === selectedDate) classes.push("selected");
          if (cell.iso === today) classes.push("today");
          if (inPlanWeek) classes.push("plan-week");

          return (
            <button
              type="button"
              key={cell.iso}
              className={classes.join(" ")}
              onClick={() => onSelect(cell.iso)}
            >
              <span className="calendar-day">{cell.dayNumber}</span>
              <span className="calendar-marks">
                {status && <em className={`mark ${STATUS_MARK[status] ?? "done"}`} />}
                {meals > 0 && <em className="mark meal" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="calendar-legend">
        <span>
          <em className="mark done" /> 운동 완료
        </span>
        <span>
          <em className="mark missed" /> 미수행
        </span>
        <span>
          <em className="mark meal" /> 식단 기록
        </span>
        <span className="legend-week">테두리 = 이번 계획 주</span>
      </div>
    </div>
  );
}
