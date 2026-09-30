import { databaseUnavailable, internalError, json } from "../_shared.js";

export async function onRequestGet({ params, env }) {
	const unavailable = databaseUnavailable(env);
	if (unavailable) return unavailable;

	try {
		const order = await env.DB.prepare(
			"SELECT id, event_id, customer_name, customer_email, payment_method, total_cents, quantity, created_at FROM orders WHERE id = ?"
		).bind(params.id).first();
		if (!order) return json({ error: "That order could not be found.", code: "ORDER_NOT_FOUND" }, 404);

		const tickets = await env.DB.prepare(
			"SELECT seat_id FROM tickets WHERE order_id = ? ORDER BY ticket_number"
		).bind(order.id).all();
		return json({
			id: order.id,
			eventId: order.event_id,
			seatIds: tickets.results.filter((ticket) => ticket.seat_id !== null).map((ticket) => ticket.seat_id),
			quantity: Number(order.quantity),
			customer: { name: order.customer_name, email: order.customer_email },
			paymentMethod: order.payment_method,
			totalCents: Number(order.total_cents),
			createdAt: order.created_at
		});
	} catch (error) {
		return internalError(error);
	}
}
