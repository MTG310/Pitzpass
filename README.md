# Pitz Pass

A responsive event-ticketing prototype for Colegio Maya. Pitz Pass lets families browse school events, choose seats or general-admission tickets, and complete a simulated checkout. The static front end is plain HTML, CSS, and JavaScript; a small Cloudflare Worker API and D1 database provide shared ticket inventory and order storage.

> **Demo only:** Payments are not processed, emails are not sent, and confirmation QR codes are not valid for entry. Never enter real payment information. Orders include attendee name and email and are stored in the connected D1 database.

## Preview

Pitz Pass currently includes the Maya Show 2027 and Family Fest. The interface uses Colegio Maya’s red (`#CB1D3D`), blue (`#1F3C72`), and green (`#4EA635`) palette.

## Features

- Landing page with event information, schedules, and event selection.
- Interactive, zoomable Teatro Presidente seat map for the Primary and Secondary Maya Shows.
- General-admission quantity selection for Family Fest.
- Checkout with simulated Apple Pay, Google Pay, and card options.
- Order confirmation with wallet-style ticket previews, locally generated QR graphics, and an Apple Wallet badge preview.
- Responsive layout for desktop and mobile.
- Shared inventory and order persistence using Cloudflare D1.
- Database-enforced seat uniqueness to reject simultaneous attempts to book the same seat.
- Availability refresh on the event screen while open and when returning to the browser tab.
- Organizer-only event editor for updating public titles, show labels, dates, times, venue, prices, and descriptions.
- HttpOnly, signed organizer sessions and login-attempt throttling.

## Run locally

The front end calls the `/api` routes served by the Worker, so a plain static server is not enough to test ticket selection or checkout. To run the complete app locally, install Node.js, then run:

```sh
npx wrangler d1 migrations apply pitz-pass-tickets --local
npx wrangler dev
```

Wrangler serves the site and API locally. To connect local development to the deployed database, use the appropriate `--remote` D1 option and follow Cloudflare’s [Wrangler development documentation](https://developers.cloudflare.com/workers/wrangler/commands/#dev).

For organizer access locally, configure `ADMIN_PASSWORD` and `SESSION_SECRET` using Wrangler secrets or a local-only `.dev.vars` file. Do not commit credentials or `.dev.vars`. No application framework or build step is used. Wrangler is required to run the Worker API.

## Deploy to Cloudflare Workers

The current Cloudflare deployment serves static files from a Worker (`*.workers.dev`). The Worker API and database binding are required for cross-device ticket availability. The repository includes a Wrangler configuration for that deployment:

1. In Cloudflare, open **Storage & databases → D1 SQL Database** and create a database named `pitz-pass-tickets`.
2. Copy its database ID from the dashboard and confirm that it matches `database_id` in `wrangler.jsonc`. Keep the database binding name as `DB`.
3. Install [Node.js](https://nodejs.org/) if it is not installed, then from the project root run:

   ```sh
   npx wrangler login
   ```

4. Set a private organizer password and a strong signing secret. Add these through Wrangler’s secret prompts (do not put them in source files):

   ```sh
   npx wrangler secret put ADMIN_PASSWORD
   npx wrangler secret put SESSION_SECRET
   ```

   When prompted for `SESSION_SECRET`, paste a newly generated secret with at least 32 characters (for example, generate one locally with `openssl rand -base64 32`). The organizer username is `admin`. Use a new, unique password for the live site; do not reuse a password shared in chat or used on another account.

5. Apply any pending D1 migrations, then deploy:

   ```sh
   npx wrangler d1 migrations apply pitz-pass-tickets --remote
   npx wrangler deploy
   ```

6. Visit the Worker URL and use the **Organizer** tab to sign in. The event editor saves changes in D1, so updated event details appear to every visitor.

The first migration creates the order and ticket tables. The second creates event settings and login-throttling tables. Existing orders saved in individual browsers are not imported; the shared database starts with its own inventory. Deploying again after future changes uses `npx wrangler deploy`; apply any new database migrations before relying on code that requires them. See Cloudflare’s [Workers static assets](https://developers.cloudflare.com/workers/static-assets/) and [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/) documentation.

## Project layout

```text
.
├── index.html                    HTML shell and application mount point
├── styles.css                    Responsive styles, including the pp- component namespace
├── worker.js                     Worker entry point and API routing
├── wrangler.jsonc                Worker static assets and D1 configuration
├── .assetsignore                 Keeps backend/config files out of public assets
├── migrations/
│   ├── 0001_initial.sql          D1 order and ticket schema
│   └── 0002_event_settings_and_admin_login.sql
├── functions/api/
│   ├── _shared.js                Shared API validation/helpers
│   ├── events.js                 Public configured event details
│   ├── inventory.js              Shared availability endpoint
│   ├── orders.js                 Atomic demo order creation
│   ├── orders/[id].js            Order lookup for ticket confirmation
│   └── admin/
│       ├── session.js            Organizer login, signed session, and logout
│       └── events.js             Authenticated event settings editor
├── src/
│   ├── app.js                    Hash-based routes, screens, and interactions
│   ├── events.js                 Event details, pricing, schedules, and seat-map data
│   └── inventory.js              Client for the Worker ticket API
└── assets/
    ├── colegio-maya-logo-white.webp
    ├── apple-wallet-badge.png
    ├── maya-show-costumes.webp
    ├── maya-show-dance.webp
    └── maya-show-stage.webp
```

The application mounts inside `#pitz-pass`. Its hash routes include:

- `#/` — event landing page
- `#/maya-show-info` — Maya Show schedule and entry information
- `#/organizer` — organizer login and event editor
- `#/event/<event-id>` — event ticket selection
- `#/checkout` — simulated checkout
- `#/confirmation/<order-id>` — demo ticket confirmation

Event details and prices are configured in `src/events.js`. The app uses hash-based navigation and prefixes its CSS classes with `pp-` to help keep it self-contained. This structure supports future integration as a linked ticketing site, an iframe, or a school-site component backed by an API.

## Current demo events

| Event | Date | Venue | Ticket type | Demo price |
| --- | --- | --- | --- | --- |
| Maya Show — Primary | May 27, 2027, 5:00 PM | Teatro Presidente | Assigned seating | $12 |
| Maya Show — Secondary | May 27, 2027, 7:30 PM | Teatro Presidente | Assigned seating | $14 |
| Family Fest | February 6, 2027 | Colegio Maya campus | General admission | $1 |

For the Maya Show, students arrive 30 minutes before their showtime. Attendees are asked to have their ticket ready for entry. Family Fest has no time listed because no event time has been configured.

The supplied Teatro Presidente chart provides 1,410 numbered seats. Its printed capacity is 1,411; the extra unnumbered seat is not offered in the demo. Primary and Secondary have separate demo inventory.

## Demo data and privacy

Orders, attendee names and email addresses, and ticket assignments are stored in the shared Cloudflare D1 database. Anyone with a valid order-confirmation URL can view that order, so share confirmation links only with the ticket holder. Ticket availability is public. This demo does not include an organizer dashboard or tools to delete/cancel orders.

The card form accepts only the test values displayed in checkout. Card and billing fields are not sent to the Worker or saved, but **do not enter real payment details**. No charge is made, no confirmation email is sent, and QR codes and wallet-style tickets are visual previews only.

The shared D1 database persists across visitors, browsers, and devices. Do not clear the database to reset a demo while it is in use: this permanently removes shared orders and ticket reservations.

Organizer event changes are also shared through D1. The username is fixed as `admin`; the password and signing key are Cloudflare Worker secrets (`ADMIN_PASSWORD` and `SESSION_SECRET`), not values in the public website code. Sessions expire after eight hours, use Secure/HttpOnly/SameSite cookies, and failed logins are throttled after five attempts in a 15-minute window. Anyone who can access the Organizer tab can attempt to log in, so use a unique, strong password and keep it private. This simple organizer login is intended for a demo, not as a replacement for school identity management.

## Production considerations

This prototype is not a production ticketing system. Before selling or issuing real tickets:

- Add temporary seat holds with expiration if needed; current seats are committed when the demo order is submitted.
- Add server-side capacity enforcement if general-admission limits are introduced.
- Validate ticket availability, quantity, and pricing on the server; never trust totals supplied by the browser.
- Use an established payment provider’s hosted checkout if payments are introduced. Do not collect or store card details in this app.
- Issue unique server-verified ticket identifiers and add a secure check-in process.
- Add appropriate organizer access controls, order management, cancellation/refund handling, and confirmation delivery.
- Confirm event details, seating/accessibility requirements, privacy practices, and school approval before launch.

## License

No license has been specified for this project. Ask the project owner before reusing or redistributing it.
