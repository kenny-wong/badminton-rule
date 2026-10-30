-- Optional Google accounts (to keep saved players across devices), their
-- sessions, each account's saved players, and the audit trail.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  google_sub TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- id is the SHA-256 of the cookie token, so a database leak doesn't leak live sessions.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX sessions_user ON sessions(user_id);

-- An account's saved players: the same JSON list the browser keeps in localStorage.
CREATE TABLE player_lists (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Who did what: every page view and action, by IP and (when logged in) account.
-- detail is JSON checked against an allowlist per action (lib/audit.js).
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ip TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  user_id TEXT,
  email TEXT,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}',
  user_agent TEXT NOT NULL DEFAULT ''
);
CREATE INDEX audit_at ON audit_log(at);
CREATE INDEX audit_ip ON audit_log(ip, at);
CREATE INDEX audit_user ON audit_log(user_id, at);
CREATE INDEX audit_action ON audit_log(action, at);
