/**
 * Cloudflare 계정 없이 로컬에서 돌아가는 테스트.
 *   node test/worker.test.mjs   (또는 npm test)
 *
 * D1 대신 node:sqlite 로 같은 SQL을 실행해 워커 로직을 그대로 검증합니다.
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import worker from "../src/index.js";

const db = new DatabaseSync(":memory:");
db.exec(fs.readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));

// 최소한의 D1 인터페이스 흉내
const D1 = {
  prepare(sql) {
    let args = [];
    const stmt = {
      bind(...a) { args = a; return stmt; },
      _run() {
        const s = db.prepare(sql);
        if (/^\s*select/i.test(sql)) return { results: s.all(...args), meta: {} };
        const r = s.run(...args);
        return { results: [], meta: { changes: Number(r.changes) } };
      },
      first() { return stmt._run().results[0] ?? null; },
    };
    return stmt;
  },
  async batch(stmts) { return stmts.map((s) => s._run()); },
};

const env = {
  DB: D1,
  SALT: "test-salt",
  ALLOWED_ORIGINS: "https://daou-dev.github.io",
  REACTIONS: "heart,clap,thumbsup,exclaim,fire",
};

function req(path, { method = "GET", ip = "1.2.3.4", ua = "UA-A", origin = "https://daou-dev.github.io" } = {}) {
  return new Request("https://w.example.dev" + path, {
    method,
    headers: { "CF-Connecting-IP": ip, "User-Agent": ua, ...(origin ? { Origin: origin } : {}) },
  });
}
const call = async (p, o) => {
  const res = await worker.fetch(req(p, o), env);
  return {
    status: res.status,
    cors: res.headers.get("Access-Control-Allow-Origin"),
    body: await res.json().catch(() => null),
  };
};

let pass = 0, fail = 0;
const t = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log((cond ? "✅" : "❌") + " " + name + (extra ? "  " + extra : ""));
};

const P = "/api/reactions?id=2026-onboarding";

let r = await call(P);
t("초기 상태: 5종 모두 0, mine 비어있음",
  Object.keys(r.body.counts).length === 5 &&
  Object.values(r.body.counts).every((v) => v === 0) &&
  r.body.mine.length === 0, JSON.stringify(r.body));

r = await call(P + "&emoji=heart", { method: "POST" });
t("❤️ 누름 → heart 1, mine에 포함", r.body.counts.heart === 1 && r.body.mine.includes("heart"));

r = await call(P + "&emoji=fire", { method: "POST" });
t("같은 사람이 🔥도 누름 → 둘 다 유지",
  r.body.counts.heart === 1 && r.body.counts.fire === 1 && r.body.mine.length === 2,
  JSON.stringify(r.body.mine));

r = await call(P + "&emoji=heart", { method: "POST" });
t("❤️ 다시 누름 → 취소, 🔥는 그대로",
  r.body.counts.heart === 0 && r.body.counts.fire === 1 && !r.body.mine.includes("heart"));

r = await call(P + "&emoji=fire", { method: "POST", ip: "5.6.7.8" });
t("다른 사람이 🔥 → 2", r.body.counts.fire === 2);

r = await call(P, { ip: "9.9.9.9" });
t("제3자 조회: 수는 보이고 mine은 비어있음", r.body.counts.fire === 2 && r.body.mine.length === 0);

r = await call(P + "&emoji=fire", { method: "POST", ip: "5.6.7.8", ua: "UA-B" });
t("같은 IP 다른 브라우저는 별개 → 3", r.body.counts.fire === 3);

r = await call("/api/reactions?id=q3-retro");
t("다른 글은 카운트 독립", r.body.counts.fire === 0);

const k1 = await call("/api/reactions?id=" + encodeURIComponent("온보딩 가이드") + "&emoji=clap", { method: "POST" });
const k2 = await call("/api/reactions?id=" + encodeURIComponent("사내 공지") + "&emoji=clap", { method: "POST" });
t("한글 id 서로 다른 버킷", k1.body.id !== k2.body.id, k1.body.id + " vs " + k2.body.id);
const k3 = await call("/api/reactions?id=" + encodeURIComponent("온보딩 가이드"));
t("한글 id 재조회 시 동일", k3.body.id === k1.body.id && k3.body.counts.clap === 1);

const N = "/api/reactions?id=neg-test&emoji=clap";
await call(N, { method: "POST" });
await call(N, { method: "POST" });
r = await call(N, { method: "POST", ip: "7.7.7.7" });
t("카운트가 음수로 내려가지 않음", r.body.counts.clap >= 0, JSON.stringify(r.body.counts));

r = await call("/api/reactions/bulk?ids=2026-onboarding,q3-retro,neg-test");
t("bulk 3건 반환", Array.isArray(r.body) && r.body.length === 3 && r.body[0].counts);

r = await call(P + "&emoji=poop", { method: "POST" });
t("허용 목록에 없는 이모지 400", r.status === 400 && r.body.error === "invalid_emoji");

r = await call("/api/reactions?emoji=heart", { method: "POST" });
t("id 없으면 400", r.status === 400 && r.body.error === "missing_id");

r = await call("/api/reactions?id=x", { method: "PUT" });
t("허용 안 된 메서드 405", r.status === 405);

r = await call("/nope");
t("없는 경로 404", r.status === 404);

r = await call(P, { origin: "https://evil.example.com" });
t("허용 안 된 origin 차단", r.cors === "null", "ACAO=" + r.cors);

r = await call(P, { origin: "https://daou-dev.github.io" });
t("허용된 origin 통과", r.cors === "https://daou-dev.github.io");

const pre = await worker.fetch(req(P, { method: "OPTIONS" }), env);
t("OPTIONS preflight 204", pre.status === 204);

r = await call("/health");
t("health 응답에 이모지 목록 포함", r.body.ok === true && r.body.emojis.length === 5);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
