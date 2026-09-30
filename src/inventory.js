import { EVENTS } from "./events.js";

const STORAGE_KEY = "pitz-pass-demo-v7";
const emptyStore = () => ({
	reservations: Object.fromEntries(
		EVENTS.map((event) => [event.id, [...event.initiallyUnavailable]])
	),
	admissions: Object.fromEntries(EVENTS.map((event) => [event.id, 0])),
	orders: []
});

function readStore() {
	let saved;
	try {
		saved = window.localStorage.getItem(STORAGE_KEY);
	} catch (error) {
		throw new Error("Ticket inventory could not be accessed in this browser. Please enable local storage and try again.", { cause: error });
	}

	if (saved === null) {
		const initial = emptyStore();
		writeStore(initial);
		return initial;
	}

	let store;
	try {
		store = JSON.parse(saved);
	} catch (error) {
		throw new Error("Saved ticket data could not be read. Clear this site's local storage to restart the demo.", { cause: error });
	}

	if (
		!store ||
		typeof store !== "object" ||
		!store.reservations ||
		!store.admissions ||
		!Array.isArray(store.orders)
	) {
		throw new Error("Saved ticket data is incomplete. Clear this site's local storage to restart the demo.");
	}
	return store;
}

function writeStore(store) {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
	} catch (error) {
		throw new Error("Your order could not be saved in this browser. Check available storage and try again.", { cause: error });
	}
}

function findEvent(eventId) {
	const event = EVENTS.find((candidate) => candidate.id === eventId);
	if (!event) throw new Error("This event is no longer available.");
	return event;
}

export function getInventory(eventId) {
	const event = findEvent(eventId);
	const store = readStore();
	return {
		reservedSeats: [...(store.reservations[eventId] ?? [])],
		admitted: Number(store.admissions[eventId] ?? 0)
	};
}

export function getOrder(orderId) {
	const store = readStore();
	return store.orders.find((order) => order.id === orderId) ?? null;
}

function saveOrder({ eventId, seatIds, quantity, customer, paymentMethod }) {
	const event = findEvent(eventId);
	const store = readStore();
	const reservedSeats = new Set(store.reservations[eventId] ?? []);

	if (event.type === "seated") {
		const validSeatIds = new Set(
			event.seatMap.sections.flatMap((section) =>
				Object.entries(section.rows).flatMap(([row, numbers]) =>
					numbers.map((number) => `${section.id}-${row}-${number}`)
				)
			)
		);
		if (
			!seatIds.length ||
			new Set(seatIds).size !== seatIds.length ||
			seatIds.some((seatId) => !validSeatIds.has(seatId) || reservedSeats.has(seatId))
		) {
			throw new Error("One or more seats were just taken. Please choose available seats and try again.");
		}
		seatIds.forEach((seatId) => reservedSeats.add(seatId));
		store.reservations[eventId] = [...reservedSeats];
	} else {
		const admitted = Number(store.admissions[eventId] ?? 0);
		if (
			!Number.isInteger(quantity) ||
			quantity < 1 ||
			(event.ticketCapacity !== null && admitted + quantity > event.ticketCapacity)
		) {
			throw new Error("There are not enough general-admission tickets left for that quantity.");
		}
		store.admissions[eventId] = admitted + quantity;
	}

	const order = {
		id: `PP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
		eventId,
		seatIds: [...seatIds],
		quantity,
		customer: { name: customer.name.trim(), email: customer.email.trim() },
		paymentMethod,
		totalCents: event.priceCents * quantity,
		createdAt: new Date().toISOString()
	};
	store.orders.push(order);
	writeStore(store);
	return order;
}

export async function placeOrder(details) {
	if (navigator.locks?.request) {
		return navigator.locks.request("pitz-pass-demo-inventory", () => saveOrder(details));
	}
	return saveOrder(details);
}
