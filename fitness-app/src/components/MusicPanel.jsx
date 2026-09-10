import { useEffect, useState } from "react";
import { api, toIso } from "../api";

/** 링크는 화면에서 그대로 열리므로 http(s)만 통과시킨다. */
function isSafeUrl(url) {
  return /^https?:\/\//i.test((url ?? "").trim());
}

export default function MusicPanel({ userId }) {
  const [data, setData] = useState(null);
  // 장르와 길이를 고르면 그 조합의 플레이리스트가 나온다.
  const [themeId, setThemeId] = useState(null);
  const [durationId, setDurationId] = useState("1h");
  // 고른 장르·길이의 결과. 1곡이면 곡 목록, 나머지는 그 길이짜리 플레이리스트 영상 목록.
  const [picks, setPicks] = useState(null);
  const [picksLoading, setPicksLoading] = useState(false);
  const [links, setLinks] = useState([]);
  const [form, setForm] = useState({ label: "", url: "" });
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    const run = async () => {
      let next = null;
      let nextError = "";
      try {
        // 오늘 날짜의 세션을 기준으로 추천을 받는다.
        next = await api.music(userId, toIso(new Date()), controller.signal);
      } catch (err) {
        if (err.name === "AbortError") return;
        nextError = `${err.message} 서버 연결을 확인해 주세요.`;
      }
      if (controller.signal.aborted) return;

      setData(next);
      setLinks(next?.myLinks ?? []);

      if (next) {
        // 길이는 설문의 하루 운동 시간, 장르는 그날 세션에 맞는 것부터.
        const duration = next.today.duration?.id ?? "1h";
        setDurationId(duration);
        setThemeId(next.mixLists[duration]?.[0]?.themeId ?? null);
      }

      setError(nextError);
      setIsLoading(false);
    };

    run();
    return () => controller.abort();
  }, [userId]);

  useEffect(() => {
    if (!themeId || !durationId) return undefined;
    const controller = new AbortController();

    const run = async () => {
      setPicksLoading(true);
      try {
        const result = await api.musicTracks(themeId, durationId, controller.signal);
        if (!controller.signal.aborted) setPicks(result);
      } catch (err) {
        if (err.name !== "AbortError") setPicks(null);
      } finally {
        if (!controller.signal.aborted) setPicksLoading(false);
      }
    };

    run();
    return () => controller.abort();
  }, [themeId, durationId]);

  const addLink = async () => {
    const label = form.label.trim();
    const url = form.url.trim();

    if (!label || !url) {
      setError("이름과 주소를 모두 넣어주세요.");
      return;
    }
    if (!isSafeUrl(url)) {
      setError("http 또는 https로 시작하는 주소만 넣을 수 있습니다.");
      return;
    }

    setIsBusy(true);
    setError("");
    try {
      const result = await api.addMusicLink({ userId, label, url });
      setLinks(result.links ?? []);
      setForm({ label: "", url: "" });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsBusy(false);
    }
  };

  const removeLink = async (linkId) => {
    setIsBusy(true);
    setError("");
    try {
      const result = await api.deleteMusicLink(userId, linkId);
      setLinks(result.links ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsBusy(false);
    }
  };

  if (isLoading) return <div className="panel loading-state">플레이리스트를 불러오는 중입니다.</div>;
  if (!data) return <div className="panel form-error-panel">{error}</div>;

  const { today, durations, mixLists } = data;

  // 고른 길이의 목록에서 고른 장르를 찾는다. 없으면 맨 앞(= 오늘 세션에 맞는 것).
  const mixes = mixLists[durationId] ?? [];
  const picked = mixes.find((mix) => mix.themeId === themeId) ?? mixes[0];

  return (
    <section className="music-layout">
      <header className="page-head">
        <div>
          <span className="page-eyebrow">
            WORKOUT MUSIC{today.session ? ` · ${today.session.day}요일 ${today.session.focus}` : ""}
          </span>
          <h1>오늘 세션에 맞춘 플레이리스트</h1>
        </div>
      </header>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p>
              {today.reason} 이런 세션에는 <strong>{today.playlist.bpm} BPM</strong> 언저리가 잘
              맞습니다.
            </p>
          </div>
          {today.session && (
            <span className={`intensity ${today.session.intensity}`}>
              {today.session.intensityLabel}
            </span>
          )}
        </div>

        <div className="picker">
          <p className="picker-label">장르</p>
          <div className="chip-row" role="group" aria-label="장르">
            {mixes.map((mix) => (
              <button
                type="button"
                key={mix.themeId}
                className={mix.themeId === picked?.themeId ? "chip on" : "chip"}
                onClick={() => setThemeId(mix.themeId)}
              >
                {mix.label.replace(` ${mix.duration.label}`, "")}
                {mix.recommended && <span className="chip-tag">추천</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="picker">
          <p className="picker-label">길이</p>
          <div className="chip-row" role="group" aria-label="플레이리스트 길이">
            {durations.map((item) => (
              <button
                type="button"
                key={item.id}
                className={durationId === item.id ? "chip on" : "chip"}
                onClick={() => setDurationId(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {picked && (
          <article className="playlist-hero">
            <div className="playlist-head">
              <div>
                <h3>{picked.label}</h3>
                <p>{picked.note}</p>
              </div>
              {picked.recommended && <span className="mix-badge">오늘 세션에 맞음</span>}
            </div>

            <div className="playlist-links">
              <a
                className="primary-button"
                href={picked.links.youtube}
                target="_blank"
                rel="noreferrer noopener"
              >
                유튜브에서 {picked.duration.label} 재생
              </a>
              <a
                className="secondary-button"
                href={picked.links.spotify}
                target="_blank"
                rel="noreferrer noopener"
              >
                스포티파이에서 찾기
              </a>
            </div>

            <p className="mix-tracks-note">
              {picksLoading
                ? "목록을 받아오는 중입니다."
                : !picks
                  ? ""
                  : picks.mode === "playlists"
                    ? `${picks.duration.label}짜리 플레이리스트 영상입니다. 줄마다 찾는 각도가 달라서, 눌러 보고 마음에 드는 영상을 고르면 됩니다.`
                    : picks.source === "ai"
                      ? `${picks.model}이(가) 고른 ${picks.items.length}곡입니다. 한 곡만 틀 때 고르세요.`
                      : `기본 목록 ${picks.items.length}곡입니다. ${picks.reason ?? ""}`}
            </p>

            {picks?.mode === "playlists" ? (
              <ul className="mix-list">
                {picks.items.map((item) => (
                  <li key={item.id} className="mix-item">
                    <span className="mix-main">
                      <strong>{item.label}</strong>
                      <small>{item.note}</small>
                    </span>
                    <span className="mix-links">
                      <a href={item.links.youtube} target="_blank" rel="noreferrer noopener">
                        유튜브에서 열기
                      </a>
                      <a href={item.links.spotify} target="_blank" rel="noreferrer noopener">
                        스포티파이
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <ol className="track-list">
                {(picks?.items ?? picked.tracks).map((track) => (
                  <li key={`${track.title}-${track.artist}`}>
                    <span className="track-main">
                      <strong>{track.title}</strong>
                      <small>{track.artist}</small>
                    </span>
                    <span className="track-bpm">{track.bpm} BPM</span>
                    <span className="track-links">
                      <a href={track.links.youtube} target="_blank" rel="noreferrer noopener">
                        유튜브
                      </a>
                      <a href={track.links.spotify} target="_blank" rel="noreferrer noopener">
                        스포티파이
                      </a>
                    </span>
                  </li>
                ))}
              </ol>
            )}

          </article>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">My Playlist</p>
            <h2>내 플레이리스트</h2>
            <p>즐겨 듣는 유튜브·스포티파이 목록 주소를 저장해 두면 여기서 바로 열립니다.</p>
          </div>
        </div>

        <div className="music-form">
          <input
            aria-label="플레이리스트 이름"
            placeholder="이름 (예: 데드리프트 데이)"
            value={form.label}
            maxLength={60}
            onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
          />
          <input
            aria-label="플레이리스트 주소"
            placeholder="https://..."
            value={form.url}
            onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))}
          />
          <button type="button" className="primary-button" onClick={addLink} disabled={isBusy}>
            저장
          </button>
        </div>

        {error && <p className="form-error">{error}</p>}

        {links.length === 0 ? (
          <p className="empty-note">저장한 목록이 없습니다.</p>
        ) : (
          <ul className="my-link-list">
            {links.map((link) => (
              <li key={link.id}>
                <a href={link.url} target="_blank" rel="noreferrer noopener">
                  {link.label}
                </a>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => removeLink(link.id)}
                  disabled={isBusy}
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
