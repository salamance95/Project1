/**
 * 파이썬 백엔드와 JS 백엔드의 응답을 대조한다.
 *
 * 두 서버가 같은 SQLite 파일을 보므로, 읽기 요청은 완전히 같은 JSON이 나와야 한다.
 * 쓰기 요청은 id·시각이 달라지므로 비교에서 제외한다.
 */

const PY = process.env.PY_BASE ?? "http://localhost:8002";
const JS = process.env.JS_BASE ?? "http://localhost:8003";

const PROFILE = {
  goal: "근육량 증가",
  level: "중급",
  frequency: "주 4일",
  duration: "45분~1시간",
  style: "근비대 중심",
  injuries: ["허리"],
  redFlags: ["해당 없음"],
  equipment: ["덤벨", "바벨/랙", "머신/케이블", "철봉"],
  sex: "남성",
  age: 32,
  height: 178,
  weight: 80,
};

const BLOCKED_PROFILE = {
  ...PROFILE,
  redFlags: ["운동 중 흉통이나 호흡 곤란을 겪은 적이 있다"],
};

const CASES = [
  { name: "health", path: "/api/health" },
  { name: "safety/questions", path: "/api/safety/questions" },
  { name: "onboarding/options", path: "/api/onboarding/options" },
  { name: "nutrition/foods", path: "/api/nutrition/foods" },
  { name: "exercises (전체)", path: "/api/exercises" },
  { name: "exercises (검색: 집에서 등)", path: "/api/exercises?q=집에서 할 수 있는 등 운동" },
  { name: "exercises (검색: 무릎 통증)", path: "/api/exercises?q=무릎 아픈데 하체 운동" },
  { name: "exercises/back_squat", path: "/api/exercises/back_squat" },
  { name: "exercises/pullup", path: "/api/exercises/pullup" },
  {
    name: "nutrition/estimate",
    path: "/api/nutrition/estimate",
    method: "POST",
    body: { text: "현미밥 1공기, 닭가슴살 200g, 김치 50g" },
  },
  {
    name: "nutrition/estimate (붙여쓴 문장)",
    path: "/api/nutrition/estimate",
    method: "POST",
    body: { text: "계란 3개와 오트밀 60g, 바나나 1개" },
  },
  {
    name: "recommend-routines",
    path: "/api/recommend-routines",
    method: "POST",
    body: PROFILE,
    // 캐시 적중 여부는 서버마다 다르므로 뺀다.
    ignore: ["cached"],
  },
  {
    name: "recommend-routines (차단)",
    path: "/api/recommend-routines",
    method: "POST",
    body: BLOCKED_PROFILE,
    ignore: ["cached"],
  },
  { name: "plans (목록)", path: "/api/plans?user_id=11" },
  { name: "plans/active", path: "/api/plans/active?user_id=11" },
  { name: "logs (주간)", path: "/api/logs?user_id=11&week_start=2026-08-31" },
  {
    name: "logs (기간)",
    path: "/api/logs?user_id=11&start=2026-08-24&end=2026-09-14",
  },
  { name: "reports/weekly", path: "/api/reports/weekly?user_id=11" },
  { name: "gamification", path: "/api/gamification?user_id=11", ignore: ["cached"] },
  {
    name: "ai/models",
    path: "/api/ai/models",
    // reason은 설치 안내라 런타임마다 달라야 맞다. (pip install / npm install)
    ignore: ["reason"],
  },
  { name: "experiments", path: "/api/experiments?user_id=11" },
  { name: "experiments/results", path: "/api/experiments/results" },
  {
    name: "ai/coach",
    path: "/api/ai/coach",
    method: "POST",
    body: { userId: 11, includeReport: true },
  },
  {
    name: "plans/regenerate (미리보기)",
    path: "/api/plans/regenerate",
    method: "POST",
    body: { userId: 11, apply: false },
  },
];

async function call(base, testCase) {
  const options = { method: testCase.method ?? "GET" };
  if (testCase.body) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(testCase.body);
  }

  const response = await fetch(base + testCase.path, options);
  const text = await response.text();

  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: text };
  }
}

/** 비교에서 뺄 키를 지운다. */
function strip(value, ignore) {
  if (Array.isArray(value)) return value.map((item) => strip(item, ignore));
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (ignore.includes(key)) continue;
      out[key] = strip(value[key], ignore);
    }
    return out;
  }
  return value;
}

/** 첫 번째로 어긋나는 지점을 찾아 알려준다. */
function firstDiff(a, b, path = "") {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}: 길이 ${a.length} vs ${b.length}`;
    for (let i = 0; i < a.length; i += 1) {
      const diff = firstDiff(a[i], b[i], `${path}[${i}]`);
      if (diff) return diff;
    }
    return null;
  }

  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      const diff = firstDiff(a[key], b[key], path ? `${path}.${key}` : key);
      if (diff) return diff;
    }
    return null;
  }

  return `${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
}

let pass = 0;
let fail = 0;

for (const testCase of CASES) {
  const ignore = ["cached", ...(testCase.ignore ?? [])];

  const [py, js] = await Promise.all([call(PY, testCase), call(JS, testCase)]);
  const same =
    py.status === js.status &&
    JSON.stringify(strip(py.body, ignore)) === JSON.stringify(strip(js.body, ignore));

  if (same) {
    pass += 1;
    console.log(`  OK   ${testCase.name}`);
  } else {
    fail += 1;
    console.log(`  DIFF ${testCase.name}  (py ${py.status} / js ${js.status})`);
    const diff = firstDiff(strip(py.body, ignore), strip(js.body, ignore));
    if (diff) console.log(`       ${diff}`);
  }
}

console.log(`\n일치 ${pass} / 불일치 ${fail} / 전체 ${CASES.length}`);
process.exit(fail === 0 ? 0 : 1);
