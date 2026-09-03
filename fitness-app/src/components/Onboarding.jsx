import { useEffect, useMemo, useState } from "react";
import { api, storage } from "../api";
import "./Onboarding.css";

const FALLBACK_EQUIPMENT = [
  "맨몸",
  "덤벨",
  "바벨/랙",
  "머신/케이블",
  "철봉",
  "밴드",
  "유산소 장비",
];

const FALLBACK_RED_FLAGS = [
  "해당 없음",
  "운동 중 흉통이나 호흡 곤란을 겪은 적이 있다",
  "심장 질환 또는 고혈압으로 약을 복용 중이다",
  "임신 중이거나 출산 후 6주 이내다",
  "최근 3개월 안에 수술이나 골절이 있었다",
  "어지럼증이나 실신을 경험한 적이 있다",
  "쉬고 있을 때도 통증이 계속된다",
];

const BASE_STEPS = [
  {
    id: "body",
    type: "body",
    title: "기본 신체 정보를 알려주세요.",
    subtitle: "하루 목표 열량과 단백질량 계산에만 사용합니다.",
  },
  {
    id: "goal",
    title: "가장 중요한 운동 목표는 무엇인가요?",
    options: [
      { value: "체중 감량", label: "체중 감량" },
      { value: "근육량 증가", label: "근육량 증가" },
      { value: "기초 체력 향상", label: "기초 체력 향상" },
      { value: "자세 교정 및 코어 강화", label: "자세 교정 및 코어 강화" },
    ],
  },
  {
    id: "level",
    title: "현재 운동 경력은 어느 정도인가요?",
    options: [
      { value: "입문", label: "입문", desc: "1개월 미만" },
      { value: "초보", label: "초보", desc: "1개월 이상 6개월 미만" },
      { value: "중급", label: "중급", desc: "6개월 이상 2년 미만" },
      { value: "고급", label: "고급", desc: "2년 이상" },
    ],
  },
  {
    id: "frequency",
    title: "일주일에 며칠 운동할 수 있나요?",
    options: [
      { value: "주 2일", label: "주 2일" },
      { value: "주 3일", label: "주 3일" },
      { value: "주 4일", label: "주 4일" },
      { value: "주 5일 이상", label: "주 5일 이상" },
    ],
  },
  {
    id: "duration",
    title: "하루 운동 가능 시간은 어느 정도인가요?",
    options: [
      { value: "30분 이하", label: "30분 이하" },
      { value: "45분~1시간", label: "45분~1시간" },
      { value: "1시간 30분 이상", label: "1시간 30분 이상" },
    ],
  },
  {
    id: "style",
    title: "선호하는 운동 스타일이 있나요?",
    options: [
      { value: "근력 중심", label: "근력 중심" },
      { value: "근비대 중심", label: "근비대 중심" },
      { value: "체력 중심", label: "체력 중심" },
    ],
  },
  {
    id: "injuries",
    title: "주의해야 할 통증이나 부위가 있나요?",
    subtitle: "해당하는 항목을 모두 선택하세요.",
    multiple: true,
    options: [
      { value: "해당 없음", label: "해당 없음" },
      { value: "목/어깨", label: "목/어깨" },
      { value: "허리", label: "허리" },
      { value: "무릎", label: "무릎" },
      { value: "손목/발목", label: "손목/발목" },
    ],
  },
];

const initialFormData = {
  sex: "남성",
  age: 30,
  height: 172,
  weight: 70,
  goal: "",
  level: "",
  frequency: "",
  duration: "",
  style: "",
  injuries: [],
  redFlags: [],
  equipment: ["맨몸"],
};

const BODY_FIELDS = [
  { id: "age", label: "나이", unit: "세", min: 14, max: 90 },
  { id: "height", label: "키", unit: "cm", min: 130, max: 220 },
  { id: "weight", label: "체중", unit: "kg", min: 35, max: 200 },
];

export default function Onboarding({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState(initialFormData);
  const [redFlagOptions, setRedFlagOptions] = useState(FALLBACK_RED_FLAGS);
  const [equipmentOptions, setEquipmentOptions] = useState(FALLBACK_EQUIPMENT);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        const result = await api.onboardingOptions(controller.signal);
        if (controller.signal.aborted) return;
        if (result.redFlags?.length) setRedFlagOptions(result.redFlags);
        if (result.equipment?.length) setEquipmentOptions(result.equipment);
      } catch {
        // 서버가 없으면 내장 선택지를 그대로 쓴다.
      }
    };

    load();
    return () => controller.abort();
  }, []);

  const steps = useMemo(
    () => [
      ...BASE_STEPS,
      {
        id: "equipment",
        title: "사용할 수 있는 기구를 모두 골라주세요.",
        subtitle:
          "고른 기구로 할 수 있는 동작만 추천합니다. 맨몸 운동은 항상 포함됩니다.",
        multiple: true,
        options: equipmentOptions.map((value) => ({ value, label: value })),
      },
      {
        id: "redFlags",
        title: "건강 상태를 확인하겠습니다.",
        subtitle:
          "해당하는 항목을 모두 선택하세요. 안전과 직결되는 문항이라 정확하게 답할수록 좋습니다.",
        multiple: true,
        options: redFlagOptions.map((value) => ({ value, label: value })),
      },
    ],
    [redFlagOptions, equipmentOptions],
  );

  const step = steps[currentStep];

  const handleSelect = (value) => {
    setError("");

    if (step.multiple) {
      setFormData((prev) => {
        const current = prev[step.id];
        if (value === "해당 없음") {
          return { ...prev, [step.id]: ["해당 없음"] };
        }

        const withoutNone = current.filter((item) => item !== "해당 없음");
        return {
          ...prev,
          [step.id]: current.includes(value)
            ? withoutNone.filter((item) => item !== value)
            : [...withoutNone, value],
        };
      });
      return;
    }

    setFormData((prev) => ({ ...prev, [step.id]: value }));
  };

  const handleNumberChange = (field, rawValue) => {
    setError("");
    setFormData((prev) => ({ ...prev, [field]: rawValue === "" ? "" : Number(rawValue) }));
  };

  const handleSexChange = (value) => {
    setError("");
    setFormData((prev) => ({ ...prev, sex: value }));
  };

  const isCurrentStepValid = () => {
    if (step.type === "body") {
      return BODY_FIELDS.every(({ id, min, max }) => {
        const value = formData[id];
        return typeof value === "number" && value >= min && value <= max;
      });
    }

    const value = formData[step.id];
    return step.multiple ? value.length > 0 : value !== "";
  };

  const handleNext = () => {
    if (!isCurrentStepValid()) return;
    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const handleSubmit = async () => {
    if (!isCurrentStepValid()) return;

    setIsSubmitting(true);
    setError("");

    try {
      const payload = { ...formData, userId: storage.getUserId() };
      const result = await api.submitOnboarding(payload);
      storage.setUserId(result.userId);
      onComplete({
        profile: { ...formData, userId: result.userId },
        userId: result.userId,
        safety: result.safety,
      });
    } catch (err) {
      setError(`${err.message} 서버가 실행 중인지 확인해 주세요.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="panel onboarding-container">
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
        />
      </div>

      <div className="step-content">
        <span className="step-indicator">
          Step {currentStep + 1} / {steps.length}
        </span>
        <h2>{step.title}</h2>
        {step.subtitle && <p className="subtitle">{step.subtitle}</p>}

        {step.type === "body" ? (
          <div className="body-form">
            <div className="body-field">
              <label>성별</label>
              <div className="segmented">
                {["남성", "여성"].map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={formData.sex === value ? "segment selected" : "segment"}
                    onClick={() => handleSexChange(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            {BODY_FIELDS.map(({ id, label, unit, min, max }) => (
              <div className="body-field" key={id}>
                <label htmlFor={`body-${id}`}>
                  {label} <span className="unit">({unit})</span>
                </label>
                <input
                  id={`body-${id}`}
                  type="number"
                  inputMode="numeric"
                  min={min}
                  max={max}
                  value={formData[id]}
                  onChange={(event) => handleNumberChange(id, event.target.value)}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="options-grid">
            {step.options.map((option) => {
              const selected = step.multiple
                ? formData[step.id].includes(option.value)
                : formData[step.id] === option.value;

              return (
                <button
                  type="button"
                  key={option.value}
                  className={selected ? "option-card selected" : "option-card"}
                  onClick={() => handleSelect(option.value)}
                >
                  <span className="option-label">{option.label}</span>
                  {option.desc && <span className="option-desc">{option.desc}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="nav-buttons">
        <button
          type="button"
          className="secondary-button"
          onClick={() => setCurrentStep((prev) => Math.max(0, prev - 1))}
          disabled={currentStep === 0 || isSubmitting}
        >
          이전
        </button>

        {currentStep === steps.length - 1 ? (
          <button
            type="button"
            className="primary-button"
            onClick={handleSubmit}
            disabled={!isCurrentStepValid() || isSubmitting}
          >
            {isSubmitting ? "안전 점검 중..." : "안전 점검 후 루틴 받기"}
          </button>
        ) : (
          <button
            type="button"
            className="primary-button"
            onClick={handleNext}
            disabled={!isCurrentStepValid()}
          >
            다음
          </button>
        )}
      </div>
    </section>
  );
}
