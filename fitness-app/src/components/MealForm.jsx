import { useEffect, useState } from "react";
import { api } from "../api";

const MEAL_TYPES = ["아침", "점심", "저녁", "간식"];

/**
 * 식단 입력.
 * 끼니 칸은 그대로 두고, 음식과 양은 한 칸에 자유롭게 적는다.
 * 입력이 멈추면 서버가 열량과 영양소를 추정해 미리 보여준다.
 */
export default function MealForm({ isBusy, onSave }) {
  const [mealType, setMealType] = useState("아침");
  const [text, setText] = useState("");
  const [estimate, setEstimate] = useState(null);
  const [isEstimating, setIsEstimating] = useState(false);

  // 타이핑이 멈춘 뒤에만 추정을 요청한다.
  useEffect(() => {
    const trimmed = text.trim();
    if (!trimmed) return undefined;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      let next = null;
      try {
        next = await api.estimateNutrition(trimmed, controller.signal);
      } catch (err) {
        if (err.name === "AbortError") return;
      }
      if (controller.signal.aborted) return;
      setEstimate(next);
      setIsEstimating(false);
    }, 450);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text]);

  const handleTextChange = (value) => {
    setText(value);
    if (value.trim()) {
      setIsEstimating(true);
    } else {
      setIsEstimating(false);
      setEstimate(null);
    }
  };

  const submit = async () => {
    const ok = await onSave({ mealType, description: text.trim() });
    if (ok) {
      setText("");
      setEstimate(null);
    }
  };

  const total = estimate?.total;

  return (
    <div className="meal-input">
      <div className="meal-type-row">
        {MEAL_TYPES.map((type) => (
          <button
            type="button"
            key={type}
            className={mealType === type ? "meal-chip selected" : "meal-chip"}
            onClick={() => setMealType(type)}
          >
            {type}
          </button>
        ))}
      </div>

      <textarea
        className="meal-textarea"
        rows={2}
        value={text}
        onChange={(event) => handleTextChange(event.target.value)}
        placeholder="먹은 음식과 양을 적으세요 — 예: 현미밥 1공기, 닭가슴살 200g, 김치 50g"
      />

      {isEstimating && <p className="estimate-status">영양소를 계산하는 중입니다.</p>}

      {estimate && !isEstimating && (
        <div className="estimate-box">
          {estimate.items.length > 0 && (
            <>
              <ul className="estimate-items">
                {estimate.items.map((item, index) => (
                  <li key={`${item.name}-${index}`}>
                    <span>
                      {item.name} {item.amount}
                      {item.unit} ({item.grams}g)
                    </span>
                    <strong>
                      {item.calories}kcal · P{item.protein}
                    </strong>
                  </li>
                ))}
              </ul>
              <div className="estimate-total">
                <strong>합계 {total.calories.toLocaleString()} kcal</strong>
                <span>
                  단백질 {total.protein}g · 탄수 {total.carbs}g · 지방 {total.fat}g
                </span>
              </div>
            </>
          )}

          {estimate.unmatched.length > 0 && (
            <p className="estimate-warn">
              못 알아본 항목: {estimate.unmatched.join(", ")}
            </p>
          )}

          <p className="estimate-note">{estimate.note}</p>
        </div>
      )}

      <button
        type="button"
        className="primary-button"
        onClick={submit}
        disabled={isBusy || !text.trim()}
      >
        {mealType} 기록 추가
      </button>
    </div>
  );
}
