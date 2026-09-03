import { useEffect, useState } from "react";
import { api, withParticle } from "../api";

export default function ExerciseGuide() {
  const [query, setQuery] = useState("");
  const [list, setList] = useState([]);
  const [search, setSearch] = useState(null);
  const [selected, setSelected] = useState(null);
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

  const open = (slug) => {
    setDetail(null);
    setSelected(slug);
  };

  return (
    <section className="guide-layout">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Exercise Guide</p>
            <h2>운동 찾아보기</h2>
            <p>
              문장으로 물어봐도 됩니다 — &ldquo;집에서 할 수 있는 등 운동&rdquo;,
              &ldquo;무릎 아픈데 하체&rdquo;처럼요.
            </p>
          </div>
        </div>

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
            </button>
          ))}
        </div>
      </section>

      {selected && !detail && <div className="panel loading-state">설명을 불러오는 중입니다.</div>}

      {detail && (
        <section className="panel guide-detail">
          <div className="section-heading">
            <div>
              <h2>{detail.exercise.name}</h2>
              <p>
                {detail.exercise.muscle} · {detail.exercise.equipment}
                {detail.exercise.isHighImpact && " · 고충격 동작"}
              </p>
            </div>
            <button type="button" className="secondary-button" onClick={() => setSelected(null)}>
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
            <p className="guide-media-note">
              저작권 문제가 없도록 자유 라이선스 자료만 모인 곳으로 연결합니다. 특정 영상 주소를
              임의로 넣지 않았습니다.
            </p>
            <div className="guide-media">
              {detail.guide.media.map((item) => (
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
