import {
	configuredEvents,
	databaseUnavailable,
	internalError,
	isAdminRequest,
	json
} from "../_shared.js";

export async function onRequestGet({ request, env }) {
	const unavailable = databaseUnavailable(env);
	if (unavailable) return unavailable;
	if (!(await isAdminRequest(request, env))) {
		return json({ error: "Sign in to view the sales dashboard.", code: "UNAUTHORIZED" }, 401);
	}

	try {
		const [events, ordersResult, ticketsResult] = await Promise.all([
			configuredEvents(env),
			env.DB.prepare(`
				SELECT event_id, COUNT(*) AS order_count, COALESCE(SUM(total_cents), 0) AS demo_total_cents
				FROM orders
				GROUP BY event_id
			`).all(),
			env.DB.prepare(`
				SELECT event_id, COUNT(*) AS tickets_sold
				FROM tickets
				GROUP BY event_id
			`).all()
		]);

		const ordersByEvent = new Map(ordersResult.results.map((row) => [row.event_id, row]));
		const ticketsByEvent = new Map(ticketsResult.results.map((row) => [row.event_id, row]));
		const eventSales = events.map((event) => {
			const order = ordersByEvent.get(event.id);
			const ticket = ticketsByEvent.get(event.id);
			const ticketsSold = Number(ticket?.tickets_sold ?? 0);
			const seatedCapacity = event.type === "seated"
				? event.seatMap.sections.reduce((count, section) =>
					count + Object.values(section.rows).reduce((rowCount, seats) => rowCount + seats.length, 0), 0)
				: null;
			return {
				eventId: event.id,
				title: event.title,
				session: event.session,
				type: event.type,
				ticketsSold,
				orderCount: Number(order?.order_count ?? 0),
				demoTotalCents: Number(order?.demo_total_cents ?? 0),
				remainingSeats: seatedCapacity === null ? null : Math.max(0, seatedCapacity - ticketsSold)
			};
		});

		return json({
			events: eventSales,
			totals: {
				ticketsSold: eventSales.reduce((total, event) => total + event.ticketsSold, 0),
				orderCount: eventSales.reduce((total, event) => total + event.orderCount, 0),
				demoTotalCents: eventSales.reduce((total, event) => total + event.demoTotalCents, 0)
			}
		});
	} catch (error) {
		return internalError(error);
	}
}
