import { EVENTS, formatEventDate, formatEventTime, formatPrice } from "./events.js";
import {
	getAdminEvents,
	getAdminSession,
	getEvents,
	getInventory,
	getOrder,
	loginAdmin,
	logoutAdmin,
	placeOrder,
	updateAdminEvent
} from "./inventory.js";

const app = document.querySelector("#pitz-pass");
const MAP_WIDTH = 1800;
const MAP_HEIGHT = 930;

function mapViewportAspectRatio() {
	const mobile = window.matchMedia("(max-width: 700px)").matches;
	const width = Math.max(1, window.innerWidth - (mobile ? 0 : Math.max(340, window.innerWidth * 0.31)));
	const height = Math.max(1, mobile ? window.innerHeight * 0.57 : window.innerHeight - 62);
	return width / height;
}

function fullMapView() {
	const aspectRatio = mapViewportAspectRatio();
	const width = Math.max(MAP_WIDTH, MAP_HEIGHT * aspectRatio);
	const height = width / aspectRatio;
	return { x: (MAP_WIDTH - width) / 2, y: (MAP_HEIGHT - height) / 2, width, height };
}

const state = {
	eventId: null,
	selectedSeats: new Set(),
	sectionId: "",
	quantity: 1,
	paymentMethod: "apple",
	customerName: "",
	customerEmail: "",
	notice: "",
	busy: false,
	inventory: null,
	inventoryError: "",
	inventoryLoading: false,
	inventoryLoadingEventId: "",
	confirmationOrderId: "",
	confirmationOrder: null,
	confirmationError: "",
	confirmationLoading: false,
	confirmationLoadingId: "",
	organizerAuthenticated: false,
	organizerLoading: false,
	organizerError: "",
	organizerEvents: [],
	organizerSavingEventId: "",
	organizerNotice: "",
	organizerNoticeEventId: "",
	organizerChecked: false,
	eventSettingsError: "",
	mapView: fullMapView()
};
let mapGesture = null;
let suppressMapClick = false;

const logo = `
	<svg class="pp-mark" viewBox="0 0 44 44" role="img" aria-label="Pitz Pass">
		<rect x="2" y="2" width="40" height="40" rx="13" fill="currentColor" opacity=".12"></rect>
		<path d="M13 14h18v16H13zM17 19h10M17 23h6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path>
		<path d="m27 27 2.2 2.2 4.3-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path>
	</svg>`;

function escapeHTML(value) {
	return String(value).replace(/[&<>"']/g, (character) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#39;"
	})[character]);
}

function qrCodeSvg(payload) {
	const size = 29;
	const dataCapacity = 55;
	const eccLength = 15;
	const matrix = Array.from({ length: size }, () => Array(size).fill(null));
	const bytes = Array.from(new TextEncoder().encode(payload));
	if (bytes.length > 53) throw new Error("Ticket QR data is too long.");

	const bits = [];
	const appendBits = (value, length) => {
		for (let shift = length - 1; shift >= 0; shift -= 1) bits.push((value >>> shift) & 1);
	};
	appendBits(0b0100, 4);
	appendBits(bytes.length, 8);
	bytes.forEach((byte) => appendBits(byte, 8));
	for (let index = 0; index < Math.min(4, dataCapacity * 8 - bits.length); index += 1) bits.push(0);
	while (bits.length % 8) bits.push(0);

	const data = [];
	for (let index = 0; index < bits.length; index += 8) {
		data.push(bits.slice(index, index + 8).reduce((value, bit) => (value << 1) | bit, 0));
	}
	for (let pad = 0; data.length < dataCapacity; pad += 1) data.push(pad % 2 ? 0x11 : 0xec);

	const exp = new Array(512).fill(0);
	const log = new Array(256).fill(0);
	let fieldValue = 1;
	for (let index = 0; index < 255; index += 1) {
		exp[index] = fieldValue;
		log[fieldValue] = index;
		fieldValue <<= 1;
		if (fieldValue & 0x100) fieldValue ^= 0x11d;
	}
	for (let index = 255; index < exp.length; index += 1) exp[index] = exp[index - 255];
	const multiply = (left, right) => left && right ? exp[log[left] + log[right]] : 0;
	let generator = [1];
	for (let index = 0; index < eccLength; index += 1) {
		const next = new Array(generator.length + 1).fill(0);
		generator.forEach((coefficient, position) => {
			next[position] ^= coefficient;
			next[position + 1] ^= multiply(coefficient, exp[index]);
		});
		generator = next;
	}
	const remainder = new Array(eccLength).fill(0);
	data.forEach((byte) => {
		const factor = byte ^ remainder[0];
		remainder.shift();
		remainder.push(0);
		remainder.forEach((_, index) => { remainder[index] ^= multiply(generator[index + 1], factor); });
	});
	const codewords = [...data, ...remainder];

	const setFunction = (row, column, dark) => {
		if (row >= 0 && row < size && column >= 0 && column < size) matrix[row][column] = dark;
	};
	const addFinder = (top, left) => {
		for (let row = -1; row <= 7; row += 1) {
			for (let column = -1; column <= 7; column += 1) {
				const distance = Math.max(Math.abs(row - 3), Math.abs(column - 3));
				setFunction(top + row, left + column, distance !== 2 && distance !== 4);
			}
		}
	};
	addFinder(0, 0);
	addFinder(0, size - 7);
	addFinder(size - 7, 0);
	for (let index = 8; index < size - 8; index += 1) {
		setFunction(6, index, index % 2 === 0);
		setFunction(index, 6, index % 2 === 0);
	}
	for (let row = -2; row <= 2; row += 1) {
		for (let column = -2; column <= 2; column += 1) {
			setFunction(22 + row, 22 + column, Math.max(Math.abs(row), Math.abs(column)) !== 1);
		}
	}

	const formatPositions = [];
	for (let index = 0; index <= 5; index += 1) formatPositions.push([index, 8]);
	formatPositions.push([7, 8], [8, 8], [8, 7]);
	for (let index = 9; index < 15; index += 1) formatPositions.push([8, 14 - index]);
	for (let index = 0; index < 8; index += 1) formatPositions.push([8, size - 1 - index]);
	for (let index = 8; index < 15; index += 1) formatPositions.push([size - 15 + index, 8]);
	formatPositions.forEach(([row, column]) => setFunction(row, column, false));
	setFunction(size - 8, 8, true);

	const dataBits = codewords.flatMap((byte) =>
		Array.from({ length: 8 }, (_, index) => (byte >>> (7 - index)) & 1)
	);
	let bitIndex = 0;
	let upward = true;
	for (let right = size - 1; right >= 1; right -= 2) {
		if (right === 6) right = 5;
		for (let offset = 0; offset < size; offset += 1) {
			const row = upward ? size - 1 - offset : offset;
			for (let side = 0; side < 2; side += 1) {
				const column = right - side;
				if (matrix[row][column] !== null) continue;
				const value = dataBits[bitIndex] ?? 0;
				bitIndex += 1;
				matrix[row][column] = value ^ Number((row + column) % 2 === 0);
			}
		}
		upward = !upward;
	}

	const formatData = 0b01 << 3;
	let formatRemainder = formatData;
	for (let index = 0; index < 10; index += 1) {
		formatRemainder = (formatRemainder << 1) ^ ((formatRemainder >>> 9) * 0x537);
	}
	const formatBits = ((formatData << 10) | formatRemainder) ^ 0x5412;
	formatPositions.forEach(([row, column], index) => {
		matrix[row][column] = ((formatBits >>> index) & 1) !== 0;
	});
	setFunction(size - 8, 8, true);

	const path = matrix.flatMap((row, y) => row.flatMap((dark, x) =>
		dark ? [`M${x + 4} ${y + 4}h1v1h-1z`] : []
	)).join("");
	return `<svg class="pp-ticket-qr" viewBox="0 0 37 37" role="img" aria-label="Demo ticket QR code" shape-rendering="crispEdges"><rect width="37" height="37" fill="white"/><path d="${path}" fill="#1F3C72"/></svg>`;
}

function currentRoute() {
	const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
	if (!parts.length) return { name: "home" };
	if (parts[0] === "maya-show-info") return { name: "maya-show-info" };
	if (parts[0] === "organizer") return { name: "organizer" };
	if (parts[0] === "event" && parts[1]) return { name: "event", id: parts[1] };
	if (parts[0] === "checkout") return { name: "checkout" };
	if (parts[0] === "confirmation" && parts[1]) return { name: "confirmation", id: parts[1] };
	return { name: "home" };
}

function setNotice(message) {
	state.notice = message;
	render();
}

function eventById(eventId) {
	return EVENTS.find((event) => event.id === eventId) ?? null;
}

function applyEventSettings(events) {
	for (const updated of events) {
		const event = eventById(updated.id);
		if (!event) continue;
		Object.assign(event, updated, {
			venue: { ...event.venue, ...updated.venue }
		});
	}
}

function loadOrganizer() {
	if (state.organizerLoading) return;
	state.organizerLoading = true;
	state.organizerError = "";
	getAdminSession().then(async ({ authenticated }) => {
		state.organizerAuthenticated = authenticated;
		if (authenticated) {
			const result = await getAdminEvents();
			state.organizerEvents = result.events;
			applyEventSettings(result.events);
		}
		state.organizerChecked = true;
		state.organizerLoading = false;
		render();
	}).catch((error) => {
		state.organizerAuthenticated = false;
		state.organizerChecked = true;
		state.organizerLoading = false;
		state.organizerError = error.message;
		render();
	});
}

function renderOrganizer() {
	if (state.organizerLoading) {
		return `<main class="pp-page pp-organizer-page"><p class="pp-eyebrow pp-eyebrow--dark">ORGANIZER TOOLS</p><h1>Organizer access</h1><p aria-live="polite">Checking your sign-in…</p></main>`;
	}
	if (!state.organizerAuthenticated) {
		return `
			<main class="pp-page pp-organizer-page">
				<a class="pp-back-link" href="#/">← Back to events</a>
				<div class="pp-organizer-heading"><p class="pp-eyebrow pp-eyebrow--dark">STAFF ONLY</p><h1>Organizer sign in</h1><p>Sign in to update the public event information.</p></div>
				<form class="pp-organizer-login" data-organizer-login>
					<label class="pp-field">Username<input name="username" autocomplete="username" required maxlength="100"></label>
					<label class="pp-field">Password<input name="password" type="password" autocomplete="current-password" required maxlength="256"></label>
					${state.organizerError ? `<p class="pp-inline-error" role="alert">${escapeHTML(state.organizerError)}</p>` : ""}
					<button class="pp-button pp-button--navy" type="submit">Sign in</button>
				</form>
			</main>`;
	}

	const eventForms = state.organizerEvents.map((event) => `
		<form class="pp-organizer-event" data-organizer-event="${escapeHTML(event.id)}">
			<div class="pp-organizer-event-heading"><div><p class="pp-eyebrow pp-eyebrow--dark">${escapeHTML(event.type === "seated" ? "ASSIGNED SEATING" : "GENERAL ADMISSION")}</p><h2>${escapeHTML(event.title)} · ${escapeHTML(event.session)}</h2></div></div>
			<div class="pp-organizer-fields">
				<label class="pp-field">Event title<input name="title" value="${escapeHTML(event.title)}" required maxlength="100"></label>
				<label class="pp-field">Show or ticket label<input name="session" value="${escapeHTML(event.session)}" required maxlength="100"></label>
				<label class="pp-field">Date<input name="date" type="date" value="${escapeHTML(event.date)}" required></label>
				<label class="pp-field">Time<input name="time" type="time" value="${escapeHTML(event.time ?? "")}"></label>
				<label class="pp-field">Venue<input name="venueName" value="${escapeHTML(event.venue.name)}" required maxlength="120"></label>
				<label class="pp-field">Ticket price (USD)<input name="price" type="number" min="0" max="10000" step="0.01" value="${(event.priceCents / 100).toFixed(2)}" required></label>
				${event.type === "seated" ? `<label class="pp-field">Student arrival<input name="studentArrivalTime" value="${escapeHTML(event.studentArrivalTime)}" placeholder="4:30 PM" required></label>` : ""}
				<label class="pp-field pp-organizer-description">Description<textarea name="description" required maxlength="500" rows="3">${escapeHTML(event.description)}</textarea></label>
			</div>
			<div class="pp-organizer-event-actions"><button class="pp-button pp-button--navy" type="submit" ${state.organizerSavingEventId === event.id ? "disabled" : ""}>${state.organizerSavingEventId === event.id ? "Saving…" : "Save event details"}</button>${state.organizerNotice && state.organizerNoticeEventId === event.id ? `<span role="status">${escapeHTML(state.organizerNotice)}</span>` : ""}</div>
		</form>`).join("");

	return `
		<main class="pp-page pp-organizer-page">
			<div class="pp-organizer-topline"><a class="pp-back-link" href="#/">← Back to events</a><button class="pp-button pp-button--navy" type="button" data-organizer-logout>Sign out</button></div>
			<div class="pp-organizer-heading"><p class="pp-eyebrow pp-eyebrow--dark">STAFF ONLY</p><h1>Manage events</h1><p>Changes are saved to the shared database and appear on the public event pages.</p></div>
			${state.organizerError ? `<p class="pp-inline-error" role="alert">${escapeHTML(state.organizerError)}</p>` : ""}
			${state.organizerNotice && !state.organizerEvents.length ? `<p class="pp-inline-error" role="alert">${escapeHTML(state.organizerNotice)}</p>` : ""}
			${state.organizerEvents.length ? `<div class="pp-organizer-event-list">${eventForms}</div>` : `<p>No events are available to manage.</p>`}
		</main>`;
}

async function refreshEventInventory(eventId) {
	try {
		const inventory = await getInventory(eventId);
		if (state.eventId !== eventId || currentRoute().name !== "event") return;
		const currentSeats = state.inventory?.reservedSeats ?? [];
		const updatedSeats = inventory.reservedSeats ?? [];
		const unavailableSelections = [...state.selectedSeats].filter((seat) => updatedSeats.includes(seat));
		unavailableSelections.forEach((seat) => state.selectedSeats.delete(seat));
		if (unavailableSelections.length) {
			state.notice = "A selected seat was just reserved by someone else. Please choose another seat.";
		}
		const unchanged = state.inventory &&
			state.inventory.admitted === inventory.admitted &&
			currentSeats.length === updatedSeats.length &&
			currentSeats.every((seat) => updatedSeats.includes(seat));
		state.inventory = inventory;
		state.inventoryError = "";
		if (!unchanged || unavailableSelections.length) render();
	} catch (error) {
		if (state.eventId !== eventId || currentRoute().name !== "event") return;
		state.notice = "Live availability could not be refreshed. Your ticket choice will still be checked at checkout.";
		render();
	}
}

function loadEventInventory(eventId) {
	if (state.inventoryLoadingEventId === eventId) return;
	state.inventoryLoading = true;
	state.inventoryLoadingEventId = eventId;
	state.inventoryError = "";
	getInventory(eventId).then((inventory) => {
		if (state.inventoryLoadingEventId !== eventId) return;
		state.inventoryLoading = false;
		state.inventoryLoadingEventId = "";
		if (state.eventId !== eventId || currentRoute().name !== "event") return;
		state.inventory = inventory;
		render();
	}).catch((error) => {
		if (state.inventoryLoadingEventId !== eventId) return;
		state.inventoryLoading = false;
		state.inventoryLoadingEventId = "";
		if (state.eventId !== eventId || currentRoute().name !== "event") return;
		state.inventoryError = error.message;
		render();
	});
}

function loadConfirmationOrder(orderId) {
	if (state.confirmationLoadingId === orderId) return;
	state.confirmationLoading = true;
	state.confirmationLoadingId = orderId;
	state.confirmationError = "";
	getOrder(orderId).then((order) => {
		if (state.confirmationLoadingId !== orderId) return;
		state.confirmationLoading = false;
		state.confirmationLoadingId = "";
		if (currentRoute().name !== "confirmation" || currentRoute().id !== orderId) return;
		state.confirmationOrder = order;
		render();
	}).catch((error) => {
		if (state.confirmationLoadingId !== orderId) return;
		state.confirmationLoading = false;
		state.confirmationLoadingId = "";
		if (currentRoute().name !== "confirmation" || currentRoute().id !== orderId) return;
		state.confirmationError = error.message;
		render();
	});
}

function updateMapView(view = state.mapView) {
	const aspectRatio = view.width / view.height;
	const maxWidth = Math.max(MAP_WIDTH, MAP_HEIGHT * aspectRatio);
	const width = Math.max(maxWidth / 7, Math.min(maxWidth, view.width));
	const height = width / aspectRatio;
	const minX = width >= MAP_WIDTH ? (MAP_WIDTH - width) / 2 : 0;
	const maxX = width >= MAP_WIDTH ? minX : MAP_WIDTH - width;
	const minY = height >= MAP_HEIGHT ? (MAP_HEIGHT - height) / 2 : 0;
	const maxY = height >= MAP_HEIGHT ? minY : MAP_HEIGHT - height;
	state.mapView = {
		x: Math.max(minX, Math.min(maxX, view.x)),
		y: Math.max(minY, Math.min(maxY, view.y)),
		width,
		height
	};
	const map = app.querySelector(".pp-theater-overview");
	if (map) {
		const { x, y } = state.mapView;
		map.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
		const showSeats = height <= 750;
		map.classList.toggle("is-seat-level", showSeats);
		map.classList.toggle("is-overview", !showSeats);
		map.querySelectorAll(".pp-overview-seat").forEach((seat) => {
			seat.setAttribute("aria-hidden", String(!showSeats));
			seat.setAttribute("tabindex", showSeats ? "0" : "-1");
		});
	}
}

function zoomMap(factor, clientX, clientY) {
	const viewport = app.querySelector(".pp-map-overview-scroll");
	if (!viewport) return;
	const rect = viewport.getBoundingClientRect();
	const pointerX = clientX ?? rect.left + rect.width / 2;
	const pointerY = clientY ?? rect.top + rect.height / 2;
	const anchorX = Math.max(0, Math.min(1, (pointerX - rect.left) / rect.width));
	const anchorY = Math.max(0, Math.min(1, (pointerY - rect.top) / rect.height));
	const { x, y, width, height } = state.mapView;
	const maxWidth = Math.max(MAP_WIDTH, MAP_HEIGHT * width / height);
	const nextWidth = Math.max(maxWidth / 7, Math.min(maxWidth, width * factor));
	const nextHeight = height * nextWidth / width;
	updateMapView({
		x: x + anchorX * width - anchorX * nextWidth,
		y: y + anchorY * height - anchorY * nextHeight,
		width: nextWidth,
		height: nextHeight
	});
}

function focusMapSection(sectionId) {
	const sectionPositions = {
		"C1-upper": { x: 54, width: 246, y: 170, height: 315 },
		"C2-upper": { x: 303, width: 399, y: 170, height: 315 },
		"C3-upper": { x: 716, width: 410, y: 170, height: 315 },
		"C4-upper": { x: 1146, width: 411, y: 170, height: 315 },
		"C5-upper": { x: 1565, width: 184, y: 170, height: 315 },
		"C1-lower": { x: 54, width: 246, y: 518, height: 292 },
		"C2-lower": { x: 303, width: 399, y: 518, height: 292 },
		"C3-lower": { x: 716, width: 410, y: 518, height: 292 },
		"C4-lower": { x: 1146, width: 411, y: 518, height: 292 },
		"C5-lower": { x: 1565, width: 184, y: 518, height: 292 }
	};
	const section = sectionPositions[sectionId];
	if (!section) return updateMapView(fullMapView());
	const aspectRatio = mapViewportAspectRatio();
	const height = 560;
	const width = height * aspectRatio;
	updateMapView({
		x: section.x + section.width / 2 - width / 2,
		y: section.y + section.height / 2 - height / 2,
		width,
		height
	});
}

function header() {
	return `
		<header class="pp-header">
			<a class="pp-brand" href="#/" aria-label="Pitz Pass home">${logo}<span>Pitz <strong>Pass</strong></span></a>
			<nav class="pp-nav" aria-label="Main navigation">
				<a href="#/">Home</a>
				<a href="#events" data-scroll="events">Events</a>
				<a href="#/maya-show-info">Information</a>
				<a href="#/organizer">Organizer</a>
			</nav>
			<a class="pp-help" href="mailto:events@colegiomaya.edu.sv">Need help?</a>
		</header>`;
}

function renderHome() {
	const cardsFor = (events) => events.map((event, index) => `
		<a class="pp-event-card ${event.accent === "lime" ? "pp-event-card--lime" : event.accent === "red" ? "pp-event-card--red" : ""}" href="#/event/${event.id}">
			<div class="pp-card-topline"><span class="pp-pill">${event.type === "seated" ? "Assigned seating" : "General admission"}</span><span class="pp-card-number">0${index + 1}</span></div>
			<p class="pp-card-date">${escapeHTML(formatEventDate(event))}${event.time ? ` <span>·</span> ${escapeHTML(formatEventTime(event))}` : ""}</p>
			<h3>${escapeHTML(event.type === "general" ? event.title : event.session)}</h3>
			<p class="pp-card-venue">${escapeHTML(event.venue.name)}</p>
			<div class="pp-card-bottom"><span>From <strong>${formatPrice(event.priceCents)}</strong></span><span class="pp-arrow" aria-hidden="true">↗</span></div>
		</a>`).join("");
	const mayaShows = EVENTS.filter((event) => event.id === "maya-primary" || event.id === "maya-secondary");
	const familyEvents = EVENTS.filter((event) => event.id === "family-fest");
	const mayaTitle = mayaShows[0]?.title ?? "Maya Show";
	const familyTitle = familyEvents[0]?.title ?? "Family Fest";

	return `
		<main>
			<section class="pp-hero">
				<div class="pp-hero-copy">
					<p class="pp-eyebrow"><span class="pp-live-dot"></span> THE SCHOOL COMMUNITY, TOGETHER</p>
					<h1>Buy School<br><span>Event Tickets</span></h1>
					<p class="pp-hero-text">Current Event: ${escapeHTML(mayaTitle)}</p>
					<a class="pp-button pp-button--lime" href="#events" data-scroll="events">Explore shows <span aria-hidden="true">↓</span></a>
				</div>
				<div class="pp-hero-art pp-hero-gallery" aria-label="Colegio Maya student shows">
					<figure class="pp-hero-gallery-main">
						<img src="./assets/maya-show-costumes.webp" alt="Colegio Maya students in colorful show costumes onstage">
						<figcaption>Maya Show · student shows</figcaption>
					</figure>
					<figure><img src="./assets/maya-show-dance.webp" alt="Students dancing together under blue stage lights"></figure>
					<figure><img src="./assets/maya-show-stage.webp" alt="Students on a green-lit stage during a group number"></figure>
				</div>
			</section>

			<section class="pp-events-section" id="events">
				<div class="pp-section-heading"><div><p class="pp-eyebrow pp-eyebrow--dark">SAVE YOUR SEAT</p><h2>${escapeHTML(mayaTitle)}</h2></div><p>Join us for this special night you won't forget.</p></div>
				<a class="pp-info-link" href="#/maya-show-info"><span><strong>Maya Show schedule & event information</strong><small>See showtimes, student arrival times, venue, and entry details.</small></span><span class="pp-info-link-arrow" aria-hidden="true">→</span></a>
				<div class="pp-event-grid">${cardsFor(mayaShows)}</div>
			</section>

			<section class="pp-events-section pp-family-section" id="family-fest">
				<div class="pp-section-heading"><div><p class="pp-eyebrow pp-eyebrow--dark">ALL ARE WELCOME</p><h2>${escapeHTML(familyTitle)}</h2></div><p>Bring your family to this special day.<br>General admission tickets are ${formatPrice(familyEvents[0]?.priceCents ?? 100)} each.</p></div>
				<div class="pp-event-grid pp-family-event-grid">${cardsFor(familyEvents)}</div>
			</section>

		</main>`;
}

function renderMayaShowInfo() {
		const mayaShows = EVENTS.filter((event) => event.id === "maya-primary" || event.id === "maya-secondary");
		const mayaTitle = mayaShows[0]?.title ?? "Maya Show";
		const primaryShow = mayaShows.find((event) => event.id === "maya-primary");
		const scheduleDate = primaryShow ? formatEventDate(primaryShow).toUpperCase() : "";
		const venueName = primaryShow?.venue.name ?? "Teatro Presidente";
		const shows = mayaShows.map((event) => `
			<article class="pp-schedule-card">
				<div class="pp-schedule-card-heading">
					<p class="pp-eyebrow pp-eyebrow--dark">${escapeHTML(event.session)}</p>
					<h2>${escapeHTML(formatEventTime(event))}</h2>
				</div>
				<dl class="pp-schedule-details">
						<div><dt>Showtime</dt><dd>${escapeHTML(formatEventTime(event))}</dd></div>
					<div><dt>Student arrival</dt><dd>${escapeHTML(event.studentArrivalTime)}</dd></div>
					<div><dt>Venue</dt><dd>${escapeHTML(event.venue.name)}</dd></div>
				</dl>
					<a class="pp-button pp-button--navy" href="#/event/${event.id}">Buy ${escapeHTML(event.session.replace(" Show", ""))} Tickets<span aria-hidden="true">→</span></a>
			</article>`).join("");

		return `
			<main class="pp-page pp-info-page">
				<a class="pp-back-link" href="#/" data-scroll="events">← Back to shows</a>
				<section class="pp-info-heading">
					<p class="pp-eyebrow pp-eyebrow--dark">COLEGIO MAYA · EVENT INFORMATION</p>
					<h1>${escapeHTML(mayaTitle)}</h1>
					<p>Join us at ${escapeHTML(venueName)} on ${escapeHTML(primaryShow ? formatEventDate(primaryShow) : "")}, for an evening celebrating our students.</p>
				</section>
				<section class="pp-schedule-section" aria-labelledby="maya-show-schedule-title">
					<div class="pp-section-heading"><div><p class="pp-eyebrow pp-eyebrow--dark">${escapeHTML(scheduleDate)}</p><h2 id="maya-show-schedule-title">Show schedule</h2></div></div>
					<div class="pp-schedule-grid">${shows}</div>
				</section>
				<aside class="pp-ticket-reminder" role="note">
					<span class="pp-ticket-reminder-icon" aria-hidden="true">!</span>
					<div><h2>Please have your ticket ready</h2><p>Have your ticket ready to show the attendants when you arrive for entry.</p></div>
				</aside>
				<div class="pp-info-actions"><a class="pp-button pp-button--lime" href="#/" data-scroll="events">View shows <span aria-hidden="true">→</span></a></div>
			</main>`;
}

function renderSeatMap(event, inventory) {
	const reserved = new Set(inventory.reservedSeats);
	const seatLevel = state.mapView.height <= 750;
	const overviewSections = [
		{ id: "C1", x: 54, width: 246 },
		{ id: "C2", x: 303, width: 399 },
		{ id: "C3", x: 716, width: 410 },
		{ id: "C4", x: 1146, width: 411 },
		{ id: "C5", x: 1565, width: 184 }
	];
	const overview = overviewSections.map(({ id, x, width }) => {
		const section = event.seatMap.sections.find((item) => item.id === id);
		const splitIndex = event.seatMap.rows.indexOf("K");
		return ["upper", "lower"].map((half, halfIndex) => {
			const rows = event.seatMap.rows.filter((row, rowIndex) =>
				(halfIndex === 0 ? rowIndex < splitIndex : rowIndex >= splitIndex) && section.rows[row]
			);
			const panelY = halfIndex === 0 ? 170 : 518;
			const panelHeight = halfIndex === 0 ? 315 : 292;
			const firstSeatY = halfIndex === 0 ? 203 : 551;
			const sectionId = `${id}-${half}`;
			const sectionSeats = rows.flatMap((row) => section.rows[row].map((number) => `${id}-${row}-${number}`));
			const selectedCount = sectionSeats.filter((seat) => state.selectedSeats.has(seat)).length;
			const availableCount = sectionSeats.filter((seat) =>
				!reserved.has(seat) && !state.selectedSeats.has(seat)
			).length;
			const sectionStatus = selectedCount ? "is-selected-section" : availableCount ? "" : "is-sold-out";
			const sectionSummary = selectedCount
				? `${selectedCount} selected · ${availableCount} available`
				: `${availableCount} available`;
			const seatRows = rows.map((row, rowIndex) => {
				const numbers = section.rows[row];
				const centerY = firstSeatY + rowIndex * 23;
				const startX = x + 40;
				const availableWidth = width - 60;
				const spacing = numbers.length > 1 ? availableWidth / (numbers.length - 1) : 0;
				const seats = numbers.map((number, index) => {
					const seatId = `${id}-${row}-${number}`;
					const status = reserved.has(seatId) ? "taken" : state.selectedSeats.has(seatId) ? "selected" : "available";
					return `<g class="pp-overview-seat is-${status}" data-seat="${seatId}" role="button" aria-label="Column ${id}, row ${row}, seat ${number}, ${status}" aria-pressed="${status === "selected"}" aria-hidden="${!seatLevel}" tabindex="${seatLevel ? "0" : "-1"}" transform="translate(${(startX + index * spacing).toFixed(1)} ${centerY})"><circle r="7"/><text y="2.5">${number}</text></g>`;
				}).join("");
				return `<text class="pp-overview-row-label" x="${x + 18}" y="${centerY + 4}">${row}</text>${seats}`;
			}).join("");
			const titleY = halfIndex === 0 ? 160 : 508;
			const countY = halfIndex === 0 ? 193 : 541;
			return `
				<g class="pp-overview-section ${sectionStatus}" data-overview-section="${sectionId}" role="button" tabindex="0" aria-label="${escapeHTML(section.label)}, ${half} section, ${sectionSeats.length} seats, ${availableCount} available, ${selectedCount} selected">
					<rect class="pp-overview-panel" x="${x}" y="${panelY}" width="${width}" height="${panelHeight}" rx="12"/>
					<text class="pp-overview-section-title" x="${x + width / 2}" y="${titleY}">${id} · ${half === "upper" ? "Upper" : "Lower"}</text>
					<text class="pp-overview-section-count" x="${x + width / 2}" y="${countY}">${escapeHTML(sectionSummary)}</text>
					${seatRows}
				</g>`;
		}).join("");
	}).join("");
	return `
		<div class="pp-seat-map-wrap">
			<div class="pp-map-overview-scroll">
				<svg class="pp-theater-overview ${seatLevel ? "is-seat-level" : "is-overview"}" viewBox="${state.mapView.x} ${state.mapView.y} ${state.mapView.width} ${state.mapView.height}" role="group" aria-label="Interactive Teatro Presidente seating map. Zoom in to see individual seats; drag to explore.">
					<rect class="pp-overview-floor" x="49" y="112" width="1702" height="660" rx="5"/>
					${overview}
					<rect class="pp-overview-stage-box" x="550" y="822" width="700" height="88" rx="12"/>
					<text class="pp-overview-stage-label" x="900" y="877" text-anchor="middle">STAGE</text>
				</svg>
			</div>
			<div class="pp-map-toolbar">
				<p>Scroll or use + / − to zoom · drag to move · click seats to select</p>
				<div class="pp-map-controls" role="group" aria-label="Map zoom controls">
					<button type="button" data-map-zoom="in" aria-label="Zoom in">+</button>
					<button type="button" data-map-zoom="out" aria-label="Zoom out">−</button>
					<button type="button" data-map-reset aria-label="Reset map view">Reset</button>
				</div>
			</div>
			<div class="pp-seat-legend"><span><i class="pp-legend-dot is-available"></i>Available</span><span><i class="pp-legend-dot is-selected"></i>Selected</span><span><i class="pp-legend-dot is-taken"></i>Taken</span></div>
			<p class="pp-demo-map-note">The supplied chart lists ${event.ticketCapacity.toLocaleString()} unique numbered seats.</p>
		</div>`;
}

function renderEvent(event) {
	const inventory = state.inventory;
	const sold = event.type === "seated" ? inventory.reservedSeats.length : inventory.admitted;
	const remaining = event.ticketCapacity === null ? Infinity : Math.max(0, event.ticketCapacity - sold);
	const selectionCount = event.type === "seated" ? state.selectedSeats.size : state.quantity;
	const totalCents = event.priceCents * selectionCount;
	const soldOut = remaining === 0;
	const selection = event.type === "seated"
		? renderSeatMap(event, inventory)
		: `<div class="pp-ga-card"><div class="pp-ga-icon">✳</div><p class="pp-eyebrow pp-eyebrow--dark">ONE EASY TICKET</p><h2>General admission</h2><p>Choose how many tickets your group needs. ${event.id === "family-fest" ? "Each ticket admits one guest." : "Seating is first come, first served."}</p><div class="pp-quantity"><button type="button" data-quantity="-1" aria-label="Remove one ticket" ${state.quantity <= 1 ? "disabled" : ""}>−</button><strong>${state.quantity}</strong><button type="button" data-quantity="1" aria-label="Add one ticket" ${state.quantity >= remaining ? "disabled" : ""}>+</button><span>tickets</span></div><p class="pp-remaining">${event.ticketCapacity === null ? "No ticket limit in this demo" : `${remaining} tickets remaining`}</p></div>`;
	const selectedLabel = event.type === "seated"
		? [...state.selectedSeats].sort().map((seat) => {
			const [column, row, number] = seat.split("-");
			return `<div class="pp-ticket-selection"><div class="pp-ticket-selection-detail"><span>Column <strong>${escapeHTML(column)}</strong></span><span>Row <strong>${escapeHTML(row)}</strong></span><span>Seat <strong>${escapeHTML(number)}</strong></span></div><button class="pp-remove-seat" type="button" data-remove-seat="${escapeHTML(seat)}" aria-label="Remove column ${escapeHTML(column)}, row ${escapeHTML(row)}, seat ${escapeHTML(number)}">Remove</button></div>`;
		}).join("") || `<span class="pp-empty-selection">Choose seats on the map</span>`
		: `<span>${state.quantity} ${state.quantity === 1 ? "ticket" : "tickets"}</span>`;

	return `
		<main class="pp-page pp-event-page">
			<a class="pp-back-link" href="#/">← All shows</a>
			<div class="pp-detail-heading"><div><p class="pp-eyebrow pp-eyebrow--dark">${escapeHTML(event.title)} · ${escapeHTML(event.session)}</p><h1>Pick your tickets.</h1><p class="pp-detail-description">${escapeHTML(event.description)}</p></div><span class="pp-pill">${event.type === "seated" ? "Choose your seat" : "General admission"}</span></div>
			<div class="pp-event-layout">
				<section class="pp-selection-panel">
					<div class="pp-panel-heading"><div><h2>${event.type === "seated" ? "Select your seats" : "Select quantity"}</h2><p>${event.type === "seated" ? "Tap any available seat to add or remove it." : "Tickets are not assigned to specific seats."}</p></div><span class="pp-price-tag">${formatPrice(event.priceCents)} <small>/ ticket</small></span></div>
					${soldOut ? `<div class="pp-empty-state"><strong>This show is sold out.</strong><span>Please check the other show for availability.</span></div>` : selection}
				</section>
				<aside class="pp-order-card">
					<a class="pp-ticketing-back" href="#/">← All shows</a>
					<p class="pp-eyebrow pp-eyebrow--dark">YOUR ORDER</p><h2>${escapeHTML(event.title)}</h2>
					<div class="pp-order-event">${escapeHTML(event.session)}<span>${escapeHTML(formatEventDate(event))}${event.time ? ` · ${escapeHTML(formatEventTime(event))}` : ""}</span></div>
					<div class="pp-order-event">${escapeHTML(event.venue.name)}<span>${event.type === "seated" ? `${remaining.toLocaleString()} numbered seats available across the seating columns` : event.ticketCapacity === null ? "General admission · no ticket limit in this demo" : `${remaining.toLocaleString()} general-admission tickets remaining`}</span></div>
					<div class="pp-order-selected"><span>${event.type === "seated" ? `Tickets selected · ${state.selectedSeats.size}` : "Tickets"}</span><div>${selectedLabel}</div></div>
					<div class="pp-order-total"><span>Subtotal</span><strong>${formatPrice(totalCents)}</strong></div>
					${state.notice ? `<p class="pp-inline-error" role="alert">${escapeHTML(state.notice)}</p>` : ""}
					<button class="pp-button pp-button--navy pp-continue" type="button" data-action="checkout" ${selectionCount < 1 || soldOut ? "disabled" : ""}>Continue to checkout <span aria-hidden="true">→</span></button>
					<p class="pp-secure-note">No payment is collected in this demo.</p>
				</aside>
			</div>
		</main>`;
}

function renderCheckout(event) {
	const selectionCount = event.type === "seated" ? state.selectedSeats.size : state.quantity;
	const selectedSeats = [...state.selectedSeats].sort();
	const ticketLine = event.type === "seated"
		? `${selectionCount} ${selectionCount === 1 ? "seat" : "seats"}${selectedSeats.length ? ` · ${selectedSeats.join(", ")}` : ""}`
		: `${selectionCount} ${selectionCount === 1 ? "general-admission ticket" : "general-admission tickets"}`;
	const totalCents = event.priceCents * selectionCount;
	const walletLabel = state.paymentMethod === "apple" ? "Apple Pay" : state.paymentMethod === "google" ? "Google Pay" : "Card";
	const cardForm = state.paymentMethod === "card" ? `
		<div class="pp-demo-card-notice" id="card-demo-note" role="note"><strong>Demo card only</strong><span>Use 4242 4242 4242 4242 · any future expiry (e.g. 12/30) · security code 123. Never enter a real card.</span></div>
		<div class="pp-card-fields">
			<label class="pp-field pp-card-field--full">Name on card<input name="cardholder" autocomplete="off" placeholder="Demo Cardholder" required maxlength="100"></label>
			<label class="pp-field pp-card-field--full">Card number<input name="cardNumber" type="text" inputmode="numeric" autocomplete="off" placeholder="4242 4242 4242 4242" required maxlength="19" pattern="(?:4242 ?){3}4242" aria-describedby="card-demo-note"></label>
			<label class="pp-field">Expiry date<input name="cardExpiry" type="text" inputmode="numeric" autocomplete="off" placeholder="MM/YY" required maxlength="5" pattern="(?:0[1-9]|1[0-2])/[0-9]{2}"></label>
			<label class="pp-field">Security code<input name="cardCvc" type="password" inputmode="numeric" autocomplete="off" placeholder="123" required maxlength="3" pattern="[0-9]{3}"></label>
			<label class="pp-field pp-card-field--full">Billing address<input name="billingAddress" autocomplete="off" placeholder="Street address" required maxlength="120"></label>
			<label class="pp-field">City<input name="billingCity" autocomplete="off" placeholder="City" required maxlength="80"></label>
			<label class="pp-field">Postal code<input name="billingPostal" autocomplete="off" placeholder="Postal code" required maxlength="16"></label>
			<label class="pp-field pp-card-field--full">Country / region<select name="billingCountry" required><option value="SV" selected>El Salvador</option><option value="US">United States</option><option value="GT">Guatemala</option><option value="HN">Honduras</option><option value="NI">Nicaragua</option><option value="CR">Costa Rica</option><option value="OTHER">Other</option></select></label>
		</div>` : "";

	return `
		<main class="pp-page pp-checkout-page">
			<a class="pp-back-link" href="#/event/${event.id}">← Back to ticket selection</a>
			<div class="pp-checkout-heading"><p class="pp-eyebrow pp-eyebrow--dark">ALMOST THERE</p><h1>Secure checkout</h1><p>Review your details and complete this demo order.</p></div>
			<div class="pp-checkout-layout">
				<form class="pp-checkout-form" id="checkout-form">
					<section class="pp-form-section"><div class="pp-form-title"><span>01</span><div><h2>Your details</h2><p>We’ll send your confirmation here.</p></div></div><label class="pp-field">Full name<input name="name" autocomplete="name" placeholder="Your name" value="${escapeHTML(state.customerName)}" required maxlength="100"></label><label class="pp-field">Email address<input name="email" type="email" autocomplete="email" placeholder="you@example.com" value="${escapeHTML(state.customerEmail)}" required maxlength="254"></label></section>
					<section class="pp-form-section"><div class="pp-form-title"><span>02</span><div><h2>Payment method</h2><p>Choose a simulated payment option.</p></div></div><div class="pp-payment-options" role="group" aria-label="Simulated payment method"><button type="button" class="pp-payment-option ${state.paymentMethod === "apple" ? "is-active" : ""}" data-payment="apple" aria-pressed="${state.paymentMethod === "apple"}"><span class="pp-payment-brand">● Pay</span><small>Apple Pay</small></button><button type="button" class="pp-payment-option ${state.paymentMethod === "google" ? "is-active" : ""}" data-payment="google" aria-pressed="${state.paymentMethod === "google"}"><span class="pp-payment-brand pp-google">G Pay</span><small>Google Pay</small></button><button type="button" class="pp-payment-option ${state.paymentMethod === "card" ? "is-active" : ""}" data-payment="card" aria-pressed="${state.paymentMethod === "card"}"><span class="pp-payment-brand">▰▰</span><small>Card</small></button></div>
						${cardForm}
						<div class="pp-demo-payment"><span class="pp-lock">⌑</span><span><strong>${walletLabel} demo</strong><small>Demo only. No payment is processed. Card fields are never saved or sent.</small></span><span class="pp-demo-tag">DEMO</span></div>
					</section>
					${state.notice ? `<p class="pp-inline-error" role="alert">${escapeHTML(state.notice)}</p>` : ""}
					<button class="pp-button pp-button--lime pp-place-order" type="submit" ${state.busy ? "disabled" : ""}>${state.busy ? "Completing demo order…" : `Pay ${formatPrice(totalCents)} · Demo`}</button>
				</form>
				<aside class="pp-order-card pp-checkout-summary"><p class="pp-eyebrow pp-eyebrow--dark">ORDER SUMMARY</p><h2>${escapeHTML(event.title)}</h2><p class="pp-summary-session">${escapeHTML(event.session)}</p><div class="pp-summary-detail">${escapeHTML(formatEventDate(event))}${event.time ? `<br>${escapeHTML(formatEventTime(event))}` : ""}<br>${escapeHTML(event.venue.name)}</div><div class="pp-summary-ticket"><span>${escapeHTML(ticketLine)}</span><strong>${formatPrice(totalCents)}</strong></div><div class="pp-order-total"><span>Total</span><strong>${formatPrice(totalCents)}</strong></div><p class="pp-secure-note">This is a simulation; no money will be charged.</p></aside>
			</div>
		</main>`;
}

function renderConfirmation(order) {
	if (!order) {
		return `<main class="pp-page pp-empty-state"><strong>We couldn’t find that order.</strong><span>It may have been cleared from this browser.</span><a class="pp-button pp-button--navy" href="#/">Browse shows</a></main>`;
	}
	const event = eventById(order.eventId);
	if (!event) return `<main class="pp-page pp-empty-state"><strong>Event details are unavailable.</strong><a class="pp-button pp-button--navy" href="#/">Browse shows</a></main>`;
	const tickets = event.type === "seated"
		? order.seatIds.map((seatId) => ({ seatId, label: seatId }))
		: Array.from({ length: order.quantity }, (_, index) => ({
			seatId: `GA-${String(index + 1).padStart(2, "0")}`,
			label: `General admission · ${index + 1} of ${order.quantity}`
		}));
	const passes = tickets.map(({ seatId, label }, index) => {
		const [column, row, seat] = event.type === "seated" ? seatId.split("-") : [];
		const ticketInfo = event.type === "seated"
			? `<div><span>SECTION</span><strong>${escapeHTML(column)}</strong></div><div><span>ROW</span><strong>${escapeHTML(row)}</strong></div><div><span>SEAT</span><strong>${escapeHTML(seat)}</strong></div>`
			: `<div class="pp-wallet-ga"><span>ADMISSION</span><strong>${escapeHTML(label)}</strong></div>`;
		const qr = qrCodeSvg(`PITZ|${order.id}|${seatId}`);
		return `
			<article class="pp-wallet-pass" aria-label="Wallet-style demo ticket ${index + 1}">
				<div class="pp-wallet-header"><span class="pp-wallet-logo">P</span><span>PITZ PASS <small>DEMO TICKET</small></span><span class="pp-wallet-pass-count">${index + 1} / ${tickets.length}</span></div>
				<div class="pp-wallet-event"><p>${escapeHTML(event.session)} · ${escapeHTML(event.title.toUpperCase())}</p><h2>${escapeHTML(event.title)}</h2><strong>${escapeHTML(event.venue.name)}</strong></div>
				<div class="pp-wallet-details"><div><span>DATE</span><strong>${escapeHTML(formatEventDate(event))}</strong></div>${event.time ? `<div><span>TIME</span><strong>${escapeHTML(formatEventTime(event))}</strong></div>` : ""}${ticketInfo}</div>
				<div class="pp-wallet-code-area"><div>${qr}<span>Scan at the door</span></div><div class="pp-wallet-order"><span>ORDER</span><strong>${escapeHTML(order.id)}</strong><span>TICKET ${index + 1} OF ${tickets.length}</span></div></div>
				<div class="pp-wallet-demo">DEMO PASS · QR CODE IS NOT VALID FOR ENTRY</div>
			</article>`;
	}).join("");
	return `
		<main class="pp-page pp-confirm-page">
			<div class="pp-confirm-intro"><div class="pp-success-icon">✓</div><p class="pp-eyebrow pp-eyebrow--dark">DEMO ORDER COMPLETE</p><h1>Your tickets are ready.</h1><p>This simulated order for <strong>${escapeHTML(order.customer.email)}</strong> did not charge a payment method. Tickets below are previews and are not valid for entry.</p></div>
			<div class="pp-wallet-pass-list">${passes}</div>
			<aside class="pp-apple-wallet-demo" role="note">
				<img src="./assets/apple-wallet-badge.png" alt="Add to Apple Wallet badge — demo preview only">
				<p>This is a visual demo only. These tickets cannot be added to Apple Wallet.</p>
			</aside>
			<div class="pp-confirm-total"><span>DEMO ORDER TOTAL</span><strong>${formatPrice(order.totalCents)}</strong><span>Order ${escapeHTML(order.id)}</span></div>
			<div class="pp-confirm-actions"><a class="pp-button pp-button--navy" href="#/">Explore more events <span aria-hidden="true">→</span></a></div>
		</main>`;
}

function render() {
	const route = currentRoute();
	let page;
	try {
		if (route.name === "event") {
			const event = eventById(route.id);
			if (!event) page = `<main class="pp-page pp-empty-state"><strong>That show could not be found.</strong><a class="pp-button pp-button--navy" href="#/">Browse shows</a></main>`;
			else {
				if (state.eventId !== event.id) {
					state.eventId = event.id;
					state.selectedSeats.clear();
					state.sectionId = "C3-upper";
					state.mapView = fullMapView();
					state.quantity = 1;
					state.notice = "";
					state.inventory = null;
					state.inventoryError = "";
					state.inventoryLoading = false;
					state.inventoryLoadingEventId = "";
				}
				if (state.inventory) {
					page = renderEvent(event);
				} else if (state.inventoryError) {
					page = `<main class="pp-page pp-empty-state" role="alert"><strong>Ticket availability is unavailable.</strong><span>${escapeHTML(state.inventoryError)}</span><button class="pp-button pp-button--navy" type="button" data-retry-inventory>Try again</button></main>`;
				} else {
					page = `<main class="pp-page pp-empty-state" aria-live="polite"><strong>Checking live ticket availability…</strong></main>`;
					loadEventInventory(event.id);
				}
			}
		} else if (route.name === "maya-show-info") {
			page = renderMayaShowInfo();
		} else if (route.name === "organizer") {
			if (!state.organizerChecked && !state.organizerLoading) loadOrganizer();
			page = renderOrganizer();
		} else if (route.name === "checkout") {
			const event = eventById(state.eventId);
			page = event && (event.type === "general" ? state.quantity > 0 : state.selectedSeats.size > 0)
				? renderCheckout(event)
				: `<main class="pp-page pp-empty-state"><strong>Your ticket selection is empty.</strong><span>Choose a show and tickets to continue.</span><a class="pp-button pp-button--navy" href="#/">Browse shows</a></main>`;
		} else if (route.name === "confirmation") {
			if (state.confirmationOrderId !== route.id) {
				state.confirmationOrderId = route.id;
				state.confirmationOrder = null;
				state.confirmationError = "";
				state.confirmationLoading = false;
			}
			if (state.confirmationOrder) {
				page = renderConfirmation(state.confirmationOrder);
			} else if (state.confirmationError) {
				page = `<main class="pp-page pp-empty-state" role="alert"><strong>Ticket confirmation is unavailable.</strong><span>${escapeHTML(state.confirmationError)}</span><a class="pp-button pp-button--navy" href="#/">Browse shows</a></main>`;
			} else {
				page = `<main class="pp-page pp-empty-state" aria-live="polite"><strong>Loading your ticket confirmation…</strong></main>`;
				loadConfirmationOrder(route.id);
			}
		} else {
			page = renderHome();
		}
	} catch (error) {
		page = `<main class="pp-page pp-empty-state" role="alert"><strong>Ticket information is unavailable.</strong><span>${escapeHTML(error.message)}</span><a class="pp-button pp-button--navy" href="#/">Return home</a></main>`;
	}
	app.innerHTML = `${header()}${state.eventSettingsError ? `<p class="pp-config-warning" role="alert">${escapeHTML(state.eventSettingsError)}</p>` : ""}${page}<footer class="pp-footer"><a class="pp-brand" href="#/">${logo}<span>Pitz <strong>Pass</strong></span></a><span>Created by Mateo, Amilcar, Gerardo, Allen.</span></footer>`;
	app.classList.toggle("pp-app--ticketing", route.name === "event" && page.includes("pp-event-page"));
}

app.addEventListener("click", async (event) => {
	if (suppressMapClick && event.target.closest(".pp-map-overview-scroll")) {
		event.preventDefault();
		return;
	}

	const mapZoom = event.target.closest("[data-map-zoom]");
	if (mapZoom) {
		zoomMap(mapZoom.dataset.mapZoom === "in" ? 0.75 : 4 / 3);
		return;
	}
	if (event.target.closest("[data-map-reset]")) {
		updateMapView(fullMapView());
		return;
	}

	const removeSeatButton = event.target.closest("[data-remove-seat]");
	if (removeSeatButton) {
		state.selectedSeats.delete(removeSeatButton.dataset.removeSeat);
		state.notice = "";
		render();
		return;
	}

	const scrollLink = event.target.closest("[data-scroll]");
	if (scrollLink) {
		event.preventDefault();
		const targetId = scrollLink.dataset.scroll;
		const scrollToTarget = () => document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth" });
		if (currentRoute().name !== "home") {
			location.hash = "#/";
			window.setTimeout(scrollToTarget, 0);
		} else {
			scrollToTarget();
		}
		return;
	}

	const seatButton = event.target.closest("[data-seat]");
	if (seatButton && !seatButton.disabled) {
		if (seatButton.classList.contains("is-taken")) return;
		const seat = seatButton.dataset.seat;
		state.selectedSeats.has(seat) ? state.selectedSeats.delete(seat) : state.selectedSeats.add(seat);
		const [column, row] = seat.split("-");
		state.sectionId = `${column}-${"WVUTSRQPONML".includes(row) ? "upper" : "lower"}`;
		state.notice = "";
		render();
		updateMapView();
		return;
	}

	const sectionButton = event.target.closest("[data-section]");
	if (sectionButton) {
		state.sectionId = sectionButton.dataset.section;
		state.notice = "";
		render();
		focusMapSection(state.sectionId);
		return;
	}

	const overviewSection = event.target.closest("[data-overview-section]");
	if (overviewSection) {
		state.sectionId = overviewSection.dataset.overviewSection;
		state.notice = "";
		render();
		focusMapSection(state.sectionId);
		return;
	}

	const quantityButton = event.target.closest("[data-quantity]");
	if (quantityButton) {
		const currentEvent = eventById(state.eventId);
		if (!currentEvent) return;
		const admitted = state.inventory?.admitted ?? 0;
		const remaining = currentEvent.ticketCapacity === null
			? Infinity
			: currentEvent.ticketCapacity - admitted;
		state.quantity = Math.max(1, Math.min(remaining, state.quantity + Number(quantityButton.dataset.quantity)));
		state.notice = "";
		render();
		return;
	}

	const paymentButton = event.target.closest("[data-payment]");
	if (paymentButton) {
		state.paymentMethod = paymentButton.dataset.payment;
		render();
		return;
	}

	if (event.target.closest('[data-action="checkout"]')) {
		state.notice = "";
		location.hash = "#/checkout";
		return;
	}
	if (event.target.closest("[data-retry-inventory]")) {
		state.inventoryError = "";
		state.inventoryLoading = false;
		render();
		return;
	}
	if (event.target.closest("[data-organizer-logout]")) {
		state.organizerLoading = true;
		render();
		try {
			await logoutAdmin();
			state.organizerAuthenticated = false;
			state.organizerChecked = true;
			state.organizerEvents = [];
			state.organizerError = "";
			state.organizerLoading = false;
		} catch (error) {
			state.organizerLoading = false;
			state.organizerError = error.message;
		}
		render();
		return;
	}
});

app.addEventListener("keydown", (event) => {
	const seat = event.target.closest("[data-seat]");
	if (seat && (event.key === "Enter" || event.key === " ")) {
		event.preventDefault();
		seat.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
		return;
	}
	if ((event.key === "Enter" || event.key === " ") && event.target.closest("[data-overview-section]")) {
		event.preventDefault();
		state.sectionId = event.target.closest("[data-overview-section]").dataset.overviewSection;
		state.notice = "";
		render();
		focusMapSection(state.sectionId);
	}
});

app.addEventListener("pointerdown", (event) => {
	const viewport = event.target.closest(".pp-map-overview-scroll");
	if (!viewport || event.button !== 0) return;
	mapGesture = {
		startX: event.clientX,
		startY: event.clientY,
		initialView: { ...state.mapView },
		moved: false
	};
});

window.addEventListener("pointermove", (event) => {
	if (!mapGesture) return;
	const deltaX = event.clientX - mapGesture.startX;
	const deltaY = event.clientY - mapGesture.startY;
	if (!mapGesture.moved && Math.hypot(deltaX, deltaY) < 4) return;
	mapGesture.moved = true;
	const viewport = app.querySelector(".pp-map-overview-scroll");
	if (!viewport) return;
	const rect = viewport.getBoundingClientRect();
	updateMapView({
		...mapGesture.initialView,
		x: mapGesture.initialView.x - deltaX * mapGesture.initialView.width / rect.width,
		y: mapGesture.initialView.y - deltaY * mapGesture.initialView.height / rect.height
	});
	viewport.classList.add("is-dragging");
});

window.addEventListener("pointerup", () => {
	if (!mapGesture) return;
	if (mapGesture.moved) {
		suppressMapClick = true;
		window.setTimeout(() => { suppressMapClick = false; }, 0);
	}
	app.querySelector(".pp-map-overview-scroll")?.classList.remove("is-dragging");
	mapGesture = null;
});

window.addEventListener("pointercancel", () => {
	app.querySelector(".pp-map-overview-scroll")?.classList.remove("is-dragging");
	mapGesture = null;
});

window.addEventListener("resize", () => {
	if (!app.classList.contains("pp-app--ticketing")) return;
	const previous = state.mapView;
	const previousMaxWidth = Math.max(MAP_WIDTH, MAP_HEIGHT * previous.width / previous.height);
	if (previous.width >= previousMaxWidth - 0.5) {
		updateMapView(fullMapView());
		return;
	}
	const aspectRatio = mapViewportAspectRatio();
	const zoomRatio = previous.width / previousMaxWidth;
	const maxWidth = Math.max(MAP_WIDTH, MAP_HEIGHT * aspectRatio);
	const width = Math.max(maxWidth / 7, maxWidth * zoomRatio);
	const height = width / aspectRatio;
	updateMapView({
		x: previous.x + previous.width / 2 - width / 2,
		y: previous.y + previous.height / 2 - height / 2,
		width,
		height
	});
});

app.addEventListener("wheel", (event) => {
	if (!event.target.closest(".pp-map-overview-scroll")) return;
	event.preventDefault();
	zoomMap(event.deltaY < 0 ? 0.85 : 1.18, event.clientX, event.clientY);
}, { passive: false });

app.addEventListener("input", (event) => {
	if (event.target.name === "name") state.customerName = event.target.value;
	if (event.target.name === "email") state.customerEmail = event.target.value;
	if (event.target.name === "cardNumber") {
		const digits = event.target.value.replace(/\D/g, "").slice(0, 16);
		event.target.value = digits.replace(/(\d{4})(?=\d)/g, "$1 ");
	}
	if (event.target.name === "cardExpiry") {
		const digits = event.target.value.replace(/\D/g, "").slice(0, 4);
		event.target.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
	}
	if (event.target.name === "cardCvc") {
		event.target.value = event.target.value.replace(/\D/g, "").slice(0, 3);
	}
});

app.addEventListener("submit", async (event) => {
	const loginForm = event.target.closest("[data-organizer-login]");
	if (loginForm) {
		event.preventDefault();
		const credentials = new FormData(loginForm);
		state.organizerLoading = true;
		state.organizerError = "";
		render();
		try {
			await loginAdmin(String(credentials.get("username") ?? ""), String(credentials.get("password") ?? ""));
			state.organizerAuthenticated = true;
			state.organizerChecked = true;
			const result = await getAdminEvents();
			state.organizerEvents = result.events;
			applyEventSettings(result.events);
			state.organizerLoading = false;
		} catch (error) {
			state.organizerAuthenticated = false;
			state.organizerChecked = true;
			state.organizerLoading = false;
			state.organizerError = error.message;
		}
		render();
		return;
	}

	const organizerForm = event.target.closest("[data-organizer-event]");
	if (organizerForm) {
		event.preventDefault();
		const eventId = organizerForm.dataset.organizerEvent;
		const values = new FormData(organizerForm);
		const settings = Object.fromEntries(
			["title", "session", "date", "time", "venueName", "price", "description", "studentArrivalTime"]
				.map((key) => [key, String(values.get(key) ?? "")])
		);
		state.organizerSavingEventId = eventId;
		state.organizerNotice = "";
		state.organizerNoticeEventId = eventId;
		render();
		try {
			const result = await updateAdminEvent(eventId, settings);
			state.organizerEvents = state.organizerEvents.map((item) =>
				item.id === eventId ? result.event : item
			);
			applyEventSettings([result.event]);
			state.organizerNotice = `${result.event.title} details saved.`;
			state.organizerNoticeEventId = eventId;
			state.organizerSavingEventId = "";
		} catch (error) {
			state.organizerNotice = error.message;
			state.organizerSavingEventId = "";
			if (error.code === "UNAUTHORIZED") {
				state.organizerAuthenticated = false;
				state.organizerChecked = true;
				state.organizerError = error.message;
			}
		}
		render();
		return;
	}

	if (event.target.id !== "checkout-form") return;
	event.preventDefault();
	if (state.busy) return;
	const currentEvent = eventById(state.eventId);
	if (!currentEvent) return setNotice("Choose a show before checking out.");
	const formData = new FormData(event.target);
	if (state.paymentMethod === "card") {
		const cardNumber = String(formData.get("cardNumber") ?? "").replace(/\D/g, "");
		const cardExpiry = String(formData.get("cardExpiry") ?? "");
		const [month, year] = cardExpiry.split("/").map(Number);
		const expiryYear = 2000 + year;
		const now = new Date();
		const isFutureExpiry = Number.isInteger(month) && Number.isInteger(year) && month >= 1 && month <= 12 &&
			(expiryYear > now.getFullYear() || (expiryYear === now.getFullYear() && month >= now.getMonth() + 1));
		if (cardNumber !== "4242424242424242" || formData.get("cardCvc") !== "123" || !isFutureExpiry) {
			state.notice = "Use only the demo card number, a future expiry date, and security code 123. Real payment cards are not accepted.";
			render();
			return;
		}
	}
	const quantity = currentEvent.type === "seated" ? state.selectedSeats.size : state.quantity;
	state.busy = true;
	state.notice = "";
	render();

	try {
		const order = await placeOrder({
			eventId: currentEvent.id,
			seatIds: [...state.selectedSeats],
			quantity,
			customer: { name: formData.get("name"), email: formData.get("email") },
			paymentMethod: state.paymentMethod
		});
		state.busy = false;
		state.selectedSeats.clear();
		state.quantity = 1;
		state.customerName = "";
		state.customerEmail = "";
		location.hash = `#/confirmation/${order.id}`;
	} catch (error) {
		state.busy = false;
		state.notice = error.message;
		if (error.code === "SEATS_UNAVAILABLE") {
			try {
				const inventory = await getInventory(currentEvent.id);
				const reservedSeats = new Set(inventory.reservedSeats);
				const unavailableSelections = [...state.selectedSeats].filter((seat) => reservedSeats.has(seat));
				unavailableSelections.forEach((seat) => state.selectedSeats.delete(seat));
				state.inventory = inventory;
				if (unavailableSelections.length) {
					state.notice = "One or more selected seats were just reserved by someone else. They have been removed from your order.";
				}
			} catch (refreshError) {
				state.notice = `${error.message} Live availability could not be refreshed: ${refreshError.message}`;
			}
		}
		render();
	}
});

window.addEventListener("hashchange", render);
window.addEventListener("hashchange", () => {
	if (currentRoute().name === "event" && state.eventId) void refreshEventInventory(state.eventId);
});
window.addEventListener("focus", () => {
	if (currentRoute().name === "event" && state.eventId) void refreshEventInventory(state.eventId);
});
window.setInterval(() => {
	if (currentRoute().name === "event" && state.eventId) void refreshEventInventory(state.eventId);
}, 15000);

getEvents().then((events) => {
	applyEventSettings(events);
	render();
}).catch((error) => {
	state.eventSettingsError = `Event details could not be refreshed from the shared service. ${error.message}`;
	render();
});
render();
