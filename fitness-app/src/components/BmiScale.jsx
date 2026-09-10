/** BMI 눈금 그림. 입력한 키·몸무게가 어느 구간인지 한눈에 보여준다. */

const SCALE_MIN = 15;
const SCALE_MAX = 40;

// 대한비만학회(아시아-태평양) 기준. 백엔드 app/domain/body.py와 같은 구간이다.
export const BMI_BANDS = [
  { id: "underweight", label: "저체중", min: 15, max: 18.5, color: "#93c5fd" },
  { id: "normal", label: "정상", min: 18.5, max: 23, color: "#4ade80" },
  { id: "overweight", label: "과체중", min: 23, max: 25, color: "#fcd34d" },
  { id: "obese", label: "비만", min: 25, max: 30, color: "#fb923c" },
  { id: "severely_obese", label: "고도비만", min: 30, max: 40, color: "#f87171" },
];

export function bandOf(bmi) {
  if (bmi === null || Number.isNaN(bmi)) return null;
  return BMI_BANDS.find((band) => bmi < band.max) ?? BMI_BANDS[BMI_BANDS.length - 1];
}

/** BMI 값 → 눈금 위 위치(%). 범위를 벗어나면 양 끝에 붙인다. */
function positionOf(bmi) {
  const clamped = Math.min(Math.max(bmi, SCALE_MIN), SCALE_MAX);
  return ((clamped - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;
}

export default function BmiScale({ bmi }) {
  const band = bandOf(bmi);

  return (
    <div className="bmi-scale">
      <div className="bmi-track" role="img" aria-label={`BMI 눈금${bmi === null ? "" : ` ${bmi}`}`}>
        {BMI_BANDS.map((item) => (
          <span
            key={item.id}
            className={band && band.id === item.id ? "bmi-band current" : "bmi-band"}
            style={{ background: item.color, flexGrow: item.max - item.min }}
          />
        ))}

        {bmi !== null && (
          <span className="bmi-marker" style={{ left: `${positionOf(bmi)}%` }}>
            <span className="bmi-marker-value">{bmi}</span>
          </span>
        )}
      </div>

      <ul className="bmi-legend">
        {BMI_BANDS.map((item) => (
          <li key={item.id} className={band && band.id === item.id ? "current" : undefined}>
            <span className="bmi-dot" style={{ background: item.color }} />
            {item.label}
          </li>
        ))}
      </ul>

      <p className="bmi-cutoffs">
        18.5 미만 저체중 · 18.5~22.9 정상 · 23~24.9 과체중 · 25~29.9 비만 · 30 이상 고도비만
      </p>
    </div>
  );
}
