import {
	configuredEvents,
	databaseUnavailable,
	findEvent,
	internalError,
	isAdminRequest,
	json,
	requireSameOrigin,
	safeAdminEvent
} from "../_shared.js";

const validDate = (value) => {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const date = new Date(`${value}T12:00:00Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

function validateSettings(body, event) {
	if (!body || typeof body !== "object" || Array.isArray(body)) return "Event details are invalid.";
	const fields = ["title", "session", "date", "time", "venueName", "price", "description"];
	if (fields.some((field) => typeof body[field] !== "string")) return "Complete all event fields before saving.";
	if (body.title.trim().length < 1 || body.title.trim().length > 100) return "Event title must be 1–100 characters.";
	if (body.session.trim().length < 1 || body.session.trim().length > 100) return "Show or ticket label must be 1–100 characters.";
	if (!validDate(body.date)) return "Enter a valid event date.";
	if (body.time !== "" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time)) return "Choose a valid event time or leave it blank.";
	if (body.venueName.trim().length < 1 || body.venueName.trim().length > 120) return "Venue must be 1–120 characters.";
	if (!/^\d{1,5}(?:\.\d{1,2})?$/.test(body.price)) return "Enter a valid non-negative ticket price with up to two decimal places.";
	if (body.description.trim().length < 1 || body.description.trim().length > 500) return "Description must be 1–500 characters.";
	if (event.type === "seated" && !/^(0?[1-9]|1[0-2]):[0-5]\d [AP]M$/.test(body.studentArrivalTime)) {
		return "Enter student arrival in a format such as 4:30 PM.";
	}
	const priceCents = Math.round(Number(body.price) * 100);
	if (!Number.isSafeInteger(priceCents) || priceCents > 1000000) return "Ticket price must not exceed $10,000.";
	return null;
}

export async function onRequestGet({ request, env }) {
	const unavailable = databaseUnavailable(env);
	if (unavailable) return unavailable;
	if (!(await isAdminRequest(request, env))) return json({ error: "Sign in to manage events.", code: "UNAUTHORIZED" }, 401);

	try {
		const events = await configuredEvents(env);
		return json({ events: events.map(safeAdminEvent) });
	} catch (error) {
		return internalError(error);
	}
}

export async function onRequestPut({ request, env }) {
	const unavailable = databaseUnavailable(env);
	if (unavailable) return unavailable;
	if (!requireSameOrigin(request)) return json({ error: "This event update was not accepted.", code: "INVALID_ORIGIN" }, 403);
	if (!(await isAdminRequest(request, env))) return json({ error: "Your organizer session expired. Please sign in again.", code: "UNAUTHORIZED" }, 401);

	let body;
	try {
		body = await request.json();
	} catch (error) {
		return json({ error: "The update request must contain valid JSON.", code: "INVALID_REQUEST" }, 400);
	}
	if (typeof body?.eventId !== "string") return json({ error: "Choose an event to update.", code: "INVALID_EVENT" }, 400);
	const event = findEvent(body.eventId);
	if (!event) return json({ error: "This event is not available.", code: "EVENT_NOT_FOUND" }, 404);
	const validationError = validateSettings(body.settings, event);
	if (validationError) return json({ error: validationError, code: "INVALID_SETTINGS" }, 400);

	const settings = {
		title: body.settings.title.trim(),
		session: body.settings.session.trim(),
		date: body.settings.date,
		time: body.settings.time || null,
		venue: { name: body.settings.venueName.trim() },
		priceCents: Math.round(Number(body.settings.price) * 100),
		description: body.settings.description.trim(),
		...(event.type === "seated" ? { studentArrivalTime: body.settings.studentArrivalTime } : {})
	};
	try {
		await env.DB.prepare(`
			INSERT INTO event_settings (event_id, settings_json, updated_at)
			VALUES (?, ?, ?)
			ON CONFLICT(event_id) DO UPDATE SET
				settings_json = excluded.settings_json,
				updated_at = excluded.updated_at
		`).bind(event.id, JSON.stringify(settings), new Date().toISOString()).run();
		const updated = { ...event, ...settings, venue: { ...event.venue, ...settings.venue } };
		return json({ event: safeAdminEvent(updated) });
	} catch (error) {
		return internalError(error);
	}
}
