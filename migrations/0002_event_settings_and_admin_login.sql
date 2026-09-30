CREATE TABLE event_settings (
	event_id TEXT PRIMARY KEY,
	settings_json TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE admin_login_limits (
	ip_hash TEXT PRIMARY KEY,
	window_started_at INTEGER NOT NULL,
	attempts INTEGER NOT NULL,
	blocked_until INTEGER
);
