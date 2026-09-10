# fitness-backend-js

파이썬(FastAPI) 백엔드를 **Express + Drizzle ORM**으로 옮긴 버전입니다.
언어만 바꾼 이식이라 엔드포인트, 요청/응답 모양, 계산 결과가 모두 같습니다.

## 스택

| 파이썬 | JS |
|---|---|
| FastAPI | Express 4 |
| Pydantic | zod |
| SQLAlchemy 2.0 | Drizzle ORM |
| sqlite3 | better-sqlite3 |
| python-multipart | multer |

순수 JavaScript(ESM)입니다. 타입스크립트 빌드 단계가 없습니다.

## 실행

```bash
npm install
npm run dev
```

기본 포트는 **8003**입니다. `PORT` 환경변수로 바꿀 수 있습니다.

DB는 기본적으로 파이썬 쪽과 **같은 파일**(`../fitness-backend/data/fitness.db`)을 봅니다.
두 백엔드를 나란히 띄워 응답을 비교하려고 일부러 이렇게 두었습니다.
따로 쓰려면 `FITNESS_DATABASE_PATH`를 지정하세요.

```bash
FITNESS_DATABASE_PATH=./data/fitness.db npm run dev
npm run seed   # 빈 DB에 기본 데이터 넣기
```

프론트엔드를 JS 백엔드로 붙이려면 `fitness-app/.env`에:

```
VITE_API_BASE_URL=http://127.0.0.1:8003
```

## 사진 식단 분석

`POST /api/nutrition/photo`가 사진에서 음식·양·영양소를 읽습니다.
**Gemini**와 **Claude** 중 자격 증명이 있는 쪽을 자동으로 씁니다.
둘 다 없으면 "직접 적어주세요"라는 안내를 돌려줍니다(오류가 아닙니다).

키는 `.env`에 넣으면 됩니다. `.env.example`을 복사해서 쓰세요.

```
GEMINI_API_KEY=AIza...
```

키는 https://aistudio.google.com/apikey 에서 발급받습니다.
`.env`는 `.gitignore`에 있어 커밋되지 않습니다.

| 환경변수 | 뜻 |
|---|---|
| `GEMINI_API_KEY` | Gemini 키 (`GOOGLE_API_KEY`도 인식) |
| `GEMINI_MODEL` | 모델 바꾸기 (기본 `gemini-2.5-flash`) |
| `ANTHROPIC_API_KEY` | Claude 키 |
| `FITNESS_AI_MODEL` | 쓸 모델 고정 (`gemini` / `claude`) |

Gemini는 SDK 없이 REST로 부릅니다. 쓰는 기능이 많지 않아 의존성을 늘릴 이유가 없고,
파이썬 쪽과 요청 모양을 맞추기도 쉽습니다. 두 모델이 같은 프롬프트와 스키마를 쓰도록
[`src/ai/prompts.js`](src/ai/prompts.js)에 모아 두었습니다. 각자 두면 한쪽만 고쳐집니다.

아는 음식은 음식 DB 값을 쓰고, DB에 없는 음식만 모델이 어림한 값을 씁니다.
텍스트로 직접 적었을 때와 같은 숫자가 나와야 하기 때문입니다.
모델이 어림한 항목은 응답의 `items[].source`가 `"ai"`이고 화면에 `AI 추정`으로 표시됩니다.

## 두 백엔드 응답 비교

```bash
npm run compare
```

두 서버를 먼저 띄워야 합니다(파이썬 8002, JS 8003 기준).

```bash
cd ../fitness-backend && ./.venv/Scripts/python.exe -m uvicorn app.main:app --port 8002
```

24개 시나리오(전 엔드포인트 + 검색·차단·붙여쓴 문장 같은 경계 사례)를 양쪽에 던져
JSON을 통째로 맞춰봅니다. 현재 결과는 **24 / 24 일치**입니다.

비교에서 제외하는 키는 두 가지뿐입니다.

- `cached` — 캐시 적중 여부라 호출 순서에 따라 달라집니다.
- `ai/models`의 `reason` — SDK 설치 안내문이라 런타임마다 달라야 맞습니다.
  (`pip install anthropic` vs `npm install @anthropic-ai/sdk`)

## 이식하면서 신경 쓴 부분

**반올림.** 파이썬 `round()`는 절반일 때 짝수로 붙이고(banker's rounding),
JS `Math.round()`는 무조건 올립니다. `round(2.5)`가 파이썬은 2, JS는 3입니다.
칼로리·매크로 계산에 반올림이 잔뜩 들어가서 그대로 두면 응답이 1씩 어긋납니다.
[`src/core/num.js`](src/core/num.js)의 `pyRound()`가 파이썬 규칙을 따릅니다.

**시각 형식.** SQLAlchemy는 `YYYY-MM-DD HH:MM:SS.ffffff`로 저장하는데
SQLite `CURRENT_TIMESTAMP`는 소수점이 없습니다. 같은 컬럼에 두 형식이 섞이면
안 되니 JS도 삽입할 때 직접 `nowIso()`로 맞춰 넣고, 응답에서는 `isoOut()`으로
`T` 구분자를 붙여 파이썬 직렬화와 같은 모양으로 내보냅니다.

**상수 데이터.** 운동 라이브러리, 음식 영양표, 안전 규칙 같은 고정 데이터는
손으로 옮기면 오타가 나서, 파이썬 소스에서 뽑아 [`src/domain/data/`](src/domain/data/)의
11개 모듈로 생성했습니다. 값이 다를 여지가 없습니다.

**검증 오류 모양.** zod 결과를 FastAPI의 422 `detail` 배열 형태로 바꿔서
프론트엔드가 두 백엔드를 구분하지 않아도 되게 했습니다.
([`src/schemas/index.js`](src/schemas/index.js)의 `parseBody`)

## 구조

```
src/
  app.js              Express 앱
  index.js            서버 시작
  core/               db, cache, num(반올림·시각)
  db/schema.js        Drizzle 테이블 22개
  db/seed.js          기본 데이터
  domain/             계산 로직 (계획, 영양, 안전, 리포트, 게이미피케이션 …)
  domain/data/        파이썬에서 생성한 상수
  ai/                 규칙 기반 / Claude 코치 / 모델 레지스트리
  persistence/crud.js DB 접근
  routes/index.js     엔드포인트 29개
  schemas/index.js    zod 검증
scripts/compare.js    파이썬 ↔ JS 응답 비교
```
