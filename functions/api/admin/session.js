import {
	createAdminCookie,
	hasAdminSecrets,
	internalError,
	isAdminRequest,
	json,
	loginRateLimitKey,
	requireSameOrigin
} from "../_shared.js";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export async function onRequestGet({ request, env }) {
	if (!hasAdminSecrets(env)) {
		return json({ error: "Organizer access is not configured. The site owner must set the Cloudflare admin secrets.", code: "ADMIN_NOT_CONFIGURED" }, 503);
	}
	return json({ authenticated: await isAdminRequest(request, env) });
}

export async function onRequestPost({ request, env }) {
	if (!hasAdminSecrets(env)) {
		return json({ error: "Organizer access is not configured. The site owner must set the Cloudflare admin secrets.", code: "ADMIN_NOT_CONFIGURED" }, 503);
	}
	if (!requireSameOrigin(request)) {
		return json({ error: "This login request was not accepted.", code: "INVALID_ORIGIN" }, 403);
	}

	let body;
	try {
		body = await request.json();
	} catch (error) {
		return json({ error: "Enter your organizer username and password.", code: "INVALID_REQUEST" }, 400);
	}
	if (
		!body ||
		typeof body.username !== "string" ||
		typeof body.password !== "string" ||
		body.username.length > 100 ||
		body.password.length > 256
	) {
		return json({ error: "Enter your organizer username and password.", code: "INVALID_CREDENTIALS" }, 400);
	}

	try {
		const now = Date.now();
		const ipHash = await loginRateLimitKey(request, env);
		const limit = await env.DB.prepare(
			"SELECT window_started_at, attempts, blocked_until FROM admin_login_limits WHERE ip_hash = ?"
		).bind(ipHash).first();
		if (limit?.blocked_until && Number(limit.blocked_until) > now) {
			return json({ error: "Too many login attempts. Please wait 15 minutes and try again.", code: "LOGIN_RATE_LIMITED" }, 429);
		}

		const expected = new TextEncoder().encode(env.ADMIN_PASSWORD);
		const provided = new TextEncoder().encode(body.password);
		let difference = expected.length ^ provided.length;
		for (let index = 0; index < Math.max(expected.length, provided.length); index++) {
			difference |= (expected[index] ?? 0) ^ (provided[index] ?? 0);
		}
		const valid = body.username === "admin" && difference === 0;

		if (!valid) {
			await env.DB.prepare(`
				INSERT INTO admin_login_limits (ip_hash, window_started_at, attempts, blocked_until)
				VALUES (?, ?, 1, NULL)
				ON CONFLICT(ip_hash) DO UPDATE SET
					attempts = CASE WHEN window_started_at <= ? THEN 1 ELSE attempts + 1 END,
					window_started_at = CASE WHEN window_started_at <= ? THEN excluded.window_started_at ELSE window_started_at END,
					blocked_until = CASE
						WHEN window_started_at <= ? THEN NULL
						WHEN attempts + 1 >= ? THEN ?
						ELSE blocked_until
					END
			`).bind(ipHash, now, now - WINDOW_MS, now - WINDOW_MS, now - WINDOW_MS, MAX_ATTEMPTS, now + WINDOW_MS).run();
			return json({ error: "The username or password is incorrect.", code: "INVALID_CREDENTIALS" }, 401);
		}

		await env.DB.prepare("DELETE FROM admin_login_limits WHERE ip_hash = ?").bind(ipHash).run();
		return new Response(JSON.stringify({ authenticated: true }), {
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "no-store",
				"Set-Cookie": await createAdminCookie(env)
			}
		});
	} catch (error) {
		return internalError(error);
	}
}

export async function onRequestDelete({ request, env }) {
	if (!requireSameOrigin(request)) return json({ error: "This logout request was not accepted.", code: "INVALID_ORIGIN" }, 403);
	return new Response(JSON.stringify({ authenticated: false }), {
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "no-store",
			"Set-Cookie": "pitz_pass_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"
		}
	});
}
