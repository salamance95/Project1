/** 운동별 수행 방법과 참고 자료(유튜브 영상 + 나무위키). */

import { FALLBACK_GUIDE, GUIDES, VIDEOS } from "./data/exerciseGuide.data.js";

export { GUIDES, VIDEOS };

function mediaLinks(slug, name) {
  const links = [];
  const video = VIDEOS[slug];

  if (video) {
    const [videoId, title] = video;
    links.push({
      kind: "video",
      label: title,
      note: "유튜브에서 열립니다.",
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    });
  }

  links.push({
    kind: "search",
    label: "다른 영상 더 보기",
    note: "유튜브 검색 결과로 이동합니다.",
    url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} 자세`)}`,
    thumbnail: null,
  });

  links.push({
    kind: "wiki",
    label: "나무위키에서 찾기",
    note: "운동 설명과 배경 지식을 볼 수 있습니다.",
    url: `https://namu.wiki/Search?q=${encodeURIComponent(name)}`,
    thumbnail: null,
  });

  return links;
}

export function guideFor(slug, name) {
  const guide = GUIDES[slug] ?? FALLBACK_GUIDE;
  return {
    steps: guide.steps,
    cues: guide.cues,
    mistake: guide.mistake,
    english: guide.en,
    media: mediaLinks(slug, name),
    hasGuide: slug in GUIDES,
  };
}
