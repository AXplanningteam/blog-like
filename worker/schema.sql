-- 이모지 반응 카운터 스키마

CREATE TABLE IF NOT EXISTS reactions (
  post_id    TEXT NOT NULL,
  emoji      TEXT NOT NULL,          -- heart / clap / thumbsup / exclaim / fire
  count      INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, emoji)
);

-- 중복 방지용. IP 원본이 아니라 SHA-256 해시 앞 16바이트만 저장합니다.
CREATE TABLE IF NOT EXISTS voters (
  post_id    TEXT NOT NULL,
  emoji      TEXT NOT NULL,
  voter      TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, emoji, voter)
);

CREATE INDEX IF NOT EXISTS idx_voters_lookup ON voters (post_id, voter);
