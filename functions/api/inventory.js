import { databaseUnavailable, findEvent, internalError, json } from "./_shared.js";

export async function onRequestGet({ request, env }) {
	const unavailable = databaseUnavailable(env);
	if (unavailable) return unavailable;

	const eventId = new URL(request.url).searchParams.get("eventId");
	const event = findEvent(eventId);
	if (!event) return json({ error: "This event is not available.", code: "EVENT_NOT_FOUND" }, 404);

	try {
		const seats = await env.DB.prepare(
			"SELECT seat_id FROM tickets WHERE event_id = ? AND seat_id IS NOT NULL"
		).bind(event.id).all();
		const holds = await env.DB.prepare(
			"SELECT seat_id FROM seat_holds WHERE event_id = ? AND expires_at > ?"
		).bind(event.id, new Date().toISOString()).all();
		const admission = await env.DB.prepare(
			"SELECT COUNT(*) AS admitted FROM tickets WHERE event_id = ? AND seat_id IS NULL"
		).bind(event.id).first();

		return json({
			reservedSeats: seats.results.map((ticket) => ticket.seat_id),
			heldSeats: holds.results.map((hold) => hold.seat_id),
			admitted: Number(admission.admitted)
		});
	} catch (error) {
		return internalError(error);
	}
}
