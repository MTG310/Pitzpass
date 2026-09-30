# Pitz Pass

A standalone, responsive school-event ticketing prototype for Colegio Maya. Its white layout and blue navigation use the school's red (`#CB1D3D`), blue (`#1F3C72`), and green (`#4EA635`) palette. It uses plain HTML, CSS, and browser-native JavaScript modules, so it can be hosted independently today and embedded in the school website later without adopting a framework.

## Project structure

```text
index.html          Small standalone shell and mount point
styles.css          Responsive, namespaced Pitz Pass styles
src/
  app.js            Hash routes, screens, and user interactions
  events.js         Data-driven sample events and display formatting
  inventory.js      Demo inventory, order persistence, and conflict checks
assets/
  colegio-maya-logo-white.webp   Supplied Colegio Maya logo
  apple-wallet-badge.png         Supplied Apple Wallet badge for the demo confirmation
  maya-show-costumes.webp        Supplied student show photo
  maya-show-dance.webp           Supplied student dance photo
  maya-show-stage.webp           Supplied student stage photo
```

The application is mounted inside `#pitz-pass`, uses hash-based routes (`#/event/...`, `#/checkout`, and `#/confirmation/...`), and keeps its styles under the `.pp-` prefix. These choices keep it self-contained and make a later iframe embed or API-backed integration straightforward.

## Run locally

Serve this directory over HTTP so the browser can load JavaScript modules:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Included prototype flow

1. Read the Maya Show 2027 schedule and entry information from the landing page, then browse the Primary and Secondary shows or Family Fest.
2. Select seats in the full-screen Teatro Presidente map. Each column's upper and lower areas are independent sections; the map opens at a screen-filling overview and zooming in reveals individual available, unavailable, and selected seats. Use the mouse wheel or map controls to zoom, drag to pan, and review or remove tickets with their column, row, and seat details in the sidebar.
3. Enter a name and email, choose the simulated Apple Pay, Google Pay, or card option, and place a demo order. The card form accepts only the displayed test card; card and billing fields are never saved or sent, and no payment is processed.
4. View an Apple Wallet-style visual pass for each ticket, with event and seat details and a locally generated QR code, plus an Apple Wallet badge preview. Passes and the badge are demos: tickets cannot be added to Apple Wallet and are not valid for entry.

Family Fest is general admission at Colegio Maya on February 6, 2027. Demo tickets cost $1 each and use uncapped local demo inventory.

The Maya shows use the supplied Teatro Presidente seat map. The chart's numbered rows provide 1,410 unique seats, while its printed auditorium total is 1,411; the extra seat is not mapped or sold pending a corrected seat label. Each show has its own inventory. Family Fest uses uncapped general admission in this demo. Demo orders and reservations persist in this browser's local storage. This map update starts with fresh demo availability, including the C3 upper section; demo reservations persist from then on. A browser lock and a final inventory check reduce same-browser tab conflicts, but this prototype cannot guarantee inventory across devices, browsers, or users.

## Implementation plan

### Prototype (implemented)

- Build a mobile-friendly event-selection landing page in Colegio Maya's red, blue, and green visual direction.
- Support assigned seats grouped into venue sections and row/seat labels through event data rather than event-specific UI.
- Keep selection, checkout, simulated wallet options, and confirmation in a simple browser-native flow.
- Persist demo inventory locally and reject stale seat or capacity selections at order submission.

### Before production

- Replace the local inventory adapter with a server API that atomically holds seats with an expiry and commits each order in a database transaction. The server must be the source of truth for seat availability and capacity.
- Add real authentication or abuse controls as needed, server-side validation, order email delivery, refunds/cancellations, and accessible venue-approved seating data.
- Integrate a payment provider only after the school chooses one; never collect or store payment credentials in this prototype.
- Confirm event details, policies, accessibility requirements, and branding. Then choose an iframe or a school-site component/API integration and test its responsive layout and navigation.

The Apple Pay / Google Pay / card choices here are visual simulations only. No payment is authorized, no email is sent, and the wallet-style QR passes are not valid for entry. The Apple Wallet badge is decorative and does not add tickets to Wallet. Production payments require a PCI-compliant payment provider; do not collect card details in this prototype.
