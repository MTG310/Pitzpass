import { configuredEvents, databaseUnavailable, internalError, json, validSeatIds } from "./_shared.js";

const PAYMENT_METHODS = new Set(["apple", "google", "card"]);

function validateOrder(body) {
	if (!body || typeof body !== "object" || Array.isArray(body)) return "Order details are invalid.";
	if (typeof body.eventId !== "string" || typeof body.paymentMethod !== "string") return "Order details are incomplete.";
	if (!PAYMENT_METHODS.has(body.paymentMethod)) return "Choose a supported demo payment method.";
	if (
		!body.customer ||
		typeof body.customer.name !== "string" ||
		body.customer.name.trim().length < 1 ||
		body.customer.name.length > 100 ||
		typeof body.customer.email !== "string" ||
		body.customer.email.length > 254 ||
		!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.customer.email.trim())
	) {
		return "Enter a valid name and email address.";
	}
	if (!Array.isArray(body.seatIds)) return "Ticket selections are invalid.";
	if (!Number.isSafeInteger(body.quantity) || body.quantity < 1) return "Ticket quantity must be a positive whole number.";
	return null;
}

export async function onRequestPost({ request, env }) {
	const unavailable = databaseUnavailable(env);
	if (unavailable) return unavailable;

	let body;
	try {
		body = await request.json();
	} catch (error) {
		return json({ error: "The order request must contain valid JSON.", code: "INVALID_REQUEST" }, 400);
	}

	const validationError = validateOrder(body);
	if (validationError) return json({ error: validationError, code: "INVALID_ORDER" }, 400);

	let event;
	try {
		event = (await configuredEvents(env)).find((candidate) => candidate.id === body.eventId) ?? null;
	} catch (error) {
		return internalError(error);
	}
	if (!event) return json({ error: "This event is not available.", code: "EVENT_NOT_FOUND" }, 404);

	const seatIds = body.seatIds;
	if (event.type === "seated") {
		const validSeats = validSeatIds(event);
		if (
			seatIds.length === 0 ||
			body.quantity !== seatIds.length ||
			new Set(seatIds).size !== seatIds.length ||
			seatIds.some((seatId) => typeof seatId !== "string" || !validSeats.has(seatId))
		) {
			return json({ error: "Choose valid, available seats before placing the order.", code: "INVALID_SEATS" }, 400);
		}
	} else if (seatIds.length !== 0) {
		return json({ error: "General-admission tickets cannot have assigned seats.", code: "INVALID_SEATS" }, 400);
	}

	const orderId = `PP-${crypto.randomUUID().replaceAll("-", "").toUpperCase()}`;
	const createdAt = new Date().toISOString();
	const ticketInserts = Array.from({ length: body.quantity }, (_, index) =>
		env.DB.prepare(
			"INSERT INTO tickets (ticket_id, order_id, event_id, seat_id, ticket_number) VALUES (?, ?, ?, ?, ?)"
		).bind(
			crypto.randomUUID(),
			orderId,
			event.id,
			event.type === "seated" ? seatIds[index] : null,
			index + 1
		)
	);
	const statements = [
		env.DB.prepare(
			"INSERT INTO orders (id, event_id, customer_name, customer_email, payment_method, total_cents, quantity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
		).bind(
			orderId,
			event.id,
			body.customer.name.trim(),
			body.customer.email.trim(),
			body.paymentMethod,
			event.priceCents * body.quantity,
			body.quantity,
			createdAt
		),
		...ticketInserts
	];

	try {
		await env.DB.batch(statements);
	} catch (error) {
		if (event.type === "seated" && /unique|constraint/i.test(error.message)) {
			return json({
				error: "One or more seats were just taken on another device. Please refresh the seat map and choose different seats.",
				code: "SEATS_UNAVAILABLE"
			}, 409);
		}
		return internalError(error);
	}

	return json({
		id: orderId,
		eventId: event.id,
		seatIds: event.type === "seated" ? [...seatIds] : [],
		quantity: body.quantity,
		customer: { name: body.customer.name.trim(), email: body.customer.email.trim() },
		paymentMethod: body.paymentMethod,
		totalCents: event.priceCents * body.quantity,
		createdAt
	}, 201);
}
