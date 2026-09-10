import { useMemo } from "react";
import { toIso } from "../api";
import { muscleClass } from "../data/muscles";

/** 좁은 셀에 들어가도록 계획명을 줄인다. "푸시(가슴/어깨)" → "푸시" */
function shortFocus(focus) {
  const bare = (focus ?? "").split("(")[0].trim();
  return bare.length > 5 ? `${bare.slice(0, 5)}…` : bare;
}

const STATUS_LABEL = {
  done: "완료",
  partial: "부분",
  missed: "미수행",
};

/**
 * 월 단위 달력.
 * 셀 하나에 그날의 계획(포커스), 운동 부위, 섭취/소모 열량까지 담는다.
 * 별도의 요일별 표를 두지 않고 이 달력만 보면 한 주가 읽히도록 한다.
 */
export default function LogCalendar({
  monthAnchor,
  selectedDate,
  weekStart,
  weekEnd,
  dailyByDate,
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
        {["월", "화", "수", "목", "금", "토", "일"].map((day) => (
          <span key={day} className="calendar-weekday">
            {day}
          </span>
        ))}
      </div>

      <div className="calendar-grid">
        {cells.map((cell) => {
          const entry = dailyByDate[cell.iso];
          const inPlanWeek = cell.iso >= weekStart && cell.iso <= weekEnd;
          const intake = entry?.intake?.calories ?? 0;
          const muscles = entry?.muscles ?? [];

          const classes = ["calendar-cell"];
          if (!cell.inMonth) classes.push("outside");
          if (cell.iso === selectedDate) classes.push("selected");
          if (cell.iso === today) classes.push("today");
          if (inPlanWeek) classes.push("plan-week");
          if (entry?.isRestDay) classes.push("rest");

          return (
            <button
              type="button"
              key={cell.iso}
              className={classes.join(" ")}
              onClick={() => onSelect(cell.iso)}
            >
              <span className="cell-top">
                <span className="calendar-day">{cell.dayNumber}</span>
                {entry?.workoutStatus && (
                  <em className={`cell-status ${entry.workoutStatus}`}>
                    {STATUS_LABEL[entry.workoutStatus]}
                  </em>
                )}
              </span>

              {entry?.planned && (
                <span className="cell-focus" title={entry.planned}>
                  {entry.isRestDay ? "휴식" : shortFocus(entry.planned)}
                </span>
              )}

              {muscles.length > 0 && (
                <span className="cell-muscles">
                  {muscles.slice(0, 3).map((muscle) => (
                    <em
                      key={muscle}
                      className={`cell-muscle ${muscleClass(muscle)}`}
                      title={muscle}
                    >
                      {muscle}
                    </em>
                  ))}
                  {muscles.length > 3 && (
                    <em className="cell-muscle more" title={muscles.join(", ")}>
                      +{muscles.length - 3}
                    </em>
                  )}
                </span>
              )}

              {(intake > 0 || entry?.burnedKcal > 0) && (
                <span className="cell-energy">
                  {intake > 0 && <em className="in">{intake.toLocaleString()}</em>}
                  {entry?.burnedKcal > 0 && (
                    <em className="out">−{entry.burnedKcal.toLocaleString()}</em>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="calendar-legend">
        <span>
          <em className="cell-muscle m-chest">가슴</em> 운동 부위
        </span>
        <span>
          <em className="legend-in">숫자</em> 섭취 kcal
        </span>
        <span>
          <em className="legend-out">−숫자</em> 소모 kcal
        </span>
        <span className="legend-week">테두리 = 이번 계획 주</span>
      </div>
    </div>
  );
}
