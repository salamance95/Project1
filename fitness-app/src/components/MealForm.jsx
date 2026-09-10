import { useEffect, useRef, useState } from "react";
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
  const [photo, setPhoto] = useState(null);
  const [photoStatus, setPhotoStatus] = useState(null);
  const [isReading, setIsReading] = useState(false);
  const fileRef = useRef(null);
  // 사진이 채워 넣은 문장과 그때의 추정치. 문장을 손대면 다시 계산한다.
  const photoResult = useRef(null);

  // 타이핑이 멈춘 뒤에만 추정을 요청한다.
  useEffect(() => {
    const trimmed = text.trim();
    if (!trimmed) return undefined;

    // 사진이 읽어준 문장을 아직 고치지 않았다면 사진 쪽 추정치가 더 정확하다.
    // (음식 DB에 없는 음식은 텍스트로 다시 계산하면 0kcal이 된다.)
    if (photoResult.current && photoResult.current.text === trimmed) {
      setEstimate(photoResult.current.estimate);
      setIsEstimating(false);
      return undefined;
    }

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

  const readPhoto = async (file) => {
    if (!file) return;

    setPhoto({ name: file.name, url: URL.createObjectURL(file) });
    setPhotoStatus(null);
    setIsReading(true);

    try {
      const result = await api.analyzeMealPhoto(file);

      if (result.available && result.text) {
        // 인식 결과를 입력칸에 채워 넣고, 사용자가 고칠 수 있게 둔다.
        photoResult.current = { text: result.text.trim(), estimate: result.estimate };
        handleTextChange(result.text);
        setPhotoStatus({
          kind: "ok",
          message: `${result.model}이(가) 읽었습니다. 틀린 부분은 고쳐주세요.`,
          confidence: result.confidence,
        });
      } else {
        setPhotoStatus({
          kind: "warn",
          message: result.reason || result.note || "사진에서 음식을 찾지 못했습니다.",
        });
      }
    } catch (err) {
      setPhotoStatus({ kind: "warn", message: err.message });
    } finally {
      setIsReading(false);
    }
  };

  const clearPhoto = () => {
    if (photo?.url) URL.revokeObjectURL(photo.url);
    setPhoto(null);
    setPhotoStatus(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async () => {
    // 추정치를 같이 보낸다. 안 보내면 서버가 음식 DB로만 다시 계산해서
    // AI가 어림한 음식이 0kcal로 빠진다.
    const ok = await onSave({
      mealType,
      description: text.trim(),
      ...(estimate?.total ?? {}),
    });
    if (ok) {
      setText("");
      setEstimate(null);
      photoResult.current = null;
      clearPhoto();
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

      <div className="photo-row">
        <button
          type="button"
          className="secondary-button photo-button"
          onClick={() => fileRef.current?.click()}
          disabled={isReading || isBusy}
        >
          {isReading ? "사진 읽는 중..." : "사진으로 입력"}
        </button>
        <input
          ref={fileRef}
          className="photo-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={(event) => readPhoto(event.target.files?.[0])}
        />
        {photo && (
          <button type="button" className="icon-button" onClick={clearPhoto}>
            사진 지우기
          </button>
        )}
      </div>

      {photo && (
        <div className="photo-preview">
          <img src={photo.url} alt="올린 식사 사진" />
          {photoStatus && (
            <p className={`photo-status ${photoStatus.kind}`}>
              {photoStatus.message}
              {photoStatus.confidence === "low" && " (확신 낮음)"}
            </p>
          )}
        </div>
      )}

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
                      {item.source === "ai" && <em className="ai-tag">AI 추정</em>}
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
