import { EVENTS } from "../../src/events.js";
import { configuredEvents, internalError, json, safeAdminEvent } from "./_shared.js";

export async function onRequestGet({ env }) {
	try {
		const events = env.DB ? await configuredEvents(env) : EVENTS;
		return json({ events: events.map(safeAdminEvent) });
	} catch (error) {
		return internalError(error);
	}
}
