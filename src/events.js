const TEATRO_PRESIDENTE = {
	name: "Teatro Presidente",
	capacity: 1411
};

const seatRows = (ranges) => Object.fromEntries(
	Object.entries(ranges).map(([row, range]) => {
		const [first, last] = range.split("-").map(Number);
		const step = first <= last ? 1 : -1;
		return [row, Array.from({ length: Math.abs(last - first) + 1 }, (_, index) => first + index * step)];
	})
);

const TEATRO_PRESIDENTE_SEAT_MAP = {
	status: "numbered",
	rows: ["W", "V", "U", "T", "S", "R", "Q", "P", "O", "N", "M", "L", "K", "J", "I", "H", "G", "F", "E", "D", "C", "B", "A"],
	sections: [
		{
			id: "C1",
			label: "Left lateral",
			rows: seatRows({
				W: "71-62", V: "73-64", U: "73-65", T: "70-62", S: "71-63", R: "68-60",
				Q: "67-59", P: "68-60", O: "65-58", N: "65-58", M: "61-55", L: "61-55",
				K: "59-54", J: "58-53", I: "58-53", H: "58-53", G: "55-50", F: "54-50",
				E: "54-50", D: "53-49", C: "49-46", B: "51-48", A: "48-45"
			})
		},
		{
			id: "C2",
			label: "Left",
			rows: seatRows({
				W: "61-45", V: "63-46", U: "64-47", T: "61-45", S: "62-46", R: "59-44",
				Q: "58-43", P: "59-44", O: "57-42", N: "57-42", M: "54-40", L: "54-40",
				K: "53-39", J: "52-38", I: "52-38", H: "52-38", G: "49-36", F: "49-36",
				E: "49-36", D: "48-35", C: "45-33", B: "47-34", A: "44-32"
			})
		},
		{
			id: "C3",
			label: "Center",
			rows: seatRows({
				W: "44-28", V: "45-28", U: "46-28", T: "44-27", S: "45-27", R: "43-26",
				Q: "42-26", P: "43-26", O: "41-25", N: "41-24", M: "39-23", L: "39-23",
				K: "38-22", J: "37-22", I: "37-22", H: "37-22", G: "35-21", F: "35-20",
				E: "35-20", D: "34-20", C: "32-19", B: "33-19", A: "31-18"
			})
		},
		{
			id: "C4",
			label: "Right",
			rows: seatRows({
				W: "27-11", V: "27-10", U: "27-10", T: "26-10", S: "26-10", R: "25-10",
				Q: "25-10", P: "25-10", O: "24-9", N: "23-9", M: "22-8", L: "22-8",
				K: "21-7", J: "21-7", I: "21-7", H: "21-7", G: "20-7", F: "19-6",
				E: "19-6", D: "19-6", C: "18-6", B: "18-5", A: "17-5"
			})
		},
		{
			id: "C5",
			label: "Right lateral",
			rows: seatRows({
				W: "10-1", V: "9-1", U: "9-1", T: "9-1", S: "9-1", R: "9-1",
				Q: "9-1", P: "9-1", O: "8-1", N: "8-1", M: "7-1", L: "7-1",
				K: "6-1", J: "6-1", I: "6-1", H: "6-1", G: "6-1", F: "5-1",
				E: "5-1", D: "5-1", C: "5-1", B: "4-1", A: "4-1"
			})
		}
	]
};

export const EVENTS = [
	{
		id: "maya-primary",
		title: "Maya Show 2027",
		session: "Primary Show",
		date: "2027-05-27",
		time: "17:00",
		studentArrivalTime: "4:30 PM",
		venue: TEATRO_PRESIDENTE,
		type: "seated",
		priceCents: 1200,
		ticketCapacity: 1410,
		seatMap: TEATRO_PRESIDENTE_SEAT_MAP,
		initiallyUnavailable: [],
		accent: "lime",
		description: "An evening celebrating student creativity, culture, and the Colegio Maya community."
	},
	{
		id: "maya-secondary",
		title: "Maya Show 2027",
		session: "Secondary Show",
		date: "2027-05-27",
		time: "19:30",
		studentArrivalTime: "7:00 PM",
		venue: TEATRO_PRESIDENTE,
		type: "seated",
		priceCents: 1400,
		ticketCapacity: 1410,
		seatMap: TEATRO_PRESIDENTE_SEAT_MAP,
		initiallyUnavailable: [],
		accent: "blue",
		description: "Join us for an evening showcase of music and dance by our secondary students."
	},
	{
		id: "family-fest",
		title: "Family Fest",
		session: "General admission",
		date: "2027-02-06",
		time: null,
		venue: { name: "Colegio Maya campus" },
		type: "general",
		priceCents: 100,
		ticketCapacity: null,
		initiallyUnavailable: [],
		accent: "red",
		description: "Bring the family for a fun day together at Colegio Maya. General-admission tickets are $1 each."
	}
];

export function formatPrice(cents) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2
	}).format(cents / 100);
}

export function formatEventDate(event, locale = "en-US") {
	const date = new Date(`${event.date}T${event.time ?? "12:00"}:00`);
	return new Intl.DateTimeFormat(locale, {
		weekday: "long",
		month: "long",
		day: "numeric",
		year: "numeric"
	}).format(date);
}

export function formatEventTime(event, locale = "en-US") {
	if (!event.time) return "";
	const date = new Date(`${event.date}T${event.time}:00`);
	return new Intl.DateTimeFormat(locale, {
		hour: "numeric",
		minute: "2-digit"
	}).format(date);
}
