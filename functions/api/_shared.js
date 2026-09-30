import { EVENTS } from "../../src/events.js";

export function json(data, status = 200) {
	return Response.json(data, {
		status,
		headers: {
			"Cache-Control": "no-store"
		}
	});
}

export function findEvent(eventId) {
	return EVENTS.find((event) => event.id === eventId) ?? null;
}

export async function configuredEvents(env) {
	const saved = await env.DB.prepare(
		"SELECT event_id, settings_json FROM event_settings"
	).all();
	const settings = new Map(saved.results.map((row) => [row.event_id, JSON.parse(row.settings_json)]));
	return EVENTS.map((event) => ({ ...event, ...settings.get(event.id), venue: { ...event.venue, ...(settings.get(event.id)?.venue ?? {}) } }));
}

export function validSeatIds(event) {
	if (event.type !== "seated") return new Set();
	return new Set(
		event.seatMap.sections.flatMap((section) =>
			Object.entries(section.rows).flatMap(([row, numbers]) =>
				numbers.map((number) => `${section.id}-${row}-${number}`)
			)
		)
	);
}

const SESSION_COOKIE = "pitz_pass_admin";
const SESSION_SECONDS = 8 * 60 * 60;

function base64UrlEncode(bytes) {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlDecode(value) {
	const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
	const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sessionSignature(payload, secret) {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"]
	);
	return base64UrlEncode(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))));
}

export function hasAdminSecrets(env) {
	return Boolean(env.ADMIN_PASSWORD && env.SESSION_SECRET && env.SESSION_SECRET.length >= 32);
}

export async function createAdminCookie(env) {
	const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
		sub: "admin",
		exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS
	})));
	const signature = await sessionSignature(payload, env.SESSION_SECRET);
	return `${SESSION_COOKIE}=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}

export async function isAdminRequest(request, env) {
	if (!hasAdminSecrets(env)) return false;
	const cookie = request.headers.get("Cookie")?.split(";").map((part) => part.trim())
		.find((part) => part.startsWith(`${SESSION_COOKIE}=`));
	if (!cookie) return false;
	const token = cookie.slice(SESSION_COOKIE.length + 1).split(".");
	if (token.length !== 2) return false;

	try {
		const expectedSignature = await sessionSignature(token[0], env.SESSION_SECRET);
		const expectedBytes = new TextEncoder().encode(expectedSignature);
		const actualBytes = new TextEncoder().encode(token[1]);
		let difference = expectedBytes.length ^ actualBytes.length;
		for (let index = 0; index < Math.max(expectedBytes.length, actualBytes.length); index++) {
			difference |= (expectedBytes[index] ?? 0) ^ (actualBytes[index] ?? 0);
		}
		if (difference !== 0) return false;
		const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(token[0])));
		return payload.sub === "admin" && Number.isInteger(payload.exp) && payload.exp > Math.floor(Date.now() / 1000);
	} catch (error) {
		return false;
	}
}

export function requireSameOrigin(request) {
	return request.headers.get("Origin") === new URL(request.url).origin;
}

export async function loginRateLimitKey(request, env) {
	const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(env.SESSION_SECRET),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"]
	);
	const hash = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip));
	return base64UrlEncode(new Uint8Array(hash));
}

export function safeAdminEvent(event) {
	return {
		id: event.id,
		title: event.title,
		session: event.session,
		date: event.date,
		time: event.time,
		venue: { name: event.venue.name },
		type: event.type,
		priceCents: event.priceCents,
		description: event.description,
		studentArrivalTime: event.studentArrivalTime ?? null
	};
}

export function databaseUnavailable(env) {
	if (env.DB) return null;
	return json({
		error: "The shared ticket database is not configured yet. Please contact the site organizer.",
		code: "DATABASE_NOT_CONFIGURED"
	}, 503);
}

export function internalError(error, message = "The ticket service could not complete the request. Please try again.") {
	console.error("Pitz Pass API error:", error);
	return json({ error: message, code: "INTERNAL_ERROR" }, 500);
}
