async function apiRequest(path, options = {}) {
	let response;
	try {
		response = await fetch(path, {
			...options,
			headers: {
				"Content-Type": "application/json",
				...options.headers
			}
		});
	} catch (error) {
		throw new Error("The shared ticket service could not be reached. Check your connection and try again.", { cause: error });
	}

	let result;
	try {
		result = await response.json();
	} catch (error) {
		throw new Error("The shared ticket service returned an invalid response. Please try again.", { cause: error });
	}

	if (!response.ok) {
		const apiError = new Error(result.error || "The request could not be completed.");
		apiError.code = result.code || "API_ERROR";
		throw apiError;
	}
	return result;
}

export function getInventory(eventId) {
	return apiRequest(`/api/inventory?eventId=${encodeURIComponent(eventId)}`);
}

export async function getEvents() {
	const result = await apiRequest("/api/events");
	return result.events;
}

export function getOrder(orderId) {
	return apiRequest(`/api/orders/${encodeURIComponent(orderId)}`);
}

export function placeOrder(details) {
	return apiRequest("/api/orders", {
		method: "POST",
		body: JSON.stringify(details)
	});
}

export function getAdminSession() {
	return apiRequest("/api/admin/session");
}

export function loginAdmin(username, password) {
	return apiRequest("/api/admin/session", {
		method: "POST",
		body: JSON.stringify({ username, password })
	});
}

export function logoutAdmin() {
	return apiRequest("/api/admin/session", { method: "DELETE" });
}

export function getAdminEvents() {
	return apiRequest("/api/admin/events");
}

export function updateAdminEvent(eventId, settings) {
	return apiRequest("/api/admin/events", {
		method: "PUT",
		body: JSON.stringify({ eventId, settings })
	});
}
