# Pitz Pass

**Pitz Pass** is a responsive school-event ticketing website for Colegio Maya. Families can browse school events, check event schedules, select auditorium seats or general-admission tickets, and complete a simulated checkout. Organizers can sign in to update event information.

The site is built with browser-native HTML, CSS, and JavaScript and runs as a Cloudflare Worker with a D1 database. The shared database keeps ticket availability and event settings in sync across visitors and devices.

> [!IMPORTANT]
> This is a **demo ticketing system**, not a production payment or venue-entry system. No money is charged, no emails are sent, and the QR codes and wallet-style passes are previews only—not valid tickets. Never enter real payment-card details.

## Contents

- [Features](#features)
- [Demo events](#demo-events)
- [Try the live site](#try-the-live-site)
- [Run locally](#run-locally)
- [Deploy to Cloudflare](#deploy-to-cloudflare)
- [Organizer access](#organizer-access)
- [How ticket availability works](#how-ticket-availability-works)
- [Project structure](#project-structure)
- [Data and privacy](#data-and-privacy)
- [Production readiness](#production-readiness)
- [License](#license)

## Features

### For attendees

- Responsive landing page with event cards, dates, venue, ticket type, and prices.
- Maya Show information page with showtimes, student arrival times, venue, and entry reminders.
- Assigned seating for the Primary and Secondary Maya Shows:
  - Interactive Teatro Presidente seating map with section and row labels.
  - Zoom, pan, overview, keyboard-accessible seat selection, and selected-seat summaries.
  - Available and taken seat states.
- General-admission quantity selection for Family Fest.
- Checkout with simulated Apple Pay, Google Pay, or a demo-only card form.
- Order confirmation with a separate wallet-style pass and QR preview for each ticket.
- Apple Wallet badge preview; tickets are not added to Apple Wallet.

### Shared ticketing and organizer tools

- Cloudflare D1 stores orders, ticket assignments, event settings, and login rate limits.
- Database uniqueness constraints prevent the same assigned seat from being ordered twice.
- The server validates selected seats, quantity, event, and price before creating an order.
- Availability refreshes while an event page is open and when a visitor returns to the tab.
- Organizer tab with password-protected sign-in and an event editor for titles, show labels, dates, times, student arrival times, venues, prices, and descriptions.
- Staff-only sales dashboard with ticket counts, order counts, demo order totals, and remaining seat counts for each event.
- Per-show assigned-seat availability and uncapped general-admission summaries, with a manual refresh control.
- Sales figures represent simulated order totals, not revenue from processed payments.
- Organizer settings are saved centrally and shown on public event and schedule pages.
- Signed, eight-hour `HttpOnly`, `Secure`, `SameSite=Strict` organizer sessions, with failed-login throttling.

## Demo events

| Event | Date and time | Venue | Admission | Demo price |
| --- | --- | --- | --- | --- |
| Maya Show — Primary | May 27, 2027 at 5:00 PM | Teatro Presidente | Assigned seating | $12 |
| Maya Show — Secondary | May 27, 2027 at 7:30 PM | Teatro Presidente | Assigned seating | $14 |
| Family Fest | February 6, 2027; time not set | Colegio Maya campus | General admission | $1 |

Maya Show students arrive 30 minutes before their showtime. Attendees are asked to have their ticket ready when they arrive. Primary and Secondary have separate seat inventories. The supplied theater chart includes 1,410 numbered seats; its printed capacity of 1,411 includes one unnumbered seat that is not offered.

Event details can be changed in the Organizer tab. Family Fest has uncapped general-admission inventory in this demo.

## Try the live site

Open [Pitz Pass](https://pp-website.kh6hb9smyy.workers.dev/). Use the **Information** tab for the Maya Show schedule and the **Organizer** tab for event management.

The organizer username is `admin`. The live password is configured privately in Cloudflare and is not included in this repository. Ask the site owner for access; do not put credentials in an issue, commit, or public message.

## Run locally

The complete app needs the Worker API and D1 binding; serving `index.html` with a basic static server is not sufficient. Install [Node.js](https://nodejs.org/), then, from the project root:

```sh
npx wrangler d1 migrations apply pitz-pass-tickets --local
npx wrangler dev
```

Wrangler serves the site locally (usually at <http://localhost:8787>) with a local D1 database. Local database state persists under `.wrangler/` and is excluded from Git.

To test organizer sign-in locally, create a `.dev.vars` file in the project root:

```dotenv
ADMIN_PASSWORD=choose-a-local-demo-password
SESSION_SECRET=paste-a-new-random-secret-of-at-least-32-characters
```

Generate a signing secret locally with `openssl rand -base64 32`. Keep `.dev.vars` private; it is ignored by Git and excluded from deployed assets. Never use the production password or signing secret for local testing.

## Deploy to Cloudflare

This repository is configured as a **Cloudflare Worker with static assets and a D1 database binding**, not as a Pages-only static site. The configured Worker name is `pp-website`.

### First-time setup

1. Install Node.js and authenticate Wrangler:

   ```sh
   npx wrangler login
   ```

2. Confirm `wrangler.jsonc` contains the D1 database ID for the Cloudflare database named `pitz-pass-tickets`.
3. Set production secrets in the terminal. Wrangler prompts for each value; secret values are not stored in source files:

   ```sh
   npx wrangler secret put ADMIN_PASSWORD
   npx wrangler secret put SESSION_SECRET
   ```

   The username is fixed as `admin`. Use a unique, strong password. Generate a new signing secret with `openssl rand -base64 32`; paste its output only into Wrangler's `SESSION_SECRET` prompt.

4. Apply pending database migrations and deploy the current saved project:

   ```sh
   npx wrangler d1 migrations apply pitz-pass-tickets --remote
   npx wrangler deploy
   ```

### Updating the site

Save local file changes, then run:

```sh
npx wrangler d1 migrations apply pitz-pass-tickets --remote
npx wrangler deploy
```

The migration command safely applies pending migration files; it does not deploy the website. `wrangler deploy` publishes the local project in the current directory. It does not automatically pull changes from GitHub. Apply new migrations before deploying code that depends on them.

Cloudflare references: [Workers static assets](https://developers.cloudflare.com/workers/static-assets/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), and [Wrangler secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

## Organizer access

- Open the site and select **Organizer** in the top navigation.
- Sign in with username `admin` and the password configured using the `ADMIN_PASSWORD` Worker secret.
- Update an event and choose **Save event details**. Saved details are shared through D1 and appear on the public site.
- Select **Sign out** when finished.

Organizer sessions expire after eight hours. Five failed login attempts in a 15-minute window trigger a temporary rate limit. The organizer password and session-signing secret are server-side Worker secrets; never add them to JavaScript, HTML, Git, or `.dev.vars` committed to the repository.

The dashboard currently edits existing events; it does not create or delete events, manage orders, refund purchases, or issue real tickets.

## How ticket availability works

The browser requests shared inventory from the Worker API. When checkout submits an order, the Worker validates the event and selection, calculates the total from server-side event data, and writes the order and its tickets to D1. A database uniqueness constraint on `(event_id, seat_id)` rejects duplicate seat orders, including concurrent attempts from different devices.

General-admission tickets are stored as individual ticket rows. Family Fest is uncapped in the current demo; add a server-side capacity rule before configuring a capped general-admission event.

## Project structure

```text
.
├── index.html
├── styles.css
├── worker.js                         Worker entry point and API routing
├── wrangler.jsonc                    Worker, static assets, and D1 configuration
├── .assetsignore                     Excludes backend and local files from public assets
├── .gitignore                        Excludes local secrets and generated files from Git
├── migrations/
│   ├── 0001_initial.sql              Orders and ticket inventory schema
│   └── 0002_event_settings_and_admin_login.sql
├── functions/api/
│   ├── _shared.js                    Shared validation, session, and response helpers
│   ├── events.js                     Public event configuration endpoint
│   ├── inventory.js                  Shared inventory endpoint
│   ├── orders.js                     Server-validated order creation
│   ├── orders/[id].js                Order lookup for confirmation
│   └── admin/
│       ├── session.js                Organizer login, session, and logout
│       ├── events.js                 Authenticated event management API
│       └── sales.js                  Authenticated sales aggregation endpoint
├── src/
│   ├── app.js                        Pages, navigation, seat map, and interactions
│   ├── events.js                     Default event and seat-map data
│   └── inventory.js                  Browser client for the Worker API
└── assets/
    ├── colegio-maya-logo-white.webp
    ├── apple-wallet-badge.png
    └── maya-show-*.webp               Student show photography
```

The app mounts in `#pitz-pass`, uses hash routes, and prefixes CSS classes with `pp-` to keep its styles distinct. Main routes are:

| Route | Page |
| --- | --- |
| `#/` | Event landing page |
| `#/maya-show-info` | Maya Show schedule and entry details |
| `#/event/<event-id>` | Seat selection or admission quantity |
| `#/checkout` | Simulated checkout |
| `#/confirmation/<order-id>` | Demo ticket confirmation |
| `#/organizer` | Organizer login and event editor |

## Data and privacy

- D1 stores attendee names and email addresses, event/order information, ticket assignments, and organizer event settings.
- Anyone with a valid order-confirmation URL can view that order. Share confirmation links only with the ticket holder.
- The card form accepts only the displayed test card. Card and billing fields are not sent to the Worker or stored. **Do not enter real payment details.**
- Payments are not processed, confirmation emails are not sent, and demo QR codes cannot be checked in.
- Do not clear or recreate the shared D1 database to reset a demo unless you intend to permanently delete all orders and reservations.

## Production readiness

This application is a functional demo, not a production-ready ticketing service. Before using it for real sales or venue entry, the school should arrange:

- A review of privacy requirements and handling of attendee information.
- A production identity/access system for staff and a protected organizer dashboard.
- Hosted checkout from an established payment provider; never handle card credentials directly.
- Seat holds with expiry, cancellation/refund processes, and order-management tools.
- Server-verified ticket credentials and a secure check-in flow to prevent reuse.
- Capacity limits for general admission where required.
- Verified event details, seating/accessibility requirements, operational support, and database backup/recovery procedures.

## License

No license has been specified for this project. Contact the project owner before reusing or redistributing it.
