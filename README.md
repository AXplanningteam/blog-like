# blog-like

Super.so 노션 블로그용 **이모지 반응 버튼**. 외부 유료 서비스 없이 직접 구현했고, 데이터는 우리 소유입니다.

```
  ❤️ 12   👏 7   👍 24   ❗ 1   🔥 9
```

```
   노션 포스트
        │  /embed 블록
        ▼
  ┌───────────────────────┐      ┌──────────────────────────┐
  │  GitHub Pages         │ ───▶ │  Cloudflare Worker + D1  │
  │  like/index.html      │ ◀─── │  카운트 저장 (우리 DB)     │
  └───────────────────────┘      └──────────────────────────┘
```

## 비용

**둘 다 무료 플랜이고 신용카드가 필요 없습니다.**

| | 무료 한도 | 우리 블로그 기준 |
|---|---|---|
| GitHub Pages | 월 100GB 전송 | HTML 6KB짜리라 사실상 무제한 |
| Cloudflare Workers | 하루 요청 100,000건 | 하루 방문 3만 넘어야 걸림 |
| Cloudflare D1 | 하루 읽기 500만 행 / 쓰기 10만 행, 저장 5GB | 하루 반응 3만 개까지 여유 |

---

## 동작

- 이모지 5개(`❤️ 👏 👍 ❗ 🔥`)를 한 줄로 놓고, 각 옆에 **숫자를 텍스트로** 표시
- **토글식**. 한 번 더 누르면 취소됩니다. 여러 종류를 동시에 누를 수 있습니다
- 내가 누른 건 파랗게 표시됩니다
- 중복 방지는 `SHA-256(SALT + IP + User-Agent)` 해시로 하며 **IP 원본은 저장하지 않습니다**
- 같은 IP라도 브라우저가 다르면 별개로 셉니다 (사무실 공용 IP 대응)
- 클릭하면 화면이 먼저 반응하고 서버 응답으로 보정합니다
- 다크모드 자동 대응

### 이모지 바꾸기

두 곳을 **똑같이** 맞춰야 합니다.

1. `like/index.html` 의 `EMOJIS` 배열 (아이콘·순서·툴팁 문구)
2. `worker/wrangler.toml` 의 `REACTIONS` (key 목록)

개수는 3개든 6개든 상관없습니다.

---

## 폴더 구조

```
blog-like/
├── like/index.html              ← GitHub Pages로 서빙되는 버튼 UI
├── worker/
│   ├── src/index.js             ← API (Cloudflare Worker)
│   ├── schema.sql               ← D1 테이블 정의
│   ├── wrangler.toml            ← 배포 설정
│   └── test/worker.test.mjs     ← 로컬 테스트 (npm test)
└── .github/workflows/deploy-worker.yml   ← main 푸시 시 자동 배포
```

---

## 지금 바로 모양 보기

Worker 없이도 `like/index.html` 을 브라우저로 그냥 열면 **미리보기 모드**로 떠서 눌러볼 수 있습니다. (숫자는 저장 안 됨)

---

## 설치

### 1. 레포 만들기

이 폴더를 그대로 GitHub에 올립니다. (예: `daou-dev/blog-like`, **Public**)

### 2. Cloudflare 준비

```bash
cd worker
npm install
npx wrangler login          # 브라우저에서 Cloudflare 로그인 (없으면 무료 가입)
npx wrangler d1 create blog-like
```

출력에 나오는 `database_id` 를 `worker/wrangler.toml` 의 해당 자리에 붙여넣습니다. 그다음:

```bash
npm run db:init                 # 테이블 생성
npx wrangler secret put SALT    # 아무 랜덤 문자열 입력
npm run deploy
```

배포가 끝나면 주소가 나옵니다:

```
https://blog-like.<우리계정서브도메인>.workers.dev
```

### 3. 버튼 UI에 Worker 주소 넣기

`like/index.html` 의 이 줄을 방금 나온 주소로 바꿉니다. (끝에 슬래시 없이)

```js
var API = "https://blog-like.<서브도메인>.workers.dev";
```

### 4. GitHub Pages 켜기

레포 **Settings → Pages** → Source `Deploy from a branch` → `main` / `/ (root)` → Save.

1~2분 뒤 주소가 생깁니다:

```
https://daou-dev.github.io/blog-like/like/
```

### 5. CORS 주소 맞추기

`worker/wrangler.toml` 의 `ALLOWED_ORIGINS` 가 4번 주소의 **도메인**과 같은지 확인하고, 바꿨으면 `npm run deploy` 다시 한 번.

```toml
ALLOWED_ORIGINS = "https://daou-dev.github.io"
```

### 6. 확인

```
https://daou-dev.github.io/blog-like/like/?id=test
```

눌러보고 새로고침해도 숫자가 남아 있으면 성공입니다.

---

## 포스팅할 때

노션 포스트 맨 아래에서:

1. `/embed` → **Embed** 선택
2. 주소 붙여넣기 (`?id=` 뒤만 글마다 다르게)

```
https://daou-dev.github.io/blog-like/like/?id=2026-onboarding
```

3. 블록 높이를 100px 정도로 줄이기

### id 규칙

- 영문 소문자 + 숫자 + 하이픈 권장 (`2026-onboarding`, `q3-retro`)
- 한글도 됩니다. `post-1i4f1so` 같은 고유값으로 자동 변환되고 항상 같은 값이 유지되지만, DB에서 알아보기 어렵습니다
- **id가 겹치면 두 글의 반응이 합쳐집니다**
- `?id=` 를 빼면 버튼 대신 안내 문구가 나옵니다 (전 글 카운트가 섞이는 사고 방지)

### 주소 옵션

| 옵션 | 예시 | 설명 |
|---|---|---|
| `id` | `?id=q3-retro` | **필수.** 글 구분자 |
| `label` | `&label=재밌게 보셨나요` | 이모지 위 문구 |
| `label` 빈 값 | `&label=` | 문구 숨기기 |

---

## API

| 메서드 | 경로 | 응답 |
|---|---|---|
| `GET` | `/api/reactions?id=<id>` | `{ id, counts: {heart:3,...}, mine: ["heart"] }` |
| `POST` | `/api/reactions?id=<id>&emoji=<key>` | 토글 후 같은 형태 |
| `GET` | `/api/reactions/bulk?ids=a,b,c` | 여러 글 한 번에 (최대 50개) |
| `GET` | `/health` | `{ ok: true, emojis: [...] }` |

`bulk` 는 나중에 목록 페이지에 반응 수를 띄우고 싶을 때 쓰려고 미리 넣어뒀습니다.

---

## 운영

```bash
cd worker
npm run db:top     # 반응 많은 순으로 30개
npm test           # 로컬 테스트 (Cloudflare 계정 없이 실행됨)
```

테스트는 현재 **20개 케이스 통과**합니다. 카운트 증감, 토글, 여러 이모지 동시 선택, 사용자별 분리, 같은 IP 다른 브라우저 구분, 글별 독립, 한글 id 충돌 방지, 음수 방지, bulk 조회, 허용 목록 밖 이모지 거부, 잘못된 요청 처리, CORS 차단, preflight까지 확인합니다.

---

## 자동 배포 (선택)

`main` 에 푸시하면 Worker가 자동 배포됩니다. 쓰려면 레포 **Settings → Secrets and variables → Actions** 에 추가하세요.

- `CLOUDFLARE_API_TOKEN` — Cloudflare → My Profile → API Tokens → `Edit Cloudflare Workers` 템플릿
- `CLOUDFLARE_ACCOUNT_ID` — Workers 대시보드 우측에 표시됨

안 쓸 거면 `.github/workflows/deploy-worker.yml` 을 지우고 `npm run deploy` 로 수동 배포하면 됩니다.

---

## 문제 해결

**"미리보기 모드"라고 뜸**
→ `like/index.html` 의 `API` 주소를 아직 안 바꾼 겁니다.

**"반응 서버에 연결하지 못했습니다"**
→ `API` 주소와 `ALLOWED_ORIGINS` 를 확인하세요. 브라우저 콘솔에 CORS 에러가 찍힙니다.

**`D1_ERROR: no such table`**
→ `npm run db:init` 을 안 돌린 겁니다.

**특정 이모지만 400 에러**
→ `like/index.html` 의 `EMOJIS` key 와 `wrangler.toml` 의 `REACTIONS` 가 어긋난 겁니다.

**노션 편집기엔 보이는데 블로그엔 안 보임**
→ Super 대시보드에서 Sync/Refresh 한 번.

---

## 참고

- [Cloudflare Workers 요금제](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare D1 요금제](https://developers.cloudflare.com/d1/platform/pricing/)
- [Wrangler CLI 문서](https://developers.cloudflare.com/workers/wrangler/)
- [GitHub Pages 시작하기](https://docs.github.com/en/pages/quickstart)
