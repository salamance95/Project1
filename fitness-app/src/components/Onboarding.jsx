import { useEffect, useMemo, useRef, useState } from "react";
import { api, storage } from "../api";
import BmiScale, { bandOf } from "./BmiScale";
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

const AUTO_SPLIT = "자동 추천";

/** 단계 줄에 쓰는 짧은 이름. 제목은 길어서 칩에 안 들어간다. */
const STEP_RAIL = {
  body: "신체",
  goal: "목표",
  level: "경력",
  frequency: "빈도",
  split: "분할",
  duration: "시간",
  style: "스타일",
  injuries: "통증",
  equipment: "기구",
  redFlags: "건강",
};

// 서버가 없을 때 쓰는 분할 선택지. 백엔드 SPLIT_OPTIONS와 같은 형태다.
const FALLBACK_SPLITS = [
  { id: AUTO_SPLIT, label: "자동 추천", minDays: 1, desc: "경력·운동 일수·BMI로 알아서 고릅니다" },
  { id: "무분할(전신)", label: "무분할(전신)", minDays: 2, desc: "매 세션 전신을 한 번씩" },
  { id: "2분할", label: "2분할", minDays: 2, desc: "상체 / 하체" },
  { id: "3분할", label: "3분할", minDays: 3, desc: "푸시 / 풀 / 레그" },
  { id: "4분할", label: "4분할", minDays: 4, desc: "가슴·삼두 / 등·이두 / 어깨·코어 / 하체" },
  { id: "5분할", label: "5분할", minDays: 5, desc: "가슴 / 등 / 어깨 / 하체 / 팔·코어" },
];

// 분할 선택지를 거를 때 쓰는 주당 훈련일 수. 백엔드 TRAINING_DAYS와 같다.
const FREQUENCY_DAYS = {
  "주 2일": 2,
  "주 3일": 3,
  "주 4일": 4,
  "주 5일 이상": 5,
};

const BASE_STEPS = [
  {
    id: "body",
    type: "body",
    title: "기본 신체 정보를 알려주세요.",
    subtitle: "BMI와 하루 목표 열량·단백질량을 계산하는 데 사용합니다.",
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
  // 체성분은 선택 입력. 비워 두면 키·체중만으로 추천한다.
  bodyFat: "",
  muscleMass: "",
  goal: "",
  level: "",
  frequency: "",
  split: AUTO_SPLIT,
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

// 선택 입력. 있으면 체형을 더 세분해서 판단하고, 없으면 BMI만으로 판단한다.
const COMPOSITION_FIELDS = [
  { id: "bodyFat", label: "체지방률", unit: "%", min: 3, max: 70, step: "0.1" },
  { id: "muscleMass", label: "골격근량", unit: "kg", min: 10, max: 80, step: "0.1" },
];

const BMI_MIN = 12;
const BMI_MAX = 60;

function round1(value) {
  return Math.floor(value * 10 + 0.5) / 10;
}

/** 키(cm)와 체중(kg) → BMI. 값이 비어 있으면 null. */
function bmiOf(height, weight) {
  if (typeof height !== "number" || typeof weight !== "number") return null;
  if (height <= 0 || weight <= 0) return null;
  const meters = height / 100;
  return round1(weight / (meters * meters));
}

export default function Onboarding({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState(initialFormData);
  const [redFlagOptions, setRedFlagOptions] = useState(FALLBACK_RED_FLAGS);
  const [equipmentOptions, setEquipmentOptions] = useState(FALLBACK_EQUIPMENT);
  const [splitOptions, setSplitOptions] = useState(FALLBACK_SPLITS);
  // BMI 칸을 직접 고칠 때만 값을 들고 있는다. 평소에는 키·체중에서 계산한다.
  const [bmiDraft, setBmiDraft] = useState(null);
  // 체성분 결과지 사진 읽기
  const photoRef = useRef(null);
  const [photoStatus, setPhotoStatus] = useState(null);
  const [isReadingPhoto, setIsReadingPhoto] = useState(false);
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
        if (result.splits?.length) setSplitOptions(result.splits);
      } catch {
        // 서버가 없으면 내장 선택지를 그대로 쓴다.
      }
    };

    load();
    return () => controller.abort();
  }, []);

  const bmi = bmiOf(formData.height, formData.weight);
  const bmiBand = bandOf(bmi);
  // 체성분을 하나라도 넣었으면 서버가 체형 유형까지 갈라서 판단한다.
  const hasComposition = formData.bodyFat !== "" || formData.muscleMass !== "";

  const steps = useMemo(() => {
    // 고른 운동 일수보다 많은 분할은 소화할 수 없으므로 뺀다.
    const trainingDays = FREQUENCY_DAYS[formData.frequency] ?? 0;
    const splitStep = {
      id: "split",
      title: "몇 분할로 운동할까요?",
      subtitle:
        "한 사이클에 몸을 몇 번으로 나눠 돌릴지 정합니다. 고르기 어려우면 자동 추천을 두세요.",
      options: splitOptions
        .filter((option) => (option.minDays ?? 1) <= trainingDays || option.id === AUTO_SPLIT)
        .map((option) => ({
          value: option.id,
          label: option.label ?? option.id,
          desc: option.desc,
        })),
    };

    const base = BASE_STEPS.flatMap((step) =>
      step.id === "frequency" ? [step, splitStep] : [step],
    );

    return [
      ...base,
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
    ];
  }, [redFlagOptions, equipmentOptions, splitOptions, formData.frequency]);

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

    setFormData((prev) => {
      // 운동 일수를 바꾸면 고른 분할이 불가능해질 수 있으므로 자동 추천으로 되돌린다.
      if (step.id === "frequency" && prev.frequency !== value) {
        return { ...prev, frequency: value, split: AUTO_SPLIT };
      }
      return { ...prev, [step.id]: value };
    });
  };

  const handleNumberChange = (field, rawValue) => {
    setError("");
    setBmiDraft(null);
    setFormData((prev) => ({ ...prev, [field]: rawValue === "" ? "" : Number(rawValue) }));
  };

  /** BMI를 직접 입력하면 지금 키를 기준으로 체중을 되돌려 채운다. */
  const handleBmiChange = (rawValue) => {
    setError("");
    setBmiDraft(rawValue);

    const nextBmi = Number(rawValue);
    if (rawValue === "" || Number.isNaN(nextBmi)) return;
    if (nextBmi < BMI_MIN || nextBmi > BMI_MAX) return;
    if (typeof formData.height !== "number" || formData.height <= 0) return;

    const meters = formData.height / 100;
    setFormData((prev) => ({ ...prev, weight: round1(nextBmi * meters * meters) }));
  };

  /**
   * 인바디·체중계 결과지 사진에서 키·체중을 읽어 채운다.
   * 읽은 값은 그대로 확정하지 않고 입력칸에 넣어 사용자가 고칠 수 있게 둔다.
   */
  const readBodyPhoto = async (file) => {
    if (!file) return;

    setError("");
    setPhotoStatus(null);
    setIsReadingPhoto(true);

    try {
      const result = await api.analyzeBodyPhoto(file);
      const reading = result.reading;

      if (!result.available || !reading) {
        setPhotoStatus({
          kind: "warn",
          message: result.reason || result.note || "사진에서 수치를 찾지 못했습니다.",
        });
        return;
      }

      if (!reading.height && !reading.weight) {
        setPhotoStatus({
          kind: "warn",
          message:
            result.note ||
            "사진에서 키·체중을 찾지 못했습니다. 수치가 적힌 결과지 사진인지 확인해 주세요.",
          warnings: reading.warnings,
        });
        return;
      }

      // 읽힌 값만 채운다. 못 읽은 항목은 기존 값을 그대로 둔다.
      setBmiDraft(null);
      setFormData((prev) => ({
        ...prev,
        height: reading.height ?? prev.height,
        weight: reading.weight ?? prev.weight,
        bodyFat: reading.bodyFat ?? prev.bodyFat,
        muscleMass: reading.muscleMass ?? prev.muscleMass,
      }));

      const read = [
        reading.height && `키 ${reading.height}cm`,
        reading.weight && `체중 ${reading.weight}kg`,
        reading.bodyFat && `체지방 ${reading.bodyFat}%`,
        reading.muscleMass && `골격근량 ${reading.muscleMass}kg`,
      ].filter(Boolean);

      setPhotoStatus({
        kind: "ok",
        message: `${result.model}이(가) ${read.join(" · ")}를 읽었습니다. 틀리면 직접 고쳐주세요.`,
        confidence: result.confidence,
        warnings: reading.warnings,
      });
    } catch (err) {
      setPhotoStatus({ kind: "warn", message: err.message });
    } finally {
      setIsReadingPhoto(false);
      // 같은 파일을 다시 골라도 onChange가 뜨도록 비운다.
      if (photoRef.current) photoRef.current.value = "";
    }
  };

  const handleSexChange = (value) => {
    setError("");
    setFormData((prev) => ({ ...prev, sex: value }));
  };

  const isCurrentStepValid = () => {
    if (step.type === "body") {
      const required = BODY_FIELDS.every(({ id, min, max }) => {
        const value = formData[id];
        return typeof value === "number" && value >= min && value <= max;
      });

      // 체성분은 비워도 되지만, 넣었다면 상식적인 범위여야 한다.
      const optional = COMPOSITION_FIELDS.every(({ id, min, max }) => {
        const value = formData[id];
        return value === "" || (typeof value === "number" && value >= min && value <= max);
      });

      return required && optional;
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
      const payload = {
        ...formData,
        // 안 잰 값은 null로 보낸다. 0으로 보내면 "체지방 0%"가 되어 버린다.
        bodyFat: formData.bodyFat === "" ? null : formData.bodyFat,
        muscleMass: formData.muscleMass === "" ? null : formData.muscleMass,
        userId: storage.getUserId(),
      };
      const result = await api.submitOnboarding(payload);
      storage.setUserId(result.userId);
      onComplete({
        // 화면 상태(빈 칸은 "")가 아니라 서버로 보낸 형태를 그대로 넘긴다.
        // 이걸 다음 화면이 추천 요청에 그대로 다시 쓴다.
        profile: { ...payload, userId: result.userId },
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
      <div className="step-rail">
        {steps.map((item, index) => (
          <span
            key={item.id}
            className={[
              "step-chip",
              index === currentStep ? "on" : "",
              index < currentStep ? "done" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {STEP_RAIL[item.id] ?? item.id}
          </span>
        ))}
      </div>

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

            <div className="body-field bmi-field">
              <label htmlFor="body-bmi">
                BMI <span className="unit">(kg/m²)</span>
              </label>
              <input
                id="body-bmi"
                type="number"
                inputMode="decimal"
                step="0.1"
                min={BMI_MIN}
                max={BMI_MAX}
                value={bmiDraft ?? (bmi ?? "")}
                onChange={(event) => handleBmiChange(event.target.value)}
                onBlur={() => setBmiDraft(null)}
              />
              <p className="bmi-hint">
                키·체중에서 자동으로 계산됩니다. 직접 입력하면 체중이 그 BMI에 맞게 바뀝니다.
              </p>
            </div>

            {COMPOSITION_FIELDS.map(({ id, label, unit, min, max, step }) => (
              <div className="body-field" key={id}>
                <label htmlFor={`body-${id}`}>
                  {label} <span className="unit">({unit})</span>
                  <span className="optional-tag">선택</span>
                </label>
                <input
                  id={`body-${id}`}
                  type="number"
                  inputMode="decimal"
                  step={step}
                  min={min}
                  max={max}
                  placeholder="모르면 비워 두세요"
                  value={formData[id]}
                  onChange={(event) => handleNumberChange(id, event.target.value)}
                />
              </div>
            ))}

            <div className="bmi-panel">
              <div className="photo-row">
                <button
                  type="button"
                  className="secondary-button photo-button"
                  onClick={() => photoRef.current?.click()}
                  disabled={isReadingPhoto}
                >
                  {isReadingPhoto ? "사진 읽는 중..." : "인바디·체중계 결과 사진으로 입력"}
                </button>
                <input
                  ref={photoRef}
                  className="photo-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={(event) => readBodyPhoto(event.target.files?.[0])}
                />
              </div>

              {photoStatus && (
                <div className={`photo-status ${photoStatus.kind}`}>
                  <p className="photo-status-line">
                    {photoStatus.message}
                    {photoStatus.confidence === "low" && " (확신 낮음)"}
                  </p>
                  {photoStatus.warnings?.map((warning) => (
                    <p className="photo-status-line" key={warning}>
                      · {warning}
                    </p>
                  ))}
                </div>
              )}

              <div className="bmi-readout">
                <strong>{bmi === null ? "-" : bmi}</strong>
                <span className={`bmi-badge bmi-${bmiBand ? bmiBand.id : "none"}`}>
                  {bmiBand ? bmiBand.label : "값을 입력하세요"}
                </span>
              </div>
              <BmiScale bmi={bmi} />
              <p className="subtitle">
                {hasComposition
                  ? "체지방률·골격근량을 반영해 체형을 더 세분해서 추천합니다. BMI만으로는 갈리지 않는 근육형·마른비만형까지 구분합니다."
                  : "BMI는 분할 추천과 세션 강도, 유산소 배치를 정하는 기준으로 쓰입니다. 체지방률·골격근량을 넣으면 근육형·마른비만형까지 갈라서 더 정확해집니다."}
              </p>
            </div>
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
