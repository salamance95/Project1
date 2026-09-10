/**
 * 운동용 플레이리스트.
 *
 * 음원을 담지 않는다. 곡 정보와 검색 링크만 준다(유튜브·스포티파이에서 열기).
 * BPM은 대략치다. 곡마다 편곡·버전에 따라 조금씩 다르다.
 *
 * 묶는 기준은 그날 세션의 강도다. 세트 사이 호흡이 가빠지는 고강도일에는
 * 빠른 곡이, 회복일에는 느린 곡이 맞는다.
 */

export const PLAYLISTS = [
  {
    id: "high",
    label: "고강도 웨이트",
    bpm: "150~175",
    when: "스쿼트·데드리프트처럼 무겁게 드는 날",
    note: "세트 직전에 템포가 올라오는 곡을 앞에 뒀습니다.",
    tracks: [
      { title: "Till I Collapse", artist: "Eminem", bpm: 171 },
      { title: "POWER", artist: "Kanye West", bpm: 154 },
      { title: "HUMBLE.", artist: "Kendrick Lamar", bpm: 150 },
      { title: "Thunderstruck", artist: "AC/DC", bpm: 134 },
      { title: "Enter Sandman", artist: "Metallica", bpm: 123 },
      { title: "불타오르네 (FIRE)", artist: "BTS", bpm: 152 },
      { title: "How You Like That", artist: "BLACKPINK", bpm: 130 },
      { title: "TOMBOY", artist: "(여자)아이들", bpm: 128 },
    ],
  },
  {
    id: "moderate",
    label: "중강도 볼륨",
    bpm: "120~145",
    when: "세트 수를 채우는 날, 상·하체 볼륨 세션",
    note: "일정한 템포로 세트 리듬을 유지하기 좋은 곡들입니다.",
    tracks: [
      { title: "Can't Hold Us", artist: "Macklemore & Ryan Lewis", bpm: 146 },
      { title: "Believer", artist: "Imagine Dragons", bpm: 125 },
      { title: "Stronger", artist: "Kanye West", bpm: 104 },
      { title: "Physical", artist: "Dua Lipa", bpm: 147 },
      { title: "Dynamite", artist: "BTS", bpm: 114 },
      { title: "Hype Boy", artist: "NewJeans", bpm: 100 },
      { title: "God's Menu (메뉴)", artist: "Stray Kids", bpm: 140 },
      { title: "Lose Yourself", artist: "Eminem", bpm: 171 },
    ],
  },
  {
    id: "cardio",
    label: "유산소 지속주",
    bpm: "145~165",
    when: "걷기·자전거·로잉처럼 같은 속도를 오래 유지할 때",
    note: "걸음·페달 속도를 일정하게 잡아 주는 템포로 골랐습니다.",
    tracks: [
      { title: "Blinding Lights", artist: "The Weeknd", bpm: 171 },
      { title: "Levitating", artist: "Dua Lipa", bpm: 103 },
      { title: "Titanium", artist: "David Guetta, Sia", bpm: 126 },
      { title: "Don't Stop Me Now", artist: "Queen", bpm: 156 },
      { title: "Run Boy Run", artist: "Woodkid", bpm: 145 },
      { title: "Ditto", artist: "NewJeans", bpm: 130 },
      { title: "Feel Special", artist: "TWICE", bpm: 105 },
      { title: "강남스타일", artist: "PSY", bpm: 132 },
    ],
  },
  {
    id: "recovery",
    label: "회복·스트레칭",
    bpm: "60~90",
    when: "휴식일 걷기, 운동 후 스트레칭, 쿨다운",
    note: "심박을 내리는 데 맞춰 느린 곡만 담았습니다.",
    tracks: [
      { title: "Weightless", artist: "Marconi Union", bpm: 60 },
      { title: "Sunset Lover", artist: "Petit Biscuit", bpm: 90 },
      { title: "Night Owl", artist: "Galimatias", bpm: 82 },
      { title: "밤편지", artist: "아이유 (IU)", bpm: 76 },
      { title: "Love Poem", artist: "아이유 (IU)", bpm: 72 },
      { title: "Breathe", artist: "이하이", bpm: 84 },
      { title: "Holocene", artist: "Bon Iver", bpm: 74 },
      { title: "River Flows in You", artist: "이루마", bpm: 68 },
    ],
  },
];

/** 세션 강도 → 플레이리스트. 휴식일은 회복용으로 보낸다. */
export const PLAYLIST_BY_INTENSITY = {
  high: "high",
  moderate: "moderate",
  low: "cardio",
  rest: "recovery",
};

/**
 * 플레이리스트 길이 프리셋.
 * 한 곡씩 고르는 대신 세션 내내 틀어 둘 수 있는 롱믹스를 찾을 때 쓴다.
 */
export const DURATIONS = [
  // 한 곡만 고르고 싶을 때. 세트 사이에 한 곡 틀 때 쓴다.
  { id: "1song", label: "1곡", minutes: 4 },
  { id: "30m", label: "30분", minutes: 30 },
  { id: "1h", label: "1시간", minutes: 60 },
  { id: "2h", label: "2시간", minutes: 120 },
];

/** 설문의 하루 운동 시간 → 기본으로 고를 길이. */
export const DURATION_BY_SESSION = {
  "30분 이하": "30m",
  "45분~1시간": "1h",
  "1시간 30분 이상": "2h",
};

/** 곡 수를 어림할 때 쓰는 평균 곡 길이(분). */
export const AVG_TRACK_MINUTES = 3.5;

/**
 * 롱믹스 장르 목록.
 *
 * 길이(1시간·2시간)를 고르면 이 장르들이 그 길이의 믹스 목록으로 펼쳐진다.
 * 특정 영상을 박아 두지 않는다. 영상은 내려가고 채널은 바뀌므로,
 * 장르와 길이를 조합한 검색으로 연결해 늘 살아 있는 결과를 준다.
 */
export const MIX_THEMES = [
  {
    id: "edm",
    label: "EDM · 페스티벌",
    bpm: "128~150",
    query: "EDM 운동 플레이리스트",
    queryEn: "EDM festival",
    queryKo: "EDM",
    note: "드롭에 맞춰 세트를 시작하기 좋습니다.",
    suits: ["high", "moderate"],
    tracks: [
      { title: "Animals", artist: "Martin Garrix", bpm: 128 },
      { title: "Levels", artist: "Avicii", bpm: 126 },
      { title: "Wake Me Up", artist: "Avicii", bpm: 124 },
      { title: "Don't You Worry Child", artist: "Swedish House Mafia", bpm: 129 },
      { title: "Clarity", artist: "Zedd", bpm: 128 },
      { title: "Turn Down for What", artist: "DJ Snake, Lil Jon", bpm: 100 },
      { title: "The Middle", artist: "Zedd, Maren Morris", bpm: 107 },
      { title: "Titanium", artist: "David Guetta, Sia", bpm: 126 },
    ],
  },
  {
    id: "hiphop",
    label: "힙합 · 트랩",
    bpm: "90~150",
    query: "힙합 운동 플레이리스트 헬스",
    queryEn: "hip hop trap",
    queryKo: "힙합",
    note: "느린 박자에 무겁게 미는 날 잘 맞습니다.",
    suits: ["high"],
    tracks: [
      { title: "SICKO MODE", artist: "Travis Scott", bpm: 155 },
      { title: "DNA.", artist: "Kendrick Lamar", bpm: 140 },
      { title: "Mo Bamba", artist: "Sheck Wes", bpm: 146 },
      { title: "Goosebumps", artist: "Travis Scott", bpm: 130 },
      { title: "Black Skinhead", artist: "Kanye West", bpm: 130 },
      { title: "Nonstop", artist: "Drake", bpm: 154 },
      { title: "Rap God", artist: "Eminem", bpm: 149 },
      { title: "X Gon' Give It To Ya", artist: "DMX", bpm: 95 },
    ],
  },
  {
    id: "rock",
    label: "록 · 메탈",
    bpm: "100~170",
    query: "락 메탈 운동 플레이리스트 헬스",
    queryEn: "rock metal",
    queryKo: "락",
    note: "마지막 세트에서 한 번 더 밀어 올릴 때.",
    suits: ["high"],
    tracks: [
      { title: "Master of Puppets", artist: "Metallica", bpm: 212 },
      { title: "Chop Suey!", artist: "System of a Down", bpm: 127 },
      { title: "Bulls on Parade", artist: "Rage Against the Machine", bpm: 105 },
      { title: "Killing in the Name", artist: "Rage Against the Machine", bpm: 89 },
      { title: "Given Up", artist: "Linkin Park", bpm: 170 },
      { title: "Duality", artist: "Slipknot", bpm: 140 },
      { title: "Back in Black", artist: "AC/DC", bpm: 94 },
      { title: "Eye of the Tiger", artist: "Survivor", bpm: 109 },
    ],
  },
  {
    id: "kpop",
    label: "K-POP 댄스",
    bpm: "120~150",
    query: "케이팝 운동 플레이리스트 헬스장",
    queryEn: "kpop dance",
    queryKo: "케이팝",
    note: "박자가 일정해 세트 리듬 잡기 좋습니다.",
    suits: ["moderate", "cardio"],
    tracks: [
      { title: "MIC Drop", artist: "BTS", bpm: 150 },
      { title: "Kill This Love", artist: "BLACKPINK", bpm: 132 },
      { title: "MANIAC", artist: "Stray Kids", bpm: 150 },
      { title: "Next Level", artist: "aespa", bpm: 140 },
      { title: "SNEAKERS", artist: "ITZY", bpm: 135 },
      { title: "FANCY", artist: "TWICE", bpm: 124 },
      { title: "Lovesick Girls", artist: "BLACKPINK", bpm: 120 },
      { title: "Feel My Rhythm", artist: "Red Velvet", bpm: 130 },
    ],
  },
  {
    id: "pop",
    label: "팝 · 리믹스",
    bpm: "100~140",
    query: "팝송 운동 플레이리스트 리믹스",
    queryEn: "pop remix",
    queryKo: "팝송",
    note: "익숙한 곡이라 오래 틀어도 질리지 않습니다.",
    suits: ["moderate", "cardio"],
    tracks: [
      { title: "Don't Start Now", artist: "Dua Lipa", bpm: 124 },
      { title: "Uptown Funk", artist: "Mark Ronson, Bruno Mars", bpm: 115 },
      { title: "As It Was", artist: "Harry Styles", bpm: 174 },
      { title: "Flowers", artist: "Miley Cyrus", bpm: 118 },
      { title: "bad guy", artist: "Billie Eilish", bpm: 135 },
      { title: "Shut Up and Dance", artist: "WALK THE MOON", bpm: 128 },
      { title: "Sugar", artist: "Maroon 5", bpm: 120 },
      { title: "Shape of You", artist: "Ed Sheeran", bpm: 96 },
    ],
  },
  {
    id: "running",
    label: "러닝 스테디 비트",
    bpm: "150~170",
    query: "러닝 플레이리스트 BPM 일정한",
    queryEn: "running steady beat",
    queryKo: "러닝",
    note: "속도를 일정하게 유지해야 하는 유산소용.",
    suits: ["cardio"],
    tracks: [
      { title: "Runaway (U & I)", artist: "Galantis", bpm: 126 },
      { title: "Shivers", artist: "Ed Sheeran", bpm: 141 },
      { title: "Save Your Tears", artist: "The Weeknd", bpm: 118 },
      { title: "Something Just Like This", artist: "The Chainsmokers, Coldplay", bpm: 103 },
      { title: "Stronger (What Doesn't Kill You)", artist: "Kelly Clarkson", bpm: 116 },
      { title: "High Hopes", artist: "Panic! At The Disco", bpm: 82 },
      { title: "Centuries", artist: "Fall Out Boy", bpm: 88 },
      { title: "On My Way", artist: "Alan Walker", bpm: 86 },
    ],
  },
  {
    id: "lofi",
    label: "로파이 · 칠",
    bpm: "70~95",
    query: "로파이 플레이리스트 스트레칭",
    queryEn: "lofi chill",
    queryKo: "로파이",
    note: "쿨다운과 스트레칭에 맞는 낮은 템포.",
    suits: ["recovery"],
    tracks: [
      { title: "Aruarian Dance", artist: "Nujabes", bpm: 90 },
      { title: "Feather", artist: "Nujabes", bpm: 89 },
      { title: "Slow Dancing in the Dark", artist: "Joji", bpm: 89 },
      { title: "Show Me How", artist: "Men I Trust", bpm: 95 },
      { title: "Movie", artist: "Tom Misch", bpm: 100 },
      { title: "Bloom", artist: "ODESZA", bpm: 100 },
      { title: "White Gloves", artist: "Khruangbin", bpm: 95 },
      { title: "Affection", artist: "Jinsang", bpm: 85 },
    ],
  },
  {
    id: "piano",
    label: "피아노 · 뉴에이지",
    bpm: "60~90",
    query: "피아노 뉴에이지 휴식 플레이리스트",
    queryEn: "piano new age",
    queryKo: "피아노",
    note: "휴식일 걷기와 정리 운동에 좋습니다.",
    suits: ["recovery"],
    tracks: [
      { title: "Kiss the Rain", artist: "이루마", bpm: 66 },
      { title: "Nuvole Bianche", artist: "Ludovico Einaudi", bpm: 60 },
      { title: "Experience", artist: "Ludovico Einaudi", bpm: 72 },
      { title: "Comptine d'un autre été", artist: "Yann Tiersen", bpm: 100 },
      { title: "Gymnopédie No.1", artist: "Erik Satie", bpm: 60 },
      { title: "Merry Christmas Mr. Lawrence", artist: "류이치 사카모토", bpm: 70 },
      { title: "Summer", artist: "히사이시 조", bpm: 80 },
      { title: "Clair de Lune", artist: "Claude Debussy", bpm: 66 },
    ],
  },
];

/**
 * 같은 길이라도 찾는 각도가 여러 개다.
 * 한 줄에 하나씩, 서로 다른 결의 플레이리스트 영상으로 데려간다.
 * 특정 영상 ID를 박지 않는다 — 영상은 내려가고 채널은 바뀐다.
 */
export const PLAYLIST_ANGLES = [
  {
    id: "nonstop",
    label: "논스톱 연속듣기",
    note: "끊김 없이 한 번에 도는 국내 채널 영상",
    query: (genre, length) => `${genre} 운동 플레이리스트 ${length} 연속듣기`,
  },
  {
    id: "gym",
    label: "헬스장 브금",
    note: "웨이트 세션에 흔히 트는 구성",
    query: (genre, length) => `헬스장 브금 ${genre} ${length}`,
  },
  {
    id: "english",
    label: "영문 채널 믹스",
    note: "해외 채널의 Gym Mix. 곡 폭이 넓습니다",
    query: (genre, length, en, lengthEn) => `${en} gym workout mix ${lengthEn}`,
  },
  {
    id: "cardio",
    label: "러닝·유산소용",
    note: "속도를 유지하기 좋은 일정한 템포",
    query: (genre, length) => `${genre} 러닝 플레이리스트 ${length}`,
  },
  {
    id: "noads",
    label: "광고 없는 롱플레이",
    note: "중간 광고 없이 길게 트는 영상",
    query: (genre, length) => `${genre} ${length} 광고 없는 플레이리스트`,
  },
  {
    id: "radio",
    label: "라이브 스트림",
    note: "24시간 도는 라디오. 길이 상관없이 틀어둘 때",
    query: (genre, length, en) => `${en} workout radio live stream`,
  },
];

/** 영문 검색에 쓸 길이 표기. */
export const LENGTH_EN = {
  "1song": "1 song",
  "30m": "30 minutes",
  "1h": "1 hour",
  "2h": "2 hours",
};
