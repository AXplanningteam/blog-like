# blog-like

daoukiwoom.ai(Super.so + 노션) 콘텐츠용 **이모지 반응 버튼**.
외부 유료 서비스 없이 직접 구현했고, 데이터는 우리 소유입니다.

```
  ❤️ 12   👏 7   👍 24   ❗ 1   🔥 9
```

---

<a id="toc"></a>

## 목차

1. [전체 구조](#s1)
2. [비용](#s2)
3. [동작](#s3) · [이모지 바꾸기](#s3-emoji) · [id 규칙](#s3-id)
4. [폴더 구조](#s4)
5. [설치](#s5) — [D1](#s5-d1) · [Pages](#s5-pages) · [CORS](#s5-cors) · [Super](#s5-super)
6. [글을 올릴 때](#s6)
7. [API](#s7)
8. [운영](#s8)
9. [자동 배포](#s9)
10. [문제 해결](#s10)
11. [알려진 한계](#s11)
12. [참고](#s12)

---

<a id="s1"></a>

## 1. 전체 구조

반응이 표시되는 곳이 **두 군데**입니다.

```
[상세 페이지]  daoukiwoom.ai/contents/글-슬러그
     │
     │  Super Code Injection(Body) 스크립트가 iframe 을 자동 삽입
     ▼
   axplanningteam.github.io/blog-like/like/?id=글-슬러그
     │                                          (GitHub Pages)
     │  POST /api/reactions   ← 누르면 토글
     ▼
   blog-like.blog-like-worker.workers.dev   (Cloudflare Worker)
     │
     ▼
   D1 (reactions / voters)                  ← 우리 DB


[목록 페이지]  daoukiwoom.ai/research · /ai-tips · …
     │
     │  같은 Body 스크립트가 카드마다 반응 수를 칩으로 표시
     │  GET /api/reactions/bulk?ids=a,b,c    ← 카드 전체를 한 번에
     ▼
   같은 Worker → 같은 D1
```

> **중요** — 상세 페이지의 iframe 은 **자동 삽입**됩니다. 노션에 embed 블록을
> 넣거나 `?id=` 를 손으로 적는 작업은 없습니다. Super 의 Body 스크립트가
> 페이지 경로에서 id 를 만들어 넣습니다. ([6장](#s6) 참고)

<sub>[↑ 목차](#toc)</sub>

---

<a id="s2"></a>

## 2. 비용

**둘 다 무료 플랜이고 신용카드가 필요 없습니다.**

| | 무료 한도 | 우리 기준 |
|---|---|---|
| GitHub Pages | 월 100GB 전송 | HTML 6KB짜리라 사실상 무제한 |
| Cloudflare Workers | 하루 요청 100,000건 | 하루 방문 3만 넘어야 걸림 |
| Cloudflare D1 | 하루 읽기 500만 행 / 쓰기 10만 행, 저장 5GB | 하루 반응 3만 개까지 여유 |

목록 페이지는 카드가 몇 개든 `bulk` 로 **요청 1건**입니다.

<sub>[↑ 목차](#toc)</sub>

---

<a id="s3"></a>

## 3. 동작

**상세 페이지**

- 이모지 5개를 한 줄로 놓고 각 옆에 숫자를 표시
- **토글식.** 한 번 더 누르면 취소됩니다. 여러 종류를 동시에 누를 수 있습니다
- 내가 누른 건 파랗게 표시됩니다
- 클릭하면 화면이 먼저 반응하고 서버 응답으로 보정합니다
- 다크모드 자동 대응

**목록 페이지**

- 카드 하단(카테고리 → 제목 → 날짜 → **반응**)에 칩으로 표시
- 반응이 0건인 카드는 아무것도 표시하지 않습니다 (카드 높이 흔들림 방지)
- 내가 누른 반응은 테두리·배경이 파랗게 강조됩니다
- 읽기 전용입니다. 목록에서는 누를 수 없습니다
- 상세 페이지에서 누르고 목록으로 돌아오면 **새로고침 없이 반영**됩니다

**중복 방지**

- `SHA-256(SALT + IP + User-Agent)` 해시를 저장하며 **IP 원본은 저장하지 않습니다**
- 같은 IP라도 브라우저가 다르면 별개로 셉니다 (사무실 공용 IP 대응)

<a id="s3-emoji"></a>

### 이모지 바꾸기

**세 곳**을 똑같이 맞춰야 합니다. 한 곳만 바꾸면 그 이모지가 400 에러를 냅니다.

| 위치 | 무엇 |
|---|---|
| `like/index.html` 의 `EMOJIS` | 아이콘 · 순서 · 툴팁 문구 |
| `worker/wrangler.toml` 의 `REACTIONS` | key 목록 |
| Super → Code Injection → Body 의 `EMOJIS` | 목록 표시용 key · 아이콘 |

현재 key (2026-08):

```
heart, clap, thumbsup, exclaim, fire
```

개수는 3개든 6개든 상관없습니다. **다만 이미 데이터가 쌓인 뒤에 key 를 바꾸면
기존 숫자와 연결이 끊어집니다.** 아이콘(`char`)만 바꾸는 것은 안전합니다.

<a id="s3-id"></a>

### id 규칙

id 는 Worker 의 `normalizeId()` 가 정규화해 저장합니다. 영문/숫자/하이픈/언더바만
남기고, 그 과정에서 글자가 날아가면(한글 등) 원본 해시를 뒤에 붙입니다.

```
리포트-2026년-6월호-에이전틱-진화-…      →  2026--6-tzcfj8
활용팁-gemini-할루시네이션-저감-튜토리얼   →  gemini-1wu81io
```

- **정규화는 Worker가 합니다.** 클라이언트가 무엇을 보내든 서버가 같은 값으로 만듭니다
- 그래서 상세 페이지와 목록 페이지가 같은 슬러그를 보내면 자동으로 같은 id 가 됩니다
- **id가 겹치면 두 글의 반응이 합쳐집니다**
- `?id=` 를 빼면 버튼 대신 안내 문구가 나옵니다 (전 글 카운트가 섞이는 사고 방지)

> ⚠️ **글 제목(슬러그)이 바뀌면 id 도 바뀌어 반응이 초기화됩니다.** 구조적 한계입니다.
> ([11장](#s11) 참고)

<sub>[↑ 목차](#toc)</sub>

---

<a id="s4"></a>

## 4. 폴더 구조

```
blog-like/
├── like/index.html                        ← GitHub Pages 로 서빙되는 버튼 UI
├── worker/
│   ├── src/index.js                       ← API (Cloudflare Worker)
│   ├── schema.sql                         ← D1 테이블 정의 (reactions / voters)
│   ├── wrangler.toml                      ← 배포 설정 · REACTIONS · ALLOWED_ORIGINS
│   ├── package.json
│   └── test/worker.test.mjs               ← 로컬 테스트 (npm test)
├── .github/workflows/deploy-worker.yml    ← main 푸시 시 Worker 자동 배포
├── .gitignore
└── README.md
```

**이 저장소에 없지만 시스템의 일부인 것**

Super 의 Code Injection 코드(Body / CSS)는 Super 대시보드에만 있습니다.
저장소에 사본을 두는 것을 권합니다 — 없으면 Super 계정에 접근 못 하는 사람은
시스템을 이해할 수 없습니다.

```
super/
├── body.html      ← Code Injection → Body 사본
└── list.css       ← Code Injection → CSS 중 .aihub-likes 부분 사본
```

**`.gitignore` 에 넣을 것**

```
.omc/
node_modules/
```

<sub>[↑ 목차](#toc)</sub>

---

<a id="s5"></a>

## 5. 설치

> 이미 구축되어 운영 중입니다. 아래는 **처음부터 다시 만들 때** 또는
> 구조를 이해할 때 보는 절차입니다.

### 지금 바로 모양만 보기

Worker 없이도 `like/index.html` 을 브라우저로 그냥 열면 **미리보기 모드**로
떠서 눌러볼 수 있습니다. (숫자는 저장 안 됨)

<a id="s5-d1"></a>

### 5-1. Cloudflare Worker + D1

```bash
cd worker
npm install
npx wrangler login              # 브라우저에서 Cloudflare 로그인
npx wrangler d1 create blog-like
```

출력의 `database_id` 를 `worker/wrangler.toml` 에 붙여넣고:

```bash
npm run db:init                 # 테이블 생성
npx wrangler secret put SALT    # 아무 랜덤 문자열. 저장소에 커밋하지 않습니다
npm run deploy
```

배포가 끝나면 주소가 나옵니다.

```
https://blog-like.blog-like-worker.workers.dev
```

<a id="s5-pages"></a>

### 5-2. GitHub Pages

1. `like/index.html` 의 `API` 를 위 주소로 (끝에 슬래시 없이)

```js
var API = "https://blog-like.blog-like-worker.workers.dev";
```

2. 저장소 **Settings → Pages**

| 항목 | 값 |
|---|---|
| Source | Deploy from a branch |
| Branch | `main` / `/ (root)` |

3. 1~2분 뒤 주소가 생깁니다

```
https://axplanningteam.github.io/blog-like/like/
```

> 저장소 루트(`/blog-like/`)는 `index.html` 이 없어 404 가 정상입니다.
> 동작 확인은 반드시 `/blog-like/like/` 로 하세요.

<a id="s5-cors"></a>

### 5-3. CORS 허용 목록

**두 도메인이 모두 들어가야 합니다.**

```toml
ALLOWED_ORIGINS = "https://axplanningteam.github.io,https://daoukiwoom.ai"
```

| 도메인 | 왜 필요한가 |
|---|---|
| `axplanningteam.github.io` | 상세 페이지의 iframe 이 Worker 를 호출 |
| `daoukiwoom.ai` | 목록 페이지가 `bulk` 를 직접 호출 |

하나라도 빠지면 그쪽 기능만 조용히 죽습니다. 확인:

```bash
curl -s -D- -o /dev/null -H "Origin: https://daoukiwoom.ai" \
  "https://blog-like.blog-like-worker.workers.dev/health"
```

`access-control-allow-origin: https://daoukiwoom.ai` 가 나와야 합니다.
`null` 이면 허용 목록에 없는 것입니다.

<a id="s5-super"></a>

### 5-4. Super Code Injection

**Settings → Code Injection**

| 위치 | 내용 |
|---|---|
| **Body** | 상세 iframe 자동 삽입 + 목록 반응 수 표시 (한 스크립트) |
| **CSS** | `.aihub-likes` 칩 스타일 |

Body 스크립트가 하는 일:

1. `/contents/…` 경로면 `article.notion-root` 안, "여러분과 함께 완성됩니다"
   문구 바로 위에 iframe 삽입 (문구가 없으면 본문 맨 아래)
2. `.notion-collection-card` 를 찾아 카드마다 반응 수 칩 삽입
3. SPA 경로 변화를 감지해 목록으로 돌아올 때 다시 조회

CSS 에서 **`order: 4` 를 빼지 마세요.** 카드 내부가 flex + order 구조라
order 가 없으면 반응 칩이 제목 위로 올라갑니다.

<sub>[↑ 목차](#toc)</sub>

---

<a id="s6"></a>

## 6. 글을 올릴 때

**할 일이 없습니다.**

노션 CONTENTS DB 에 글을 올리면 Super 가 렌더링하고, Body 스크립트가
경로에서 id 를 만들어 반응 버튼을 자동으로 붙입니다. 임베드 블록도,
`?id=` 입력도 필요 없습니다.

> 초기 버전은 글마다 `/embed` 블록에 `?id=` 를 손으로 넣는 방식이었습니다.
> 2026-08 에 자동 삽입으로 바뀌었습니다. 옛 문서를 보고 embed 블록을
> 추가하면 **반응 버튼이 두 개** 나옵니다.

### 주소 옵션 (직접 열어 테스트할 때만)

| 옵션 | 예시 | 설명 |
|---|---|---|
| `id` | `?id=q3-retro` | 글 구분자 |
| `label` | `&label=재밌게 보셨나요` | 이모지 위 문구 |
| `label` 빈 값 | `&label=` | 문구 숨기기 |

<sub>[↑ 목차](#toc)</sub>

---

<a id="s7"></a>

## 7. API

| 메서드 | 경로 | 응답 |
|---|---|---|
| `GET` | `/api/reactions?id=<id>` | `{ id, counts: {heart:3,…}, mine: ["heart"] }` |
| `POST` | `/api/reactions?id=<id>&emoji=<key>` | 토글 후 같은 형태 |
| `GET` | `/api/reactions/bulk?ids=a,b,c` | 위 형태의 **배열** (최대 50개) |
| `GET` | `/health` | `{ ok: true, emojis: [...] }` |

- 허용된 이모지는 값이 0이라도 `counts` 에 key 가 존재합니다
- `bulk` 는 **목록 페이지가 실제로 사용 중**입니다 (요청 1건으로 카드 전체)
- `bulk` 도 `mine` 을 함께 돌려주므로 목록에서 "내가 누른 것" 강조가 됩니다

<sub>[↑ 목차](#toc)</sub>

---

<a id="s8"></a>

## 8. 운영

```bash
cd worker
npm run db:top     # 반응 많은 순으로 30개
npm test           # 로컬 테스트 (Cloudflare 계정 없이 실행됨)
```

`wrangler` 없이 브라우저만으로 DB 를 보려면
**Cloudflare 대시보드 → Storage & Databases → D1 → blog-like → Console** 에서
SQL 을 직접 실행할 수 있습니다.

```sql
SELECT post_id, emoji, count FROM reactions ORDER BY count DESC;
```

테스트 데이터 정리 (`voters` 도 같이 지워야 그 브라우저의 "누름" 상태가 사라집니다):

```sql
DELETE FROM reactions WHERE post_id = 'test';
DELETE FROM voters   WHERE post_id = 'test';
```

> 파괴적인 SQL 전에 콘솔에서 `/bookmark` 를 입력해 두면 되돌릴 지점이 생깁니다.

테스트는 현재 **20개 케이스 통과**합니다. 카운트 증감, 토글, 여러 이모지 동시
선택, 사용자별 분리, 같은 IP 다른 브라우저 구분, 글별 독립, 한글 id 충돌 방지,
음수 방지, bulk 조회, 허용 목록 밖 이모지 거부, 잘못된 요청 처리, CORS 차단,
preflight 까지 확인합니다.

<sub>[↑ 목차](#toc)</sub>

---

<a id="s9"></a>

## 9. 자동 배포

`main` 에 푸시하면 Worker 가 자동 배포됩니다. 쓰려면
**Settings → Secrets and variables → Actions** 에 추가하세요.

- `CLOUDFLARE_API_TOKEN` — Cloudflare → My Profile → API Tokens → `Edit Cloudflare Workers` 템플릿
- `CLOUDFLARE_ACCOUNT_ID` — Workers 대시보드 우측에 표시됨

안 쓸 거면 `.github/workflows/deploy-worker.yml` 을 지우고 `npm run deploy` 로
수동 배포하면 됩니다.

### ⚠️ 대시보드에서 바꾼 변수는 되돌아갑니다

Cloudflare 대시보드에서 `ALLOWED_ORIGINS` 같은 변수를 수정하면 즉시 적용되지만,
**다음번 `npm run deploy` 때 `wrangler.toml` 값으로 덮어써집니다.**
대시보드에서 급히 고쳤다면 `wrangler.toml` 도 같이 고쳐 커밋해 두세요.

### 대시보드에서 배포하는 법

Worker → **Deployments** → Versions 목록에서 최신 버전의 `⋯` → **Promote version**.
`Split version` 은 트래픽을 나눠 보내는 점진 배포이므로 쓰지 마세요.
변수만 저장하면 새 버전이 생기기만 하고 배포는 되지 않습니다.

<sub>[↑ 목차](#toc)</sub>

---

<a id="s10"></a>

## 10. 문제 해결

<details id="q-preview">
<summary><b>"미리보기 모드"라고 뜸</b></summary>

`like/index.html` 의 `API` 주소를 아직 안 바꾼 겁니다.
`var DEMO = API.indexOf("<") !== -1` 조건이라, 주소에 `<` 가 남아 있으면 데모로 뜹니다.
</details>

<details id="q-404">
<summary><b>상세 페이지의 반응 버튼이 빈칸 (iframe 404)</b></summary>

GitHub Pages 가 발행돼 있지 않습니다. 브라우저에서 직접 확인하세요.

```
https://axplanningteam.github.io/blog-like/like/?id=test
```

**저장소를 Private 으로 바꾸면 Pages 가 발행 취소되고, Public 으로 되돌려도
자동으로 살아나지 않습니다.** Settings → Pages 에서 Source 를 다시 저장해
빌드를 새로 돌려야 합니다. (브랜치를 바꿔 Save → 다시 main 으로 Save)

파일이 브랜치에 있는지도 확인:

```
https://raw.githubusercontent.com/AXplanningteam/blog-like/main/like/index.html
```
</details>

<details id="q-cors">
<summary><b>목록 페이지에 숫자가 안 뜬다</b></summary>

콘솔(F12)을 먼저 보세요.

- `blocked by CORS policy` / `Access-Control-Allow-Origin: null`
  → `ALLOWED_ORIGINS` 에 `https://daoukiwoom.ai` 가 없습니다 ([5-3](#s5-cors))
- `[반응] bulk 조회 실패: HTTP 404` → Worker 에 `/bulk` 라우트가 없음
- 아무 로그도 없음 → Body 스크립트가 안 들어갔습니다.
  `document.querySelectorAll('.aihub-likes').length` 로 확인
- 숫자는 뜨는데 위치가 이상함 → CSS 에 `order: 4` 가 빠졌습니다
</details>

<details id="q-mismatch">
<summary><b>상세엔 숫자가 있는데 목록은 0이다</b></summary>

id 가 어긋난 것입니다. 콘솔에서 두 값을 비교하세요.

```js
__likeId('/contents/글-슬러그')     // 목록이 쓰는 id
```

`npm run db:top` 또는 D1 콘솔의 `post_id` 와 같아야 합니다.
다르면 Body 스크립트의 `normalizeId` 가 `worker/src/index.js` 와 어긋난 것입니다.
**둘은 항상 같아야 합니다.**
</details>

<details id="q-stale">
<summary><b>반응을 누르고 목록에 와도 옛 숫자가 보인다</b></summary>

Body 스크립트가 SPA 경로 변화를 감지해 다시 조회합니다.
그 로직이 없는 옛 버전이면 새로고침해야 반영됩니다.

같은 페이지에 **머무는 동안**은 갱신되지 않습니다. 다른 사람이 방금 누른 것은
페이지를 다시 들어가야 보입니다. (의도된 동작)
</details>

<details id="q-table">
<summary><b><code>D1_ERROR: no such table</code></b></summary>

`npm run db:init` 을 안 돌린 겁니다.
</details>

<details id="q-emoji">
<summary><b>특정 이모지만 400 에러</b></summary>

`like/index.html` 의 `EMOJIS` key, `wrangler.toml` 의 `REACTIONS`,
Super Body 의 `EMOJIS` — 세 곳의 key 가 어긋난 겁니다. ([3장](#s3-emoji))
</details>

<details id="q-npm">
<summary><b><code>npm error SELF_SIGNED_CERT_IN_CHAIN</code> (사내망)</b></summary>

사내 프록시가 HTTPS 를 중간에서 다시 서명해 npm 이 신뢰하지 않는 상태입니다.
`npm install` 과 `npx wrangler` 가 모두 막힙니다.

권장 — 사내 루트 CA 인증서를 등록:

```powershell
npm config set cafile "C:\경로\corp-root-ca.crt"
setx NODE_EXTRA_CA_CERTS "C:\경로\corp-root-ca.crt"
```

급하면 (설치 후 되돌리세요):

```powershell
npm config set strict-ssl false
npm install
npm config set strict-ssl true
```

wrangler 없이도 **D1 콘솔 · 변수 수정 · Promote version** 은
Cloudflare 대시보드에서 모두 가능합니다.
</details>

<details id="q-sync">
<summary><b>노션 편집기엔 보이는데 사이트엔 안 보임</b></summary>

Super 대시보드에서 Sync/Refresh 한 번.
</details>

<sub>[↑ 목차](#toc)</sub>

---

<a id="s11"></a>

## 11. 알려진 한계

**글 제목이 바뀌면 반응이 초기화됩니다**

id 를 슬러그에서 만들기 때문입니다. 제목을 고치면 슬러그가 바뀌고, 새 id 로
0에서 다시 시작합니다. 옛 id 의 행은 D1 에 고아로 남습니다.

반응이 많이 쌓인 글은 Super Body 의 `ID_OVERRIDE` 로 id 를 고정할 수 있습니다.

```js
var ID_OVERRIDE = {
  '/contents/리포트-2026년-7월호-…': 'report-2026-07'
};
```

**80자를 넘는 순수 영문 슬러그는 충돌할 수 있습니다**

`normalizeId()` 는 한글 등이 섞였을 때만 해시를 붙입니다. 영문만으로 된
슬러그가 `MAX_ID_LEN`(80)을 넘으면 해시 없이 잘려서, 앞 80자가 같은 두 글의
반응이 합쳐집니다. 현재 콘텐츠는 모두 한글이라 해당 없습니다.

**목록은 읽기 전용입니다**

토글 방식이라 목록에서 누르게 하려면 "내가 누른 것" 상태를 상세와 공유해야
자연스럽습니다. 지금은 표시만 합니다.

**익명 집계입니다**

로그인이 없어 IP+UA 해시로 사용자를 구분합니다. 같은 사람이 기기를 바꾸면
별개로 셉니다. 정확한 실사용자 수 집계에는 쓸 수 없습니다.

<sub>[↑ 목차](#toc)</sub>

---

<a id="s12"></a>

## 12. 참고

- [Cloudflare Workers 요금제](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare D1 요금제](https://developers.cloudflare.com/d1/platform/pricing/)
- [Wrangler CLI 문서](https://developers.cloudflare.com/workers/wrangler/)
- [GitHub Pages 시작하기](https://docs.github.com/en/pages/quickstart)

담당: 디지털R&D센터 AX기획팀

<sub>[↑ 목차](#toc)</sub>
