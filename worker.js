import { onRequestGet as getInventory } from "./functions/api/inventory.js";
import { onRequestGet as getEvents } from "./functions/api/events.js";
import { onRequestGet as getOrder } from "./functions/api/orders/[id].js";
import { onRequestPost as placeOrder } from "./functions/api/orders.js";
import { onRequestGet as getAdminSession, onRequestPost as loginAdmin, onRequestDelete as logoutAdmin } from "./functions/api/admin/session.js";
import { onRequestGet as getAdminEvents, onRequestPut as updateAdminEvent } from "./functions/api/admin/events.js";
import { onRequestGet as getAdminSales } from "./functions/api/admin/sales.js";
import { json } from "./functions/api/_shared.js";

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname.startsWith("/api/")) {
			if (url.pathname === "/api/events" && request.method === "GET") {
				return getEvents({ env });
			}
			if (url.pathname === "/api/inventory" && request.method === "GET") {
				return getInventory({ request, env });
			}
			if (url.pathname === "/api/admin/session" && request.method === "GET") {
				return getAdminSession({ request, env });
			}
			if (url.pathname === "/api/admin/session" && request.method === "POST") {
				return loginAdmin({ request, env });
			}
			if (url.pathname === "/api/admin/session" && request.method === "DELETE") {
				return logoutAdmin({ request, env });
			}
			if (url.pathname.startsWith("/api/admin/") && !["GET", "POST", "PUT", "DELETE"].includes(request.method)) {
				return json({ error: "This method is not supported for the organizer API.", code: "METHOD_NOT_ALLOWED" }, 405);
			}
			if (url.pathname === "/api/admin/events" && request.method === "GET") {
				return getAdminEvents({ request, env });
			}
			if (url.pathname === "/api/admin/events" && request.method === "PUT") {
				return updateAdminEvent({ request, env });
			}
			if (url.pathname === "/api/admin/sales" && request.method === "GET") {
				return getAdminSales({ request, env });
			}
			if (url.pathname === "/api/orders" && request.method === "POST") {
				return placeOrder({ request, env });
			}
			const orderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
			if (orderMatch && request.method === "GET") {
				return getOrder({ params: { id: decodeURIComponent(orderMatch[1]) }, env });
			}
			return json({ error: "This API route does not exist.", code: "ROUTE_NOT_FOUND" }, 404);
		}

		return env.ASSETS.fetch(request);
	}
};
