/**
 * 이모지 반응 카운터 API (Cloudflare Workers + D1)
 *
 *   GET   /api/reactions?id=<postId>
 *         → { id, counts: { heart: 3, fire: 1, ... }, mine: ["heart"] }
 *
 *   POST  /api/reactions?id=<postId>&emoji=<key>
 *         → 토글 후 같은 형태로 응답
 *
 *   GET   /api/reactions/bulk?ids=a,b,c        (목록 페이지용, 최대 50개)
 *   GET   /health
 *
 * 중복 방지: SHA-256(SALT + IP + User-Agent) 해시를 저장. IP 원본은 저장하지 않습니다.
 */

const DEFAULT_EMOJIS = "heart,clap,thumbsup,exclaim,fire";
const MAX_ID_LEN = 80;
const MAX_BULK = 50;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request.headers.get("Origin") || "", env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (url.pathname === "/api/reactions/bulk" && request.method === "GET") {
        return await handleBulk(request, env, url, cors);
      }
      if (url.pathname === "/api/reactions") {
        if (request.method === "GET") return await handleGet(request, env, url, cors);
        if (request.method === "POST") return await handleToggle(request, env, url, cors);
        return json({ error: "method_not_allowed" }, 405, cors);
      }
      if (url.pathname === "/health" || url.pathname === "/") {
        return json({ ok: true, emojis: allowedEmojis(env) }, 200, cors);
      }
      return json({ error: "not_found" }, 404, cors);
    } catch (err) {
      console.error(err);
      return json({ error: "internal_error" }, 500, cors);
    }
  },
};

/* ---------------- handlers ---------------- */

async function handleGet(request, env, url, cors) {
  const id = normalizeId(url.searchParams.get("id"));
  if (!id) return json({ error: "missing_id" }, 400, cors);

  const voter = await voterHash(request, env);
  const [countRows, mineRows] = await env.DB.batch([
    env.DB.prepare("SELECT emoji, count FROM reactions WHERE post_id = ?").bind(id),
    env.DB.prepare("SELECT emoji FROM voters WHERE post_id = ? AND voter = ?").bind(id, voter),
  ]);

  return json(shape(id, countRows.results, mineRows.results, env), 200, cors);
}

async function handleBulk(request, env, url, cors) {
  const ids = [
    ...new Set((url.searchParams.get("ids") || "").split(",").map(normalizeId).filter(Boolean)),
  ].slice(0, MAX_BULK);
  if (!ids.length) return json({ error: "missing_ids" }, 400, cors);

  const voter = await voterHash(request, env);
  const holes = ids.map(() => "?").join(",");
  const [countRows, mineRows] = await env.DB.batch([
    env.DB.prepare(
      `SELECT post_id, emoji, count FROM reactions WHERE post_id IN (${holes})`
    ).bind(...ids),
    env.DB.prepare(
      `SELECT post_id, emoji FROM voters WHERE voter = ? AND post_id IN (${holes})`
    ).bind(voter, ...ids),
  ]);

  return json(
    ids.map((id) =>
      shape(
        id,
        countRows.results.filter((r) => r.post_id === id),
        mineRows.results.filter((r) => r.post_id === id),
        env
      )
    ),
    200,
    cors
  );
}

async function handleToggle(request, env, url, cors) {
  const id = normalizeId(url.searchParams.get("id"));
  if (!id) return json({ error: "missing_id" }, 400, cors);

  const emoji = String(url.searchParams.get("emoji") || "").trim().toLowerCase();
  if (!allowedEmojis(env).includes(emoji)) {
    return json({ error: "invalid_emoji", allowed: allowedEmojis(env) }, 400, cors);
  }

  const voter = await voterHash(request, env);
  const now = Math.floor(Date.now() / 1000);

  const already = await env.DB.prepare(
    "SELECT 1 AS v FROM voters WHERE post_id = ? AND emoji = ? AND voter = ?"
  )
    .bind(id, emoji, voter)
    .first();

  // batch()는 하나의 트랜잭션으로 실행되므로 카운터가 어긋나지 않습니다.
  if (already) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM voters WHERE post_id = ? AND emoji = ? AND voter = ?").bind(
        id,
        emoji,
        voter
      ),
      env.DB.prepare(
        "UPDATE reactions SET count = MAX(count - 1, 0), updated_at = ? WHERE post_id = ? AND emoji = ?"
      ).bind(now, id, emoji),
    ]);
  } else {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO voters (post_id, emoji, voter, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING"
      ).bind(id, emoji, voter, now),
      env.DB.prepare(
        `INSERT INTO reactions (post_id, emoji, count, updated_at) VALUES (?, ?, 1, ?)
         ON CONFLICT(post_id, emoji) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at`
      ).bind(id, emoji, now),
    ]);
  }

  const [countRows, mineRows] = await env.DB.batch([
    env.DB.prepare("SELECT emoji, count FROM reactions WHERE post_id = ?").bind(id),
    env.DB.prepare("SELECT emoji FROM voters WHERE post_id = ? AND voter = ?").bind(id, voter),
  ]);

  return json(shape(id, countRows.results, mineRows.results, env), 200, cors);
}

/* ---------------- helpers ---------------- */

// 응답 형태를 항상 동일하게 유지합니다. 허용된 이모지는 0이라도 키가 존재합니다.
function shape(id, countRows, mineRows, env) {
  const list = allowedEmojis(env);
  const counts = {};
  for (const key of list) counts[key] = 0;
  for (const r of countRows) if (key1(r.emoji, list)) counts[r.emoji] = r.count;

  return {
    id,
    counts,
    mine: mineRows.map((r) => r.emoji).filter((e) => list.includes(e)),
  };
}

function key1(emoji, list) {
  return list.includes(emoji);
}

function allowedEmojis(env) {
  return String(env.REACTIONS || DEFAULT_EMOJIS)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// 글 구분자. 영문/숫자/하이픈/언더바만 허용합니다.
// 한글 등이 섞여 전부 날아가는 경우를 대비해 원본 해시를 뒤에 붙여 충돌을 막습니다.
function normalizeId(input) {
  if (!input) return "";
  const raw = String(input).trim();
  if (!raw || raw.length > 200) return "";

  let slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const lossy = /[^a-zA-Z0-9_\-\s/]/.test(raw);
  if (lossy || !slug) slug = `${slug.slice(0, 48) || "post"}-${djb2(raw)}`;

  return slug.slice(0, MAX_ID_LEN);
}

function djb2(str) {
  let h = 5381;
  for (let i = str.length - 1; i >= 0; i--) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

async function voterHash(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
  const ua = request.headers.get("User-Agent") || "";
  const salt = env.SALT || "change-me";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${salt}|${ip}|${ua}`)
  );
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function corsHeaders(origin, env) {
  const list = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ok = list.includes("*") || (origin && list.includes(origin));
  return {
    "Access-Control-Allow-Origin": ok ? origin || "*" : "null",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors },
  });
}
