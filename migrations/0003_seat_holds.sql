CREATE TABLE seat_holds (
	event_id TEXT NOT NULL,
	seat_id TEXT NOT NULL,
	hold_id TEXT NOT NULL,
	expires_at TEXT NOT NULL,
	PRIMARY KEY (event_id, seat_id)
);

CREATE INDEX seat_holds_by_id ON seat_holds(hold_id);
CREATE INDEX seat_holds_by_expiry ON seat_holds(expires_at);

CREATE TRIGGER seat_holds_reject_sold_seats
BEFORE INSERT ON seat_holds
WHEN EXISTS (
	SELECT 1 FROM tickets
	WHERE event_id = NEW.event_id AND seat_id = NEW.seat_id
)
BEGIN
	SELECT RAISE(ABORT, 'seat already sold');
END;

CREATE TRIGGER tickets_reject_active_holds
BEFORE INSERT ON tickets
WHEN NEW.seat_id IS NOT NULL AND EXISTS (
	SELECT 1 FROM seat_holds
	WHERE event_id = NEW.event_id
		AND seat_id = NEW.seat_id
		AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
BEGIN
	SELECT RAISE(ABORT, 'seat currently held');
END;
