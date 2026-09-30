import { configuredEvents, databaseUnavailable, internalError, json, validSeatIds } from "./_shared.js";

const HOLD_DURATION_MS = 6 * 60 * 1000;
const HOLD_ID_PATTERN = /^[0-9a-f-]{36}$/i;

function validateHold(body) {
	if (!body || typeof body !== "object" || Array.isArray(body)) return "Seat hold details are invalid.";
	if (typeof body.eventId !== "string" || !HOLD_ID_PATTERN.test(body.holdId)) return "Seat hold details are incomplete.";
	if (
		!Array.isArray(body.seatIds) ||
		body.seatIds.length === 0 ||
		new Set(body.seatIds).size !== body.seatIds.length ||
		body.seatIds.some((seatId) => typeof seatId !== "string")
	) return "Choose one or more unique seats.";
	return null;
}

export async function onRequestPost({ request, env }) {
	const unavailable = databaseUnavailable(env);
	if (unavailable) return unavailable;

	let body;
	try {
		body = await request.json();
	} catch (error) {
		return json({ error: "The seat hold request must contain valid JSON.", code: "INVALID_REQUEST" }, 400);
	}

	const validationError = validateHold(body);
	if (validationError) return json({ error: validationError, code: "INVALID_HOLD" }, 400);

	let event;
	try {
		event = (await configuredEvents(env)).find((candidate) => candidate.id === body.eventId) ?? null;
	} catch (error) {
		return internalError(error);
	}
	if (!event) return json({ error: "This event is not available.", code: "EVENT_NOT_FOUND" }, 404);
	if (event.type !== "seated") return json({ error: "Seat holds are only available for assigned seating.", code: "INVALID_HOLD" }, 400);

	const validSeats = validSeatIds(event);
	if (body.seatIds.some((seatId) => !validSeats.has(seatId))) {
		return json({ error: "One or more selected seats are invalid.", code: "INVALID_SEATS" }, 400);
	}

	const now = new Date();
	const nowIso = now.toISOString();
	const expiresAt = new Date(now.getTime() + HOLD_DURATION_MS).toISOString();
	const statements = [
		env.DB.prepare("DELETE FROM seat_holds WHERE expires_at <= ?").bind(nowIso),
		env.DB.prepare("DELETE FROM seat_holds WHERE hold_id = ?").bind(body.holdId),
		env.DB.prepare(
			"INSERT INTO seat_holds (event_id, seat_id, hold_id, expires_at) SELECT ?, value, ?, ? FROM json_each(?)"
		).bind(event.id, body.holdId, expiresAt, JSON.stringify(body.seatIds))
	];

	try {
		await env.DB.batch(statements);
	} catch (error) {
		if (/unique|constraint|seat already sold/i.test(error.message)) {
			return json({
				error: "One or more seats are no longer available. Refresh the seat map and choose different seats.",
				code: "SEATS_UNAVAILABLE"
			}, 409);
		}
		return internalError(error);
	}

	return json({ holdId: body.holdId, expiresAt }, 201);
}

export async function onRequestDelete({ request, env }) {
	const unavailable = databaseUnavailable(env);
	if (unavailable) return unavailable;

	const holdId = new URL(request.url).searchParams.get("holdId");
	if (!holdId || !HOLD_ID_PATTERN.test(holdId)) {
		return json({ error: "A valid seat hold is required.", code: "INVALID_HOLD" }, 400);
	}

	try {
		await env.DB.prepare("DELETE FROM seat_holds WHERE hold_id = ?").bind(holdId).run();
		return json({ released: true });
	} catch (error) {
		return internalError(error);
	}
}
