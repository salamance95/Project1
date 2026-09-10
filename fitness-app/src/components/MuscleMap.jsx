import { muscleRegions } from "../data/muscles";
import {
  BACK_REGIONS,
  FRONT_REGIONS,
  HEAD,
  REGION_COLOR,
  REGION_LABEL,
  SILHOUETTE,
} from "../data/muscleFigure";

/**
 * 자극 부위 인체도.
 *
 * 해부도처럼 근육을 모두 그려 두고, 그 운동이 쓰는 근육만 진하게 칠한다.
 * 강조된 부위만 그리면 "몸의 어디쯤"인지 가늠할 기준이 없어서, 쓰지 않는
 * 근육도 흐리게 남겨 둔다.
 *
 * 색은 근육 이름을, 진하기는 그 운동이 쓰는지 여부를 말한다. 둘을 한 축에
 * 몰아넣으면(예: 색만으로 강조) 어느 쪽 정보도 제대로 읽히지 않는다.
 */

// 앞뒤를 한눈에 가르는 표시. 얼굴이 보이면 앞, 뒤통수면 뒤.
const EYE_Y = HEAD.cy - 2;

function Silhouette() {
  return (
    <>
      <ellipse cx={HEAD.cx} cy={HEAD.cy} rx={HEAD.rx} ry={HEAD.ry} />
      {SILHOUETTE.map((d) => (
        <path d={d} key={d.slice(0, 24)} />
      ))}
    </>
  );
}

function Figure({ view, label, regions, marks }) {
  return (
    <figure className="muscle-figure">
      <svg viewBox="0 0 220 470" role="img" aria-label={`${label}에서 본 자극 부위`}>
        <g className="body-base">
          <Silhouette />
        </g>

        {/* 쓰지 않는 근육도 그려야 어느 부위인지 견줄 수 있다. */}
        <g className="muscle-sheet">
          {Object.entries(regions).map(([id, d]) => (
            <path
              className={marks[id] ? `zone ${marks[id]}` : "zone"}
              style={{ "--tone": REGION_COLOR[id] ?? "#8a97a8" }}
              d={d}
              key={id}
            >
              <title>{REGION_LABEL[id] ?? id}</title>
            </path>
          ))}
        </g>

        {/* 칠한 부위 위로 윤곽을 한 번 더 그어 사람 형태가 남게 한다. */}
        <g className="body-outline">
          <Silhouette />
        </g>

        {view === "front" ? (
          <g className="face">
            <ellipse cx={HEAD.cx - 6.5} cy={EYE_Y} rx="2" ry="1.6" />
            <ellipse cx={HEAD.cx + 6.5} cy={EYE_Y} rx="2" ry="1.6" />
          </g>
        ) : (
          // 뒤통수. 머리를 덮고 목덜미만 남겨 두면 뒤에서 본 것이 분명해진다.
          <ellipse
            className="nape"
            cx={HEAD.cx}
            cy={HEAD.cy - 3}
            rx={HEAD.rx - 0.5}
            ry={HEAD.ry - 3}
          />
        )}
      </svg>
      <figcaption className={`view-chip ${view}`}>{label}</figcaption>
    </figure>
  );
}

export default function MuscleMap({ primary = [], secondary = [] }) {
  // 협응근을 먼저 칠하고 주동근으로 덮는다. 겹치는 근육은 주동근이 이긴다.
  const marks = {};
  for (const name of secondary) {
    for (const id of muscleRegions(name)) marks[id] = "secondary";
  }
  for (const name of primary) {
    for (const id of muscleRegions(name)) marks[id] = "primary";
  }

  // 심폐 지구력처럼 그림으로 가리킬 수 없는 항목은 따로 적어 준다.
  const offMap = [...primary, ...secondary].filter(
    (name) => muscleRegions(name).length === 0,
  );

  return (
    <div className="muscle-map">
      <div className="muscle-figures">
        <Figure view="front" label="앞 · 정면" regions={FRONT_REGIONS} marks={marks} />
        <Figure view="back" label="뒤 · 후면" regions={BACK_REGIONS} marks={marks} />
      </div>

      {/* 색은 근육마다 다르므로, 범례는 색이 아니라 진하기를 설명한다. */}
      <p className="muscle-legend">
        <span className="swatch primary" aria-hidden="true" />
        주동근
        <span className="swatch secondary" aria-hidden="true" />
        협응근
        <span className="swatch off" aria-hidden="true" />
        그 외
      </p>

      {offMap.length > 0 && (
        <p className="muscle-offmap">{offMap.join(" · ")} — 특정 부위가 아닌 전신 자극</p>
      )}
    </div>
  );
}
