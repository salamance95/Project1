/**
 * 자극 부위 인체도의 좌표. 앞·뒤가 같은 실루엣(viewBox 0 0 220 470)을 쓴다.
 *
 * 근육은 각진 다각형보다 곡선이 실제 모양에 가깝다. 그래서 점만 찍어 두고
 * blob()이 닫힌 곡선으로 이어 준다. 좌우 대칭인 근육은 왼쪽만 적고
 * x=110 축으로 뒤집는다 — 데이터가 절반이고 좌우가 어긋날 일이 없다.
 *
 * React가 아니라 순수 데이터라서, 검증용 렌더러가 이 파일만 읽어
 * 같은 그림을 그려 볼 수 있다.
 */

const AXIS = 110;

function round(value) {
  return Math.round(value * 10) / 10;
}

/** 점 목록 → 닫힌 곡선(Catmull-Rom을 3차 베지에로). */
function blob(points) {
  const n = points.length;
  const at = (i) => points[((i % n) + n) % n];
  let d = `M${at(0)[0]},${at(0)[1]}`;
  for (let i = 0; i < n; i += 1) {
    const [x0, y0] = at(i - 1);
    const [x1, y1] = at(i);
    const [x2, y2] = at(i + 1);
    const [x3, y3] = at(i + 2);
    const c1 = [round(x1 + (x2 - x0) / 6), round(y1 + (y2 - y0) / 6)];
    const c2 = [round(x2 - (x3 - x1) / 6), round(y2 - (y3 - y1) / 6)];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${x2},${y2}`;
  }
  return `${d} Z`;
}

function mirror(points) {
  return points.map(([x, y]) => [round(2 * AXIS - x), y]);
}

/** 왼쪽 옆선만 적고 오른쪽은 뒤집어 붙여 몸통 윤곽을 만든다. */
function symmetric(profile) {
  return blob([...profile, ...mirror(profile).reverse()]);
}

// ── 체형 파라미터 ─────────────────────────────────────────────────────
// build = 1 이 기준(근육형). 0에 가까울수록 마른 몸이 된다.
// 성장 화면에서 이 값을 올려 가며 몸이 붙는 모습을 보여준다.
//
// 키는 그대로 두고 "굵기"만 바꾼다. 어깨·팔·허벅지가 가장 많이 변하고
// 허리는 거의 그대로여서, 마를수록 V자가 풀리고 붙을수록 벌어진다.
const LEAN_BY_Y = [
  [0, 1.0], [70, 1.0], [95, 0.78], [135, 0.78], [170, 0.86], [200, 0.97],
  [230, 0.93], [265, 0.88], [300, 0.86], [345, 0.93], [385, 0.86], [470, 0.95],
];

function leanAt(y) {
  for (let i = 1; i < LEAN_BY_Y.length; i += 1) {
    const [y0, k0] = LEAN_BY_Y[i - 1];
    const [y1, k1] = LEAN_BY_Y[i];
    if (y <= y1) return k0 + ((k1 - k0) * (y - y0)) / (y1 - y0);
  }
  return LEAN_BY_Y[LEAN_BY_Y.length - 1][1];
}

/** 몸통 굵기. y 높이에 따라 다르게 줄인다. build=1이면 원래 좌표 그대로. */
function slim(points, build) {
  if (build >= 1) return points;
  return points.map(([x, y]) => {
    const k = leanAt(y);
    return [round(AXIS + (x - AXIS) * (k + (1 - k) * build)), y];
  });
}

// 팔·다리는 몸통과 다르게 다뤄야 한다. 팔은 허리 높이까지 내려오는데,
// 그 높이의 몸통 배율(≈0.97)을 그대로 쓰면 팔이 전혀 얇아지지 않는다.
// 그래서 각 갈래의 중심선을 기준으로 가늘게 만든 뒤, 어깨가 좁아진 만큼
// 몸 쪽으로 당긴다.
const LIMB = {
  arm: { cx: 57.5, attachY: 110 },
  leg: { cx: 91, attachY: 250 },
};

function slimLimb(points, build, part) {
  if (build >= 1) return points;
  const { cx, attachY } = LIMB[part];
  const thin = 0.72 + 0.28 * build;
  const k = leanAt(attachY);
  const pull = k + (1 - k) * build;
  return points.map(([x, y]) => {
    const thinned = cx + (x - cx) * thin;
    return [round(AXIS + (thinned - AXIS) * pull), y];
  });
}

function flex(points, build, part) {
  return part === "torso" ? slim(points, build) : slimLimb(points, build, part);
}

/** 근육 하나. 몸이 얇아지는 만큼 근육도 제 무게중심 쪽으로 오므라든다. */
function shrink(points, build, part) {
  if (build >= 1) return points;
  const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const m = 0.62 + 0.38 * build;
  return flex(
    points.map(([x, y]) => [cx + (x - cx) * m, cy + (y - cy) * m]),
    build,
    part,
  );
}

/** 도형 정의: 좌우 한 쌍. 갈래가 여럿이면 갈래마다 한 그룹씩 넘긴다.
 *  붙어 있는 부위(몸통·팔·다리)에 따라 얇아지는 방식이 다르다. */
const P = (...groups) => ({ mirror: true, groups, part: "torso" });
const ARM = (...groups) => ({ mirror: true, groups, part: "arm" });
const LEG = (...groups) => ({ mirror: true, groups, part: "leg" });

function toPath(shape, build) {
  const out = [];
  for (const group of shape.groups) {
    const pts = shrink(group, build, shape.part);
    out.push(blob(pts));
    if (shape.mirror) out.push(blob(mirror(pts)));
  }
  return out.join(" ");
}

function regionPaths(shapes, build) {
  return Object.fromEntries(
    Object.entries(shapes).map(([id, shape]) => [id, toPath(shape, build)]),
  );
}

// ── 실루엣 ────────────────────────────────────────────────────────────
// 근육이 드러나는 체형으로 고정한다. 설문 값에 따라 달라지지 않는다 —
// 이 그림은 "내 몸"이 아니라 "어느 근육을 쓰는가"를 가리키는 도해다.
// 어깨를 넓히고 허리를 조여야 각 근육이 겹치지 않고 제 자리에 들어간다.
export const HEAD = { cx: 110, cy: 33, rx: 17, ry: 21 };

const NECK = [
  [99, 36], [110, 36], [121, 36], [121, 52], [121, 68], [110, 68], [99, 68], [99, 52],
];
// 승모근 경사 → 어깨(가장 넓다) → 광배근 → 허리(가장 좁다) → 골반
const TORSO = [
  [100, 64], [84, 71], [66, 82], [54, 98], [51, 118],
  [57, 140], [66, 170], [80, 196], [74, 224], [79, 250], [96, 268],
];
const ARM_OUTLINE = [
  [55, 110], [45, 142], [49, 184], [43, 210], [44, 258],
  [58, 262], [60, 212], [68, 184], [74, 146], [79, 116],
];
const LEG_OUTLINE = [
  [73, 246], [68, 288], [72, 326], [80, 352], [72, 382], [83, 418],
  [88, 446], [104, 448], [105, 420], [105, 382], [104, 352],
  [105, 326], [107, 288], [108, 246],
];

/** 굵기 build의 몸 윤곽. 목은 따로 — 몸통에 붙이면 닫는 곡선이 얼굴을 가로지른다. */
export function silhouetteAt(build) {
  return [
    blob(slim(NECK, build)),
    symmetric(slim(TORSO, build)),
    ...[["arm", ARM_OUTLINE], ["leg", LEG_OUTLINE]].map(([part, group]) => {
      const pts = slimLimb(group, build, part);
      return `${blob(pts)} ${blob(mirror(pts))}`;
    }),
  ];
}

export const SILHOUETTE = silhouetteAt(1);

// ── 앞에서 보이는 근육 ────────────────────────────────────────────────
const FRONT_SHAPES = {
  trapUpper: P([[102, 66], [86, 72], [70, 84], [76, 96], [94, 86], [103, 78]]),
  deltSide: P([[70, 80], [58, 93], [51, 114], [55, 133], [66, 131], [69, 102]]),
  deltFront: P([[80, 80], [69, 82], [64, 104], [67, 133], [84, 128], [89, 98]]),
  // 가슴은 복장뼈에서 겨드랑이로 퍼지는 부채꼴.
  chest: P([[106, 94], [88, 92], [72, 100], [66, 118], [74, 146], [98, 152], [106, 146]]),
  serratus: P([[66, 150], [78, 154], [80, 176], [68, 170]]),
  // 복직근은 네 칸씩. 칸이 나뉘어야 "배"가 아니라 복근으로 보인다.
  abs: P(
    [[94, 150], [107, 150], [107, 165], [94, 165]],
    [[93, 168], [107, 168], [107, 183], [93, 183]],
    [[93, 186], [107, 186], [107, 201], [93, 201]],
    [[95, 204], [107, 204], [107, 220], [97, 223]],
  ),
  obliques: P([[76, 158], [91, 154], [93, 202], [86, 214], [82, 198], [73, 176]]),
  hipFlexor: P([[90, 222], [106, 224], [106, 246], [96, 252], [87, 238]]),
  // 넙다리네갈래근: 바깥갈래 · 넙다리곧은근 · 무릎 위 안쪽갈래
  quads: LEG(
    [[70, 258], [87, 258], [87, 300], [83, 332], [75, 328], [69, 296]],
    [[89, 258], [100, 258], [100, 302], [97, 334], [88, 334], [87, 300]],
    [[100, 292], [106, 294], [105, 330], [97, 336], [96, 310]],
  ),
  adductors: LEG([[101, 258], [106, 258], [106, 300], [102, 316], [99, 294]]),
  tibialis: LEG([[84, 364], [94, 362], [96, 404], [91, 418], [85, 406]]),
  biceps: ARM([[54, 118], [72, 118], [70, 150], [64, 174], [52, 170], [48, 140]]),
  forearm: ARM([[49, 190], [64, 188], [57, 216], [55, 244], [46, 242], [45, 212]]),
};

export function frontRegionsAt(build) {
  return regionPaths(FRONT_SHAPES, build);
}

export const FRONT_REGIONS = frontRegionsAt(1);

// ── 뒤에서 보이는 근육 ────────────────────────────────────────────────
const BACK_SHAPES = {
  trapUpper: P([[103, 64], [86, 71], [68, 84], [76, 98], [94, 86], [103, 76]]),
  trapMid: P([[103, 88], [74, 102], [82, 138], [104, 146]]),
  trapLower: P([[104, 148], [84, 140], [97, 194], [105, 196]]),
  deltRear: P([[80, 80], [67, 83], [56, 98], [50, 120], [56, 134], [84, 128], [89, 98]]),
  rotator: P([[80, 94], [95, 100], [93, 118], [78, 114]]),
  teres: P([[74, 120], [90, 122], [88, 138], [72, 134]]),
  rhomboids: P([[93, 102], [105, 106], [105, 142], [89, 136]]),
  lats: P([[64, 120], [86, 130], [102, 146], [104, 194], [84, 200], [68, 168], [59, 140]]),
  erectors: P([[99, 146], [107, 146], [107, 216], [99, 216]]),
  glutes: P([[78, 220], [105, 216], [107, 240], [102, 262], [91, 272], [80, 262], [76, 240]]),
  gluteMed: P([[78, 214], [92, 218], [94, 238], [79, 242]]),
  // 햄스트링은 바깥(넙다리두갈래근)과 안쪽 두 갈래.
  hamstrings: LEG(
    [[70, 270], [87, 270], [86, 308], [82, 336], [75, 332], [69, 300]],
    [[89, 270], [105, 270], [104, 308], [100, 336], [89, 334], [88, 302]],
  ),
  // 종아리도 안팎 두 갈래.
  calves: LEG(
    [[80, 356], [89, 356], [89, 394], [83, 412], [77, 392]],
    [[91, 356], [103, 356], [103, 394], [97, 414], [90, 396]],
  ),
  triceps: ARM([[50, 120], [68, 118], [66, 152], [60, 176], [49, 172], [46, 142]]),
  forearm: ARM([[49, 190], [64, 188], [57, 216], [55, 244], [46, 242], [45, 212]]),
};

export function backRegionsAt(build) {
  return regionPaths(BACK_SHAPES, build);
}

export const BACK_REGIONS = backRegionsAt(1);

/**
 * 영역 id → 색. 해부도처럼 근육마다 색이 다르되, 같은 갈래는 같은 계열로 묶는다.
 * (미는 근육 = 따뜻한 계열, 당기는 근육 = 초록 계열, 하체 = 파랑·분홍 계열)
 *
 * 색은 "어느 근육인가"만 말한다. "그 운동이 쓰는가"는 진하기가 말한다 —
 * 주동근은 진하게, 협응근은 절반, 나머지는 아주 흐리게.
 */
export const REGION_COLOR = {
  // 미는 근육
  chest: "#e2574c",
  deltFront: "#f2994a",
  deltSide: "#f2b544",
  deltRear: "#e08a3c",
  triceps: "#d1603d",
  // 당기는 근육
  lats: "#3d9970",
  trapUpper: "#56b48a",
  trapMid: "#46a077",
  trapLower: "#368a63",
  rhomboids: "#6ec49e",
  teres: "#82cfae",
  rotator: "#a3ded0",
  erectors: "#2f8f8f",
  biceps: "#d4536b",
  forearm: "#a9714b",
  // 몸통
  abs: "#8cc152",
  obliques: "#b5d96a",
  serratus: "#cfd964",
  hipFlexor: "#a97bd6",
  // 하체
  quads: "#4a89dc",
  adductors: "#8aa9e8",
  hamstrings: "#3d6bb5",
  glutes: "#e07ab0",
  gluteMed: "#eda8cd",
  calves: "#d8b73a",
  tibialis: "#c4a33c",
};

/** 영역 id → 화면에 띄울 이름. 그림 위에 마우스를 올리면 보인다. */
export const REGION_LABEL = {
  trapUpper: "상부 승모근",
  trapMid: "중부 승모근",
  trapLower: "하부 승모근",
  deltFront: "전면 삼각근",
  deltSide: "측면 삼각근",
  deltRear: "후면 삼각근",
  chest: "대흉근",
  serratus: "전거근",
  abs: "복직근",
  obliques: "내·외복사근",
  hipFlexor: "장요근",
  quads: "대퇴사두근",
  adductors: "내전근",
  tibialis: "전경골근",
  biceps: "이두근",
  triceps: "삼두근",
  forearm: "전완근",
  rotator: "회전근개",
  teres: "대원근",
  rhomboids: "능형근",
  lats: "광배근",
  erectors: "척추기립근",
  glutes: "대둔근",
  gluteMed: "중둔근",
  hamstrings: "햄스트링",
  calves: "비복근",
};
