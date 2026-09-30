CREATE TABLE orders (

	
	id TEXT PRIMARY KEY,
	event_id TEXT NOT NULL,
	customer_name TEXT NOT NULL,
	customer_email TEXT NOT NULL,
	payment_method TEXT NOT NULL CHECK (payment_method IN ('apple', 'google', 'card')),
	total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
	quantity INTEGER NOT NULL CHECK (quantity > 0),
	created_at TEXT NOT NULL
);

CREATE TABLE tickets (
	ticket_id TEXT PRIMARY KEY,
	order_id TEXT NOT NULL REFERENCES orders(id),
	event_id TEXT NOT NULL,
	seat_id TEXT,
	ticket_number INTEGER NOT NULL CHECK (ticket_number > 0)
);

CREATE UNIQUE INDEX tickets_unique_event_seat
	ON tickets(event_id, seat_id)
	WHERE seat_id IS NOT NULL;

CREATE INDEX tickets_by_event
	ON tickets(event_id);

CREATE INDEX tickets_by_order
	ON tickets(order_id, ticket_number);
