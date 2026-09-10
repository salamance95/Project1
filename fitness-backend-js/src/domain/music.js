/**
 * 운동용 플레이리스트 고르기.
 *
 * 음원을 스트리밍하지 않는다. 어떤 곡이 그날 세션에 맞는지 고르고,
 * 유튜브·스포티파이에서 바로 찾을 수 있는 검색 링크를 만들어 준다.
 */

import {
  AVG_TRACK_MINUTES,
  DURATIONS,
  DURATION_BY_SESSION,
  LENGTH_EN,
  MIX_THEMES,
  PLAYLISTS,
  PLAYLIST_ANGLES,
  PLAYLIST_BY_INTENSITY,
} from "./data/music.data.js";

export { DURATIONS, PLAYLISTS };

const YOUTUBE = "https://www.youtube.com/results?search_query=";
const SPOTIFY = "https://open.spotify.com/search/";

/** 곡 하나를 두 서비스에서 찾는 링크. 검색어는 '제목 아티스트'. */
export function linksFor(track) {
  const query = `${track.title} ${track.artist}`;
  return {
    youtube: YOUTUBE + encodeURIComponent(query),
    spotify: SPOTIFY + encodeURIComponent(query),
  };
}

/** 플레이리스트 전체를 한 번에 찾는 링크. */
function playlistLinks(playlist) {
  const query = `${playlist.label} 운동 플레이리스트 ${playlist.bpm} BPM`;
  return {
    youtube: YOUTUBE + encodeURIComponent(query),
    spotify: SPOTIFY + encodeURIComponent(`workout ${playlist.bpm} bpm`),
  };
}

/**
 * 세션 내내 틀어 둘 롱믹스를 찾는 링크.
 * 유튜브에는 "1시간", "2시간"짜리 운동 믹스가 많아 길이를 검색어에 넣는다.
 */
function mixLinks(playlist, duration) {
  const query = `${playlist.label} 운동 플레이리스트 ${duration.label} 믹스`;
  return {
    youtube: YOUTUBE + encodeURIComponent(query),
    spotify: SPOTIFY + encodeURIComponent(`workout mix ${playlist.bpm} bpm`),
  };
}

/** 그 길이를 채우는 데 필요한 대략적인 곡 수. 최소 한 곡. */
export function trackCountFor(minutes) {
  return Math.max(Math.round(minutes / AVG_TRACK_MINUTES), 1);
}

/** 설문의 하루 운동 시간 → 기본 길이. 모르면 1시간. */
export function durationForSession(sessionDuration) {
  const id = DURATION_BY_SESSION[sessionDuration] ?? "1h";
  return DURATIONS.find((item) => item.id === id) ?? DURATIONS[1];
}

function shape(playlist) {
  return {
    ...playlist,
    links: playlistLinks(playlist),
    // 길이별 롱믹스 검색 링크. 30분·1시간·2시간.
    mixes: DURATIONS.map((duration) => ({
      ...duration,
      trackCount: trackCountFor(duration.minutes),
      links: mixLinks(playlist, duration),
    })),
    tracks: playlist.tracks.map((track) => ({ ...track, links: linksFor(track) })),
  };
}

export function playlistById(id) {
  const found = PLAYLISTS.find((item) => item.id === id);
  return found ? shape(found) : null;
}

/**
 * 그날 세션 강도에 맞는 플레이리스트.
 * 계획이 없으면 중강도를 기본으로 본다.
 */
export function playlistForIntensity(intensity) {
  const id = PLAYLIST_BY_INTENSITY[intensity] ?? "moderate";
  return playlistById(id);
}

/** 왜 이 플레이리스트인지 한 줄로. */
/**
 * 길이별 롱믹스 목록.
 *
 * 1시간을 고르면 1시간짜리 믹스들이, 2시간을 고르면 2시간짜리들이 나온다.
 * 그날 세션에 맞는 장르를 위로 올리고 표시를 달아 준다.
 */
export function mixListsFor(playlistId) {
  const lists = {};

  for (const duration of DURATIONS) {
    const items = MIX_THEMES.map((theme) => ({
      id: `${theme.id}-${duration.id}`,
      themeId: theme.id,
      label: `${theme.label} ${duration.label}`,
      note: theme.note,
      duration,
      trackCount: trackCountFor(duration.minutes),
      // 오늘 세션 강도에 맞는 장르인가
      recommended: theme.suits.includes(playlistId),
      // 그 믹스에 어떤 곡이 들어가는지. 장르마다 다르다.
      // 길이를 다 채우는 목록은 아니고, 어떤 결인지 보여 주는 대표 곡이다.
      tracks: theme.tracks.map((track) => ({ ...track, links: linksFor(track) })),
      links: {
        youtube: YOUTUBE + encodeURIComponent(`${theme.query} ${duration.label}`),
        spotify: SPOTIFY + encodeURIComponent(theme.query),
      },
    }));

    // 맞는 장르를 먼저, 나머지는 원래 순서대로.
    lists[duration.id] = [
      ...items.filter((item) => item.recommended),
      ...items.filter((item) => !item.recommended),
    ];
  }

  return lists;
}

/** 장르 하나를 id로 찾는다. */
export function themeById(themeId) {
  return MIX_THEMES.find((theme) => theme.id === themeId) ?? null;
}

/**
 * 곡 목록에 검색 링크를 붙인다.
 * AI가 만든 목록이든 내장 목록이든 화면에 나가는 모양은 같다.
 */
export function withLinks(tracks) {
  return tracks.map((track) => ({ ...track, links: linksFor(track) }));
}

/**
 * 그 길이짜리 플레이리스트 영상 목록.
 *
 * 특정 영상을 박아 두면 내려갈 때 죽은 링크가 된다. 대신 각도가 다른
 * 검색 여러 개로 데려간다 — 어느 줄을 눌러도 그 길이의 영상 목록이 열린다.
 */
export function playlistVideosFor(theme, duration) {
  const lengthEn = LENGTH_EN[duration.id] ?? duration.label;

  return PLAYLIST_ANGLES.map((angle) => {
    const query = angle.query(theme.queryKo, duration.label, theme.queryEn, lengthEn);

    return {
      id: `${theme.id}-${duration.id}-${angle.id}`,
      label: `${angle.label} · ${duration.label}`,
      note: angle.note,
      query,
      links: {
        youtube: YOUTUBE + encodeURIComponent(query),
        spotify: SPOTIFY + encodeURIComponent(`${theme.queryEn} workout`),
      },
    };
  });
}

export function reasonFor(day) {
  if (!day) return "오늘 계획된 세션이 없어 중강도 기준으로 골랐습니다.";
  if (day.isRestDay) return "휴식일이라 심박을 올리지 않는 곡으로 골랐습니다.";
  return `${day.focus} · ${day.intensityLabel} 세션에 맞춰 골랐습니다.`;
}
