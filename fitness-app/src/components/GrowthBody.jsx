import {
  HEAD,
  REGION_COLOR,
  REGION_LABEL,
  backRegionsAt,
  frontRegionsAt,
  silhouetteAt,
} from "../data/muscleFigure";

/**
 * 성장 아바타. 도전과제를 깰수록 몸이 붙는다.
 *
 * "5/9 달성"이라는 숫자만으로는 얼마나 온 건지 감이 오지 않는다. 시작 체형과
 * 지금 체형을 나란히 놓으면 그 차이가 곧 성장이라 한눈에 읽힌다.
 * (처음엔 지금 몸 위에 시작 윤곽을 점선으로 겹쳐 봤는데, 몸에 가려 거의
 *  보이지 않았다. 나란히 두는 편이 훨씬 분명하다.)
 */

// 아무것도 안 한 상태에서도 사람 형태는 갖춘다. 0이면 뼈만 남은 것처럼 보인다.
export const START_BUILD = 0.15;

function Silhouette({ build }) {
  return (
    <>
      <ellipse cx={HEAD.cx} cy={HEAD.cy} rx={HEAD.rx} ry={HEAD.ry} />
      {silhouetteAt(build).map((d) => (
        <path d={d} key={d.slice(0, 24)} />
      ))}
    </>
  );
}

function Figure({ view, caption, build, muted = false }) {
  const regions = view === "front" ? frontRegionsAt(build) : backRegionsAt(build);
  // 몸이 붙을수록 근육도 또렷해진다. 시작 체형은 회색으로 둬 지금 몸이 돋보이게.
  const tone = muted ? 0.3 : 0.22 + 0.58 * build;

  return (
    <figure className={muted ? "growth-figure muted" : "growth-figure"}>
      <svg viewBox="0 0 220 470" role="img" aria-label={`${caption} 체형`}>
        <g className="body-base">
          <Silhouette build={build} />
        </g>

        <g className="muscle-sheet">
          {Object.entries(regions).map(([id, d]) => (
            <path
              className="zone"
              style={{
                "--tone": muted ? "#94a3b5" : REGION_COLOR[id] ?? "#8a97a8",
                fillOpacity: tone,
              }}
              d={d}
              key={id}
            >
              <title>{REGION_LABEL[id] ?? id}</title>
            </path>
          ))}
        </g>

        <g className="body-outline">
          <Silhouette build={build} />
        </g>

        {view === "front" ? (
          <g className="face">
            <ellipse cx={HEAD.cx - 6.5} cy={HEAD.cy - 2} rx="2" ry="1.6" />
            <ellipse cx={HEAD.cx + 6.5} cy={HEAD.cy - 2} rx="2" ry="1.6" />
          </g>
        ) : (
          <ellipse
            className="nape"
            cx={HEAD.cx}
            cy={HEAD.cy - 3}
            rx={HEAD.rx - 0.5}
            ry={HEAD.ry - 3}
          />
        )}
      </svg>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

function Pair({ view, label, build }) {
  return (
    <div className="growth-pair">
      <span className={`view-chip ${view}`}>{label}</span>
      <div className="growth-pair-figures">
        <Figure view={view} caption="시작" build={START_BUILD} muted />
        <span className="growth-arrow" aria-hidden="true">
          →
        </span>
        <Figure view={view} caption="지금" build={build} />
      </div>
    </div>
  );
}

export default function GrowthBody({ build }) {
  return (
    <div className="growth-figures">
      <Pair view="front" label="앞 · 정면" build={build} />
      <Pair view="back" label="뒤 · 후면" build={build} />
    </div>
  );
}
