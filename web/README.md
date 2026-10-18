# Avocado website and API

The website is a React/TypeScript client built with Vite. It calls the Flask JSON API under `/api`; Gunicorn serves the production application, including the built website. PostgreSQL stores diary entries, account identities, and sessions. The Expo phone app calls the same API, so signing into the same registered account on both clients opens the same diary.

Follow the [root setup guide](../README.md) for Python/Node prerequisites, dependency installation, PostgreSQL, environment variables, migrations, phone networking, and deployment. From this directory, the normal commands are:

```sh
npm ci
npm run db:migrate
npm run dev
```

Install the Python requirements and configure `.env` as described in that guide before running the API or migration. Vite serves the development website and proxies `/api` to port 3001 with `changeOrigin: false`; preserving the browser-facing Host lets the API validate browser Origin correctly. `npm run build` creates `dist`; `npm start` runs the production Gunicorn entrypoint. Keep database credentials and the USDA key in the server environment, never in client code or an `EXPO_PUBLIC_` variable.

## Client architecture

| File | Responsibility |
| --- | --- |
| `client/src/main.tsx` | Application shell, Food/Lifts/Profile navigation, selected day (with previous/next day), food state, and visible-screen refresh. |
| `client/src/Extras.tsx` | Ingredient search and portion-based food logging. |
| `client/src/Lifts.tsx` | Workouts on `/api/workouts`, as on mobile: start/end named workouts, choose catalog exercises, log sets one at a time, supersets, and read-only summaries of ended workouts. |
| `client/src/ExerciseProgress.tsx` | One exercise's last session, next-set targets, and max-weight chart; shared by Lifts and Progress. |
| `client/src/Progress.tsx` | Profile → Progress: every logged exercise, then its chart and workout list. |
| `client/src/workoutLogic.ts` | Copy of `mobile/workoutLogic.ts`; a mobile test fails if the two differ. |
| `client/src/Account.tsx` | Session restoration, automatic guest access, sign-in/registration, profile operations, and sign-out. |
| `client/src/Settings.tsx` | Profile: Progress, weight, account/password forms, and appearance, with section-specific feedback. |
| `client/src/WeightTracker.tsx` and `WeightTracker.css` | Registered users’ daily weight form and accessible line graph with consistent units/calendar gaps. |
| `client/src/CustomFoods.tsx` | Private reusable foods per serving, copied into diary snapshots when logged. |
| `client/src/MacroInputs.tsx` | Shared optional macro fields, preserving the difference between unknown and zero. |
| `client/src/api.ts` | JSON transport, same-origin cookies, cancellation, timeout, API errors, and session-expiry events. |
| `client/src/styles.css` | Shared semantic colors, system/light/dark appearances, layout, and focus/disabled states. |
| `client/src/Icon.tsx` | Small vector icons used by navigation and controls. |

Each diary screen owns its form and displayed rows. Account identity is shared through `AccountProvider`; appearance is a device preference. Inputs remain controlled by React, and mutation guards prevent a repeated tap from submitting the same action twice. Day/account/session-revision changes invalidate old loads and mutation results so a response for a previous identity cannot populate the current diary.

### Session and guest flow

1. `AccountProvider` calls `GET /api/account` before enabling the diary.
2. An existing registered or guest session restores its identity. A 401 on initial load calls `POST /api/auth/guest`, opening an isolated diary without requiring registration. Connection/server errors show retry feedback instead of silently creating another guest.
3. Guests see Log in/Sign up in the header and can keep using Food/Lifts without opening Profile. Registered users get Profile, with Progress, weight logging, and account controls. Registration upgrades the guest identity and preserves its records. Sign-in transfers guest food, custom foods, weights, and workouts/exercises into the existing account. Existing account records win overlaps; see architecture decision 29 for the matching keys.
4. The browser persists credentials through server-issued HttpOnly cookies. Authentication JSON also includes a token for the native client; browser code deliberately ignores that field and never saves a bearer token in localStorage.
5. Sign-in revokes all consumed guest sessions and clears the guest cookie. Sign-out revokes the active account session and opens a fresh guest diary. A protected-request 401 dispatches `avocado:unauthorized`; the provider clears the active identity and offers sign-in or guest continuation.

Login failures and incorrect-current-password responses also use 401, but they remain form errors rather than expiring an otherwise valid session. Account session cookies last 30 days unless expired or revoked sooner. Clearing cookies can lose access to a guest diary; create an account to open that diary on another device.

Cookies are shared across browser tabs; React identity state is not. The provider sends non-secret `{sender,operation,phase}` notices through the `avocado-session` BroadcastChannel and the `avocado.session-event` localStorage fallback. A changing notice gates peer tabs before a session switch; completion rechecks `/account`, and a 20-second timeout recovers if the initiating tab disappears. Focus/15-second identity checks also reconcile changes. `sessionRevision` invalidates old diary work at identity boundaries while unchanged checks preserve drafts. No credential is placed in these messages or localStorage.

### Account/API contract

| Endpoint | Request and result |
| --- | --- |
| `GET /api/account` | Registered `{user:{id,name,email}}` or guest `{user:null,guest:true}`. |
| `POST /api/auth/guest` | Creates/restores a persistent isolated guest and sets its cookie. |
| `POST /api/auth/register` | `{name,email,password}`; upgrades an active guest or creates an account. |
| `POST /api/auth/login` | `{email,password}`; opens the registered account. |
| `PATCH /api/account` | `{name}`; returns the updated user. Email is read-only in Profile. |
| `POST /api/account/password` | `{currentPassword,newPassword}`; revokes other sessions, retains the current session, returns 204. |
| `POST /api/auth/logout` | Revokes the active session and clears its cookie, returns 204. |

Food uses `/api/entries` (list by `?date=YYYY-MM-DD`, add by POST, remove by DELETE with the row ID). Both clients' Lifts use `/api/workouts` and its exercise/set routes; `/api/lifts` remains only for older clients and is no longer called by the web app. Ownership comes from the validated server session, never a client-supplied account ID. Ingredient search uses `/api/foods/search?q=...` and reports USDA values per 100 g.

Custom foods use `/api/custom-foods`: GET returns `{foods}`, POST saves a one-serving nutrient definition, and DELETE removes the catalog item by ID. A logged food copies its nutrients into a diary snapshot, so later catalog removal does not change past totals. Both Quick add and custom foods accept optional macros; empty means unknown and `0` means measured zero.

Weight uses authenticated-only `/api/weights`: GET returns `{entries}` for the latest 30 logged dates, POST `{date,weight,unit}` upserts one record per account/day, and DELETE `/api/weights/YYYY-MM-DD` removes that date. The API returns canonical `weightKg` for consistent display. The line graph filters the response to the last 30 calendar days, preserves missing days as gaps, converts all points to one lb/kg unit, and starts its vertical scale at zero. Textual labels expose every date/value to assistive technology. The form permits today/past dates and positive values; the server validates any calendar date and caps weight at 1,500 kg or 3,307 lb.

### Appearance and synchronization

`System` is the default. CSS follows `prefers-color-scheme`; selecting Light or Dark sets the root `data-theme` override. Only `{appearance}` is stored in localStorage under `avocado.preferences`. Invalid or unavailable storage falls back to System, and a blocked save still updates the current browser session. Appearance is intentionally device-local; profile name and diary data live on the server.

Food, Lifts, custom foods, and weight history refresh on foreground/focus and periodically while visible, with a 15-second polling interval. Refreshes retain form drafts and defer while a mutation is pending; completed writes update or reload the list. These reads let a change from another signed-in device appear without restarting the client. Login merges the current guest diary on the server. Normal synchronization uses eventual refresh; offline writes, WebSockets, and general concurrent-edit resolution are not implemented.

`request` applies both caller cancellation and a 15-second timeout. It never automatically retries a mutation: a lost response may follow a committed write, and repeating an add could duplicate it. Screens show useful error/retry states and request fresh data after a successful action. Macro totals distinguish missing data from zero and remain marked partial when needed.

## Server architecture

`server/app.py` owns routing, validation boundaries, cookie/session handling, and HTTP error responses. `server/auth.py` implements the requested salted SHA-512 hex construction and opaque session tokens. `server/db.py` owns parameterized PostgreSQL queries and ownership checks. `server/nutrition.py` preserves USDA lookup/normalization; `server/validation.py` validates dates and bounds. `server/schema.sql` adds constraints and indexes, preserving old unowned rows without exposing them to new accounts. `server/wsgi.py` is the Gunicorn entrypoint; `server/migrate.py` applies the schema.

Password storage is intentionally the requested `sha512$salt$hex_digest` format, with `salt = uuid.uuid4().hex` and SHA-512 of UTF-8 `salt + password`. It is a fast general-purpose hash, not a modern password KDF. The [architecture review](../docs/architecture-decisions.md) explains that limitation and compares Argon2id, scrypt, PBKDF2, and managed authentication. Sessions are random bearer tokens; PostgreSQL stores only their SHA-256 digests and expiry. The rate-limit table shares credential-attempt counters across Gunicorn workers.

## Verification and maintenance

```sh
npm run build
npm test
TEST_DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/DATABASE npm run test:integration
```

Use a test-capable database account and the root guide’s instructions. Integration tests isolate their work in a temporary schema. See [verification notes](../docs/verification.md) for checks that actually ran and their limits; a compiled client or exported mobile bundle does not prove a physical-device flow or a deployed production environment.

Comments explain state, identity, cancellation, and storage decisions where a future edit could break them. Keep security and data-ownership behavior in the server even when a client performs matching validation. When changing identity transitions, test guest creation, upgrade, sign-in, sign-out restoration, cross-account isolation, and password/session revocation together. When adding an endpoint, preserve server ownership scoping and update the contract and architecture notes.

Food and lift responses expose existing creation timestamps as UTC ISO-8601 `createdAt`. Both clients show device-local `HH:mm` in chronological timelines. This is the time logged, including for backdated diary entries; the selected calendar date and stored timestamp precision remain unchanged.
