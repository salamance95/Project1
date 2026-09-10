import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, withParticle } from "../api";
import MuscleMap from "./MuscleMap";
import { muscleDetail, primaryMuscleText } from "../data/muscles";

export default function ExerciseGuide({ initialSlug = null }) {
  const [query, setQuery] = useState("");
  const [list, setList] = useState([]);
  const [search, setSearch] = useState(null);
  // 계획에서 넘어왔으면 그 동작을 펼친 채로 시작한다.
  const [selected, setSelected] = useState(initialSlug);
  const detailRef = useRef(null);
  // 상세를 연 직후 한 번만 그 자리로 데려간다. 계획에서 넘어온 경우도 포함.
  const [pendingScroll, setPendingScroll] = useState(Boolean(initialSlug));
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      let next = [];
      let nextSearch = null;
      let nextError = "";
      try {
        const result = await api.exercises(query, controller.signal);
        next = result.exercises ?? [];
        nextSearch = result.search ?? null;
      } catch (err) {
        if (err.name === "AbortError") return;
        nextError = err.message;
      }
      if (controller.signal.aborted) return;
      setList(next);
      setSearch(nextSearch);
      setError(nextError);
      setIsLoading(false);
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    if (!selected) return undefined;
    const controller = new AbortController();

    const run = async () => {
      let next = null;
      try {
        next = await api.exerciseDetail(selected, controller.signal);
      } catch (err) {
        if (err.name === "AbortError") return;
      }
      if (controller.signal.aborted) return;
      setDetail(next);
    };

    run();
    return () => controller.abort();
  }, [selected]);

  /**
   * 설명과 영상은 검색 목록 아래에 있어서, 열어 두기만 하면 화면 밖에 있다.
   *
   * 목록(isLoading)까지 자리를 잡은 뒤에 옮겨야 한다. 상세만 보고 먼저 옮기면
   * 뒤늦게 그려진 목록이 상세를 아래로 밀어내서 도로 화면 밖으로 나간다.
   * 부드러운 스크롤은 목록이 길 때 한참 흐르므로 즉시 이동한다.
   */
  useLayoutEffect(() => {
    if (!pendingScroll || isLoading || !detail || !detailRef.current) return;

    detailRef.current.scrollIntoView({ block: "start" });
    setPendingScroll(false);
  }, [pendingScroll, isLoading, detail]);

  const open = (slug) => {
    setDetail(null);
    setSelected(slug);
    setPendingScroll(true);
  };

  const close = () => {
    setSelected(null);
    setDetail(null);
  };

  // 아직 자극 부위를 정리하지 않은 동작이면 그 블록만 통째로 빠진다.
  const muscles = detail ? muscleDetail(detail.exercise.slug) : null;

  return (
    <section className="guide-layout">
      <header className="page-head">
        <div>
          <span className="page-eyebrow">
            EXERCISE LIBRARY{list.length ? ` · ${list.length}종` : ""}
          </span>
          <h1>운동 도감</h1>
        </div>
      </header>

      <section className="panel">
        <p className="page-lede">
          문장으로 물어봐도 됩니다 — &ldquo;집에서 할 수 있는 등 운동&rdquo;, &ldquo;무릎 아픈데
          하체&rdquo;처럼요.
        </p>

        <input
          className="guide-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="예: 집에서 할 수 있는 등 운동 / 무릎 아픈데 하체"
        />

        {search && (
          <div className="search-meta">
            <p>{search.summary}</p>
            <span className="search-model">
              {search.fallbackFrom
                ? `${search.model} (${search.fallbackFrom} 사용 불가)`
                : search.model}
            </span>
          </div>
        )}

        {error && <p className="form-error">{error}</p>}
        {isLoading && <p className="loading-state">불러오는 중입니다.</p>}

        {!isLoading && list.length === 0 && (
          <p className="empty-note">검색 결과가 없습니다.</p>
        )}

        <div className="guide-list">
          {list.map((item) => (
            <button
              type="button"
              key={item.slug}
              className={selected === item.slug ? "guide-item selected" : "guide-item"}
              onClick={() => open(item.slug)}
            >
              <span className="guide-item-head">
                <strong>{item.name}</strong>
                {item.reason && <small className="guide-reason">{item.reason}</small>}
              </span>
              <span className="guide-tags">
                <em className="tag muscle">{item.muscle}</em>
                <em className="tag gear">{item.equipment}</em>
              </span>
              {primaryMuscleText(item.slug) && (
                <small className="guide-item-muscles">
                  {primaryMuscleText(item.slug)}
                </small>
              )}
            </button>
          ))}
        </div>
      </section>

      {selected && !detail && <div className="panel loading-state">설명을 불러오는 중입니다.</div>}

      {detail && (
        <section className="panel guide-detail" ref={detailRef}>
          <div className="section-heading">
            <div>
              <h2>{detail.exercise.name}</h2>
              <p>
                {detail.exercise.muscle} · {detail.exercise.equipment}
                {detail.exercise.isHighImpact && " · 고충격 동작"}
              </p>
            </div>
            <button type="button" className="secondary-button" onClick={close}>
              닫기
            </button>
          </div>

          {detail.exercise.risk.length > 0 && (
            <p className="guide-risk">
              주의 부위: {detail.exercise.risk.join(", ")}
              {detail.exercise.alternative && (
                <>
                  {" — 통증이 있으면 "}
                  <strong>{detail.exercise.alternative.name}</strong>
                  {withParticle(detail.exercise.alternative.name, "으로", "로")} 대체하세요.
                </>
              )}
            </p>
          )}

          {muscles && (
            <div className="guide-block">
              <h3>자극 부위</h3>

              <div className="muscle-detail-body">
                <MuscleMap primary={muscles.primary} secondary={muscles.secondary} />

                <div className="muscle-detail">
                  <div className="muscle-detail-row">
                    <span className="muscle-detail-label primary">주동근</span>
                    <span className="muscle-detail-tags">
                      {muscles.primary.map((name) => (
                        <em className="tag muscle" key={name}>
                          {name}
                        </em>
                      ))}
                    </span>
                  </div>
                  <div className="muscle-detail-row">
                    <span className="muscle-detail-label">협응근</span>
                    <span className="muscle-detail-tags">
                      {muscles.secondary.map((name) => (
                        <em className="tag support" key={name}>
                          {name}
                        </em>
                      ))}
                    </span>
                  </div>
                  <p className="muscle-detail-note">
                    주동근에 자극이 없고 협응근만 뻐근하면 자세를 다시 보세요.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="guide-block">
            <h3>하는 방법</h3>
            <ol>
              {detail.guide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          <div className="guide-two">
            <div className="guide-block">
              <h3>신경 쓸 점</h3>
              <ul>
                {detail.guide.cues.map((cue) => (
                  <li key={cue}>{cue}</li>
                ))}
              </ul>
            </div>

            <div className="guide-block warn">
              <h3>흔한 실수</h3>
              <p>{detail.guide.mistake}</p>
            </div>
          </div>

          <div className="guide-block">
            <h3>참고 영상 · 자료</h3>

            {detail.guide.media
              .filter((item) => item.kind === "video")
              .map((item) => (
                <a
                  key={item.url}
                  className="video-card"
                  href={item.url}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <span className="video-thumb">
                    {/* 썸네일이 막히거나 실패해도 카드가 깨지지 않게 숨긴다. */}
                    <img
                      src={item.thumbnail}
                      alt=""
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                    <span className="video-play" aria-hidden="true">
                      ▶
                    </span>
                  </span>
                  <span className="video-text">
                    <strong>{item.label}</strong>
                    <span>{item.note}</span>
                  </span>
                </a>
              ))}

            <div className="guide-media">
              {detail.guide.media
                .filter((item) => item.kind !== "video")
                .map((item) => (
                  <a
                    key={item.url}
                    className="media-link"
                    href={item.url}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <strong>{item.label}</strong>
                    <span>{item.note}</span>
                  </a>
                ))}
            </div>
          </div>
        </section>
      )}
    </section>
  );
}
