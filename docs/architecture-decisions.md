# Avocado — Architecture decisions for review

Review draft · October 18, 2026

This document explains the decisions behind Avocado’s simpler interface, account settings, optional authentication, Python backend, and shared web/mobile diary. It separates implemented behavior from retained choices and work still needed for deployment. The code in this checkout is the implementation record; the external references explain the technical tradeoffs rather than certify the application.

The intended experience is straightforward: open a diary immediately, optionally create an account, and use that same account on the website and phone to see the same food and lift entries. Quick add accepts optional macros, a private custom-food library saves repeated servings, and registered users can log daily bodyweight in Settings. Appearance follows each device by default. The website and phone are separate clients of one API and one PostgreSQL database.

## Interface and client architecture

### 1. A quieter interface with familiar Apple-style conventions

Implemented: neutral grouped surfaces, system typography, restrained green accents, subtle separators, and concise Food/Lifts navigation replace the previous dark-green promotional presentation. Registered users also get Settings; guests see Log in and Sign up actions in the header instead of Settings. Taglines, decorative emoji, repeated explanations, and the large introductory section were removed. Labels, units, error messages, nutrition attribution, and notices about incomplete macro data remain because they affect how someone uses or interprets the diary.

Why: the daily task is entering and reviewing food or lifts. Familiar controls and fewer competing messages make that task easier to locate without introducing a new navigation model.

Tradeoffs and alternatives: a more expressive brand could make Avocado easier to recognize, but would add visual weight to a small utility. A component library could provide more prebuilt patterns and reduce some accessibility work, but would add dependencies and require adapting its visual conventions. The current web interface uses HTML/CSS and small vector icons; the mobile interface uses React Native controls. This is an Apple-influenced design, not a claim that the website is a native Apple application.

### 2. System appearance by default, with explicit Light and Dark overrides

Implemented: System, Light, and Dark are available in registered users’ Settings. Guests follow the system; a saved authenticated override returns after the next login. The website uses CSS color variables and the system color-scheme media query when no explicit theme is selected. Mobile observes the device scheme and applies the chosen override through its theme provider and platform appearance APIs.

Why: System respects a choice the user has already made; overrides accommodate someone who wants Avocado to differ from the rest of the device. Semantic color values keep text, fields, surfaces, errors, and focus indicators consistent across both appearances.

Tradeoffs and alternatives: a fixed light theme would be simpler to maintain but ignore dark-mode preferences. A schedule based on time of day would introduce a second source of truth and could disagree with the device. Appearance remains local to the device: the website stores `avocado.preferences` in localStorage, and mobile stores `avocado.preferences.v1` in AsyncStorage. Syncing appearance through the account would make devices agree, but could override a useful phone-versus-desktop preference and add an account dependency to a harmless local setting.

### 3. Retain React on the web and React Native/Expo on mobile

Retained: the web client is a React/TypeScript application built with Vite; the phone client uses React Native, Expo, and Expo Router. Both speak the same JSON API. Their screen and theme implementations remain platform-specific rather than forcing identical components into the browser and phone.

Why: this keeps the existing clients and allows forms, date controls, navigation, keyboard behavior, and secure credential storage to fit each platform. Changes to account and diary behavior are shared through the API contract.

Tradeoffs and alternatives: one responsive website would reduce the number of clients to maintain and would be enough for many users, but would provide a different installation and native-integration experience. A shared cross-platform UI package might reduce duplication, but would introduce abstraction work for a small app. Separate Swift and Kotlin clients would provide the deepest native integration, with substantially more platform-specific implementation and release work. The existing Swift/SwiftData project is not a source of automatic data migration into this database.

### 4. Small context providers and a shared request helper

Implemented: account/session state is held in a provider, appearance is a separate preference concern, and food/lift screens keep their own form and diary state. Each client uses one request helper for the API URL, JSON handling, authentication transport, timeouts, and errors.

Why: account changes must invalidate the visible diary, while typing into a food form should remain local to that screen. A shared helper prevents different screens from accidentally sending different credentials or interpreting the same error differently. The browser helper combines caller cancellation with a 15-second timeout and disables response caching.

Tradeoffs and alternatives: a larger state/query library could centralize caching, deduplication, retries, and background synchronization. It would also introduce another dependency and more policy than these screens currently need. Automatic retries of writes were avoided because a response can be lost after the server commits; blindly repeating an add could duplicate an entry. Failed writes are shown to the user for an explicit retry. There is no durable offline-write queue.

## Backend, data, and synchronization

### 5. Flask/Python behind Gunicorn, with the existing API contract

Implemented: the backend now uses Flask/Python in place of Express/Node so it can run under the requested Gunicorn server. The React and Expo clients retain the same `/api` endpoints and JSON shapes. Password hashing uses Python’s `hashlib`, matching the supplied SHA-512/salt/hex example directly. Production defaults to two Gunicorn workers; development uses one reloading worker. Worker count and binding are environment-configurable.

Why: Gunicorn serves Python applications and manages worker processes. Flask supplies the HTTP routing and request handling; Gunicorn supplies the production application-server process model. Keeping the contract stable avoids making the phone and website depend on the server’s implementation language. Gunicorn’s own documentation describes its worker model and configuration tradeoffs. [S1]

Tradeoffs and alternatives: keeping Express would preserve a single JavaScript/TypeScript ecosystem and avoid a backend rewrite, but would require a Node process manager rather than directly serving the app with Gunicorn. Django would provide more built-in account, administration, and migration machinery, with a larger framework and adaptation cost. FastAPI/ASGI would offer useful typing and asynchronous patterns, but those capabilities are not required by this small request/response API. The current sync workers are easy to reason about but each handles one request at a time; a slow database or USDA call occupies that worker. More workers, threads, or asynchronous workers could improve concurrency and need load testing and resource limits. Flask is deliberately modest; validation, authorization, schema maintenance, and account workflows remain application responsibilities.

### 6. PostgreSQL remains the shared source of truth

Retained and extended: food entries, lift entries, accounts, and sessions live in PostgreSQL. The clients never connect to PostgreSQL directly. Server queries use parameters, and the schema enforces types, numeric bounds, normalized email uniqueness, and account relationships.

Why: one database makes a registered account’s diary available to both clients and gives ownership changes and session revocation a consistent place to happen. An entry is considered saved after the API/database write succeeds. Flask opens one psycopg connection per request as needed and closes it at teardown, avoiding a connection inherited across worker processes.

Tradeoffs and alternatives: browser or phone storage alone would support offline use and remove server operations, but would not by itself give the website and phone a common diary. SQLite would simplify a single-server installation, but require a different operational approach as concurrency and hosting grow. A managed backend could reduce infrastructure work but would add a provider dependency and its own authorization model. Direct parameterized SQL keeps the current data flow explicit; an ORM could make models and migrations more convenient, but adds another abstraction to review. Per-request connections add setup overhead; a pool created within each worker could reduce that overhead while requiring careful sizing across all workers. Production still needs database backups, access controls, and a recovery procedure.

### 7. Calendar dates and bounded diary values

Retained: a diary day is a local `YYYY-MM-DD` value stored as a PostgreSQL `DATE`, rather than an instant at midnight in a timezone. Food calories are whole numbers; macros can be missing; lifts retain their explicit lb/kg unit, sets, and reps. Input is checked on the server as well as in the interface.

Why: “what I ate on Tuesday” should not move to Monday after a timezone conversion. Bounds also keep malformed dates, non-finite numbers, and invalid units out of the database. Missing nutrition values remain distinguishable from a measured zero.

Tradeoffs and alternatives: timestamps would be useful for a meal timeline or timezone-aware travel history, but would need an explicit rule for assigning each entry to a diary day. Treating unknown macros as zero would simplify totals but overstate their completeness. The interface instead marks incomplete macro totals. These choices suit a daily log; they do not provide meal times, unit conversion between stored lifts, or a detailed nutritional assessment.

### 8. Same backend plus refresh gives web/phone synchronization

Implemented: clients load the selected day from the same API. Successful mutations update or reload the local diary; the website refreshes diaries, custom foods, and weight history on focus/visibility changes and every 15 seconds while visible. Mobile refreshes when returning to the foreground and every 15 seconds while active. Refresh retains form drafts, skips pending mutations, and invalidates stale loads when a write or identity/day change supersedes them.

Why: for a small personal diary, a fresh read is easy to reason about and uses the existing endpoints. The same registered account on both devices resolves to the same account ID, so the server reads the same rows. A guest on one device is a different identity from a guest on another device.

Tradeoffs and alternatives: polling is simple and recovers naturally after a connection interruption, but adds repeated reads and a delay before another device’s change appears. WebSockets or server-sent events could push updates faster, but would add connection lifecycle, authorization, reconnect, and server-distribution concerns. Local-only state would avoid background traffic but remain stale across devices. This implementation does not provide instantaneous collaborative editing, an offline-write queue, or conflict merging; current diary operations are add and delete rather than concurrent editing of a shared record.

### 9. Idempotent schema updates preserve legacy rows

Implemented: the schema adds accounts, sessions, guest identity, ownership columns, and ownership/date indexes without assigning old unowned rows to whichever person signs up first. Existing food and lift records with no account remain stored but are excluded from account-scoped diary queries.

Why: the old global diary does not contain evidence of who owns each row. Automatically claiming it for a new account could disclose someone else’s history. Preserving rows allows a later, explicit migration after ownership is established.

Tradeoffs and alternatives: deleting legacy rows would simplify the database but destroy potentially useful data. Assigning everything to the first account would be convenient on a confirmed single-user installation, but would be an unsafe default without that confirmation. Idempotent schema SQL is easy to rerun for this small project; versioned migrations would give a clearer ordered history and controlled rollback as the schema evolves. An ownership migration, versioned migration policy, and legacy-data retention decision remain review items.

## Authentication and account ownership

### 10. Store the requested salted SHA-512 hex format in one column

Implemented to match the supplied example: generate `salt = uuid.uuid4().hex`, compute `hashlib.sha512((salt + password).encode('utf-8')).hexdigest()`, and store `sha512$salt$hex_digest` in the account’s single password column. The salt is 32 hexadecimal characters; a UUID v4 includes fixed version/variant bits and has 122 random bits. The SHA-512 digest is 128 hexadecimal characters. A fresh salt is generated when the password changes. Plaintext passwords are not stored.

Why: this follows the requested salting, hex-digest, and combined-storage pattern exactly. The prefix records the algorithm, while the salt allows the server to recompute the digest during verification. Hex is an encoding, not an additional security layer. Python documents the digest/hex distinction. [S2]

Tradeoffs and alternatives: this is a fast general-purpose hash with no configurable work factor. A unique salt prevents precomputed hashes from being reused across accounts; it does not make each guess expensive. This requested choice should be reconsidered before public use. OWASP recommends a password-specific KDF such as Argon2id, with scrypt as an alternative and PBKDF2 for suitable compatibility requirements. [S3] Their costs and compatibility differ; the comparison appendix gives the pros and cons. The current parser/schema accepts only the requested SHA-512 format, so a future migration must update verification and storage validation as well as the hash function.

### 11. Compare digests carefully and normalize account identifiers

Implemented: verification parses the stored format, recomputes the digest, and uses `hmac.compare_digest`. A dummy stored-format value avoids skipping the hash calculation solely because an email was not found. Login failures use the same public “Email or password is incorrect” message. Emails are trimmed and lowercased; names are trimmed; the server enforces 1–80-character names, email length up to 254, and passwords of 12–128 characters.

Why: consistent identifiers prevent common duplicate-account mistakes, bounds keep requests manageable, and digest comparison avoids a straightforward early-exit string comparison. These measures do not make the entire login route constant-time: database behavior, validation, and other branches still differ.

Tradeoffs and alternatives: stricter password composition rules can reject weak-looking passwords but also reject long usable passphrases and create additional user friction. A breached-password check would add useful screening and another dependency; it is not implemented. Full email verification would establish control of an address, while the current syntax check does not. Signup reports an existing address as a conflict, which is useful feedback but reveals account existence. A managed identity provider or passkeys could move some credential handling out of this application, at the cost of a larger product and integration decision.

### 12. Opaque, database-backed sessions persist for 30 days

Implemented: successful authentication creates a cryptographically random 32-byte token represented as 64 hex characters. The server stores its SHA-256 digest, account ID, and absolute expiry; each authenticated request resolves the token against an unexpired session. The browser cookie has a matching 30-day lifetime. Relaunching the browser or app can restore the session without asking for the password again.

Why: a database row makes expiry and revocation explicit. Hashing a random high-entropy token means a leaked session table does not directly reveal the bearer tokens. This use of a fast digest is different from hashing a guessable human password. There is no sliding renewal or refresh-token protocol in this implementation.

Tradeoffs and alternatives: signed JWTs can avoid a database lookup for ordinary verification, but immediate logout or password-change revocation usually reintroduces server state or requires accepting a remaining validity window. An in-memory session map would be simpler but would disappear on restart and disagree across Gunicorn workers. Shorter sessions reduce the usefulness of a stolen token but interrupt the requested persistent experience. Thirty days is a convenience/security choice, not a guarantee of permanent login; expiry, explicit logout, and revocation still require restoration or a new sign-in. Session behavior should be reviewed against the deployment’s risk and device-sharing assumptions. [S4]

### 13. Cookies for the website; SecureStore bearer tokens for the phone

Implemented: the website uses same-origin cookies with HttpOnly, SameSite=Strict, path `/`, and Secure in production. Browser code does not put the returned token in localStorage. The API returns tokens in authentication JSON for the native client; mobile stores the active and guest tokens separately in Expo SecureStore and sends an Authorization bearer header.

Why: browsers already manage same-origin cookie persistence. HttpOnly prevents ordinary JavaScript cookie reads, while Strict reduces cross-site sending. These flags do not stop a compromised page from issuing authorized requests, and the shared authentication response still contains a token that browser code intentionally ignores. [S5] SecureStore gives native credentials operating-system-backed protection rather than placing them alongside ordinary preferences. Expo documents platform-specific persistence and uninstall limitations; it should not be treated as a recovery mechanism. [S6]

Tradeoffs and alternatives: localStorage tokens would be straightforward to inspect and send, but expose persistent bearer credentials to page scripts. Browser-only cookies would not provide a reliable native token-storage abstraction. Keeping a token only in memory would limit persistence but require sign-in on every cold launch. SecureStore can fail or become unavailable; the mobile flow handles restoration errors, and an account session that cannot be stored is revoked rather than presented as a successfully saved login.

### 14. Anonymous use is an isolated, persistent guest account

Implemented: the first visit automatically obtains a guest identity and session, so the diary is usable without registration. A guest is a real database account marked as guest, with no email or password. Its food/lift rows use the same ownership rules as registered accounts. A persistent guest cookie or SecureStore key allows that device’s diary to return while the session remains valid.

Why: this preserves the requested no-sign-in experience without returning to one shared public diary. Registration is optional rather than a gate in front of logging food.

Tradeoffs and alternatives: an unowned global diary would be easy to implement but expose entries across visitors. Browser-only guest storage would avoid anonymous server rows, but make guest upgrades and API synchronization a separate data-import problem. Requiring an account immediately would simplify identity recovery but add friction before the first entry. A guest has no email recovery or cross-device login: losing its device credential or allowing the session to expire can make its existing rows inaccessible. Guest-account/data cleanup and a longer-term recovery policy are not implemented.

### 15. Registration upgrades the guest; login merges into the existing account

Implemented: registration converts the active guest account into a registered account while retaining its account ID and entries. Login transfers the active guest's data into the existing registered account after credentials are verified. Both revoke the old guest sessions, clear the guest credential, and issue a new registered session. Logout opens a fresh guest diary. Decision 29 defines overlap resolution and verification.

Why: the requested behavior is to keep logging as a guest and then retain that work after either signup or login. Existing account records take precedence over overlapping guest records, and the anonymous token cannot remain a credential for the registered account.

Tradeoffs and alternatives: keeping a separate guest diary on login would preserve two histories, but would not fulfill the requested transfer. An explicit import preview would give more control with another workflow. Automatic transfer needs documented overlap rules; those rules and transaction rollback are tested. The earlier separate-guest-on-login behavior is superseded by decision 29.

### 16. Enforce ownership in every diary query

Implemented: identity comes from the validated server session. Food and lift lists filter by both account and date; inserts use the resolved account ID; deletes match both entry ID and account ID. The client cannot choose another owner by submitting an account ID. Unauthorized deletes return “not found,” rather than exposing the other person’s record.

Why: an unpredictable entry UUID is useful identification but is not authorization. Ownership has to be checked wherever data is read or changed, including for guests.

Tradeoffs and alternatives: trusting a client-supplied user ID would reduce middleware work but allow impersonation. Separate tables or databases per user would give stronger physical separation with much greater operational complexity. PostgreSQL row-level security could provide an additional database enforcement layer, but requires careful connection-role/context management and is not enabled here. PostgreSQL’s documentation explains its default-deny behavior once enabled and the roles that can bypass it. [S7] The current protection is explicit server query scoping backed by isolation tests; future endpoints must preserve that rule.

### 17. Keep account controls focused: name, password, sign-out

Implemented: Settings lets a registered user edit the profile name, view the email address, change the password after supplying the current password, and sign out. It also contains appearance and daily bodyweight controls. A successful password change revokes other sessions while retaining the current one. The password update compares the previous stored value so concurrent changes cannot silently overwrite a newer password. Wrong-current-password feedback stays within the form rather than treating it as a session expiry.

Why: these are the basic controls needed to manage the implemented account without adding unverified identity-changing flows. Settings is an authenticated destination, while guests can use the diary and reach optional Log in/Sign up from the header. This keeps account-only controls out of guest navigation. A guest-accessible preferences panel could expose appearance without authentication, but would require another destination; the current navigation follows the requested simpler guest layout.

Tradeoffs and alternatives: email changes, password reset by email, address verification, account deletion/export, two-factor authentication, a device/session list, and passkeys are not implemented. Each can be valuable but requires policy, additional UI, and often external services or recovery semantics. Revoking every session after a password change would be stricter but interrupt the current user; keeping every session would be more convenient but leave other devices signed in after a credential change. Keeping only the verified current session is the chosen balance.

### 18. Basic request defenses are useful but limited

Implemented: credential and guest endpoints share a PostgreSQL-backed limit of 20 attempts per source IP in a fixed 15-minute window. The source address is hashed for the counter key, requests have a 16 KiB JSON body limit, validation rejects malformed data, API responses disable caching, and unexpected server/database errors return a generic message. Browser writes check for foreign Origin/Sec-Fetch-Site context; native bearer requests follow the explicit-token path. Production cookies require HTTPS.

Why: these measures reduce common accidental and abusive requests without adding a separate security service to a small application. They support the authentication design but do not replace it.

Tradeoffs and alternatives: a process-local limiter would be simpler but split counters across Gunicorn workers and reset on restart; storing counters in PostgreSQL avoids those problems and adds database work to authentication. A fixed window permits bursts near a window boundary, an IP-only rule groups users behind a shared address, and the apparent source depends on proxy configuration. A Redis-backed sliding limiter or trusted edge policy could offer more nuanced control, with another deployment dependency. Explicit CSRF tokens can support more complex browser-origin arrangements but need distribution and verification. Cross-origin website hosting is not configured as a product feature. TLS/proxy trust, monitoring, and abuse/load testing remain deployment review work.

## Existing nutrition behavior and operating the app

### 19. Retain USDA lookup and manual entry

Retained behavior, ported to the Python backend: ingredient search goes through the server to USDA FoodData Central, uses the SR Legacy dataset, returns a small normalized nutrient set per 100 g, and lets the user choose a gram amount. Manual food entry remains usable if lookup fails or a food is missing. Unknown nutrient values remain unknown; the UI keeps the source and measurement basis visible.

Why: the existing integration already supports a useful narrow workflow. A server-side lookup keeps the API key out of the public client configuration and gives both clients the same normalization behavior. The Python port preserves that contract rather than introducing a new nutrition provider.

Tradeoffs and alternatives: a larger food catalog or barcode provider could improve packaged-food coverage but add cost, licensing, and matching work. Letting clients call USDA directly would reduce backend work but expose the configured key and duplicate normalization. A local catalog would reduce network dependence but require updates and storage. The demo key is rate-limited; a configured USDA key and operational handling of upstream failure are needed for regular use. USDA’s API guide describes authentication and rate limits. [S8]

### 20. One origin in production, a reachable API for the phone

Implemented structure: the production web build is served alongside `/api`, and PostgreSQL is reached only by the server. During development, Vite proxies `/api` to Gunicorn with `changeOrigin: false`, preserving the browser-facing Host used by the server’s Origin check. The phone uses `EXPO_PUBLIC_API_URL` for that same backend origin. A shared account synchronizes because both clients resolve to the same database owner, not because the phone mirrors browser storage.

Why: keeping website and API under one HTTPS origin simplifies cookies and avoids a cross-origin browser authentication configuration. A single backend URL gives mobile a clear environment boundary.

Tradeoffs and alternatives: separate frontend/API domains can allow independent hosting and caching, but require explicit origin, credentials, cookie, and proxy decisions. Exposing PostgreSQL to the clients would bypass the server’s ownership checks and disclose database credentials. Self-hosting gives control and creates work for TLS, process supervision, backups, monitoring, secrets, and updates. A managed platform can reduce some work while introducing platform constraints and recurring cost. No public hosting, domain, TLS certificate, or signed phone release is created merely by adding Gunicorn configuration. Gunicorn’s deployment documentation recommends a reverse proxy. [S9]

### 21. Preview on a real phone before preparing a signed release

For a local preview, the computer and phone must be able to reach each other, usually on the same Wi-Fi. Follow the root README to install dependencies, start PostgreSQL, and run `npm run db:migrate` from `web`. Set `HOST=0.0.0.0` in `web/.env` and run `npm run dev`; this starts Gunicorn/API on port 3001 and the Vite website. In `mobile/.env`, set `EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:3001`, then run `npm start` from `mobile`. Open the project through a compatible Expo Go installation or a development build. The actual LAN IP is required: `127.0.0.1` on a physical phone points at the phone itself. An Expo/Metro tunnel does not automatically tunnel the separate API. Restart Expo after changing the environment URL.

Why: this is a practical way to exercise the installed client against the same database before distribution. A development build is the app’s own native runtime; Expo Go is a convenient preview runtime with a fixed native-module set. Expo’s environment and development-build guidance explains the distinction. [S10] [S11]

Tradeoffs and alternatives: LAN preview is quick but depends on the computer, firewall, and network, and local HTTP is appropriate only for controlled development. A hosted HTTPS backend works across networks and requires deployment. A standalone installation requires signing and a distribution route; EAS Build can produce app binaries, while iOS/TestFlight and store distribution require the relevant provider accounts, identifiers, credentials, and policies. Those releases are not completed here. [S12] A JavaScript bundle export alone is not an installable signed application.

### 22. Verification should match the behavior being claimed

Implemented verification strategy: server tests exercise credential format/verification, account and guest lifecycles, session revocation, validation, and account-scoped CRUD; database integration checks exercise actual PostgreSQL constraints and persistence. TypeScript checks and production/export builds validate the clients’ compilation. Browser or device interaction is a separate check and must not be inferred from a successful build.

Current evidence: the React/TypeScript website production build passed after the weight/custom-food changes, and 23 Python unit/API tests passed. A real PostgreSQL 18.4 integration test passed in an isolated schema, covering repeatable migration from the old schema, legacy-row preservation, persisted account sessions, ownership/guest behavior, atomic password/session changes, shared rate limits, custom foods, bodyweight upserts/isolation, constraints, and parameterized handling of SQL-like text. Gunicorn ran with two sync workers against the temporary database and returned a healthy API response. Mocked-fetch runtime checks passed for JSON transport, same-origin credentials, disabled caching, unauthorized-event handling, empty responses, network-error messages, and cancellation during response parsing. Mobile TypeScript and ESLint checks passed, and the final custom-food, weight, and line-graph code exported successfully for both iOS and Android. Browser checks passed for guest persistence, signup retaining the guest diary, quick-add macros, custom-food save/log, weight logging and the line graph, light/dark appearance, a 390-pixel layout without horizontal overflow, and cross-tab logout/login. An independent bearer client read the same diary/custom foods and saved a weight visible to the browser. Physical-phone interaction and deployment remain unverified. Detailed results are recorded in the project verification notes.

Historical evidence: `docs/verification.md` originally records an October 16 implementation, including the earlier Node backend and an earlier simulator run. Those results do not by themselves validate the October 18 Flask/auth/theme changes. No simulator or physical-device interaction has been verified for the new mobile changes. A signed iOS/Android release, physical-device synchronization, a production reverse proxy/TLS deployment, abuse behavior under load, and recovery workflows must only be called tested after those specific checks run.

Tradeoffs and alternatives: mocks give fast and focused failures but cannot prove database SQL, browser rendering, OS storage, or real networking. Integration and device tests cover more of the system but need more setup and produce slower feedback. A small, meaningful set across these layers provides stronger evidence than repeating one build or counting tests without examining what they cover.

### 23. Document module boundaries and the reasons behind subtle code

Implemented: the web source contains focused comments about identity transitions, guest fallback/restoration, mutation locks, stale responses, timeout/cancellation, device preferences, and semantic themes. `web/README.md` maps the React files to their responsibilities, describes account/guest/API flows, and explains how polling and settings work. The root guide owns full setup/deployment instructions; this review document records decisions and alternatives.

Why: comments are most useful where a small edit could violate a less obvious rule, such as treating a wrong password as session expiry or letting a stale response show another identity’s rows. A module map helps a reviewer find the relevant implementation without narrating each line of React.

Tradeoffs and alternatives: exhaustive line-by-line comments would be easier to generate but noisier and more likely to become stale. Keeping all explanation in one README would centralize prose but separate important invariants from the code they constrain. More generated API documentation could help a larger client ecosystem, with tooling and maintenance overhead. The chosen documentation needs updates when contracts, identity transitions, or deployment commands change; it is not a substitute for tests.

### 24. Coordinate account changes across tabs and pending requests

Implemented: the web account provider broadcasts non-secret operation notices through BroadcastChannel, with a localStorage event fallback. A “changing” notice temporarily gates other tabs before cookies change; a completion notice makes them recheck `/api/account`. Notices have sender/operation IDs for deduplication and a 20-second recovery timeout if a sending tab disappears. Only coordination markers enter localStorage, never session tokens. Focus and 15-second visible polling also reconcile identity and profile-name changes.

Why: cookies are shared across tabs, while each tab’s React state is separate. Without coordination, an old guest/account screen could remain visible after another tab changes the browser’s active session. A session revision marks identity boundaries; diary loads, mutations, and keyed components reject results from a superseded scope. The API helper also checks cancellation after body parsing so an old 401 cannot expire a newer session. A routine identity check leaves the revision and drafts alone when the identity has not changed.

Tradeoffs and alternatives: relying on cookies alone would reduce client coordination but permit stale identity state. Polling alone would eventually recover with a window of confusion; broadcasts make the normal transition prompt and still need fallback checks. A SharedWorker or larger state/query infrastructure could coordinate more centrally, with more browser/runtime complexity. This mechanism coordinates presentation and pending work; the server remains the authorization authority. Cross-tab messages contain no credentials and are not a substitute for ownership checks.

### 25. Optional quick-add macros and a private per-serving food library

Implemented: Quick add accepts protein, carbs, and fat in grams alongside calories. Blank macro fields are stored as unknown, while an entered zero remains zero. Custom foods save a name, whole-number calories, and optional macros for one serving in an account-scoped catalog, available to guests as well as registered users. Adding a custom food copies those nutrient values into a new diary entry; deleting the catalog item does not rewrite or remove earlier diary entries. Guest registration retains the catalog through the same ownership upgrade.

Why: repeated homemade or packaged servings should not require repeated typing or a USDA match. Keeping a diary snapshot preserves what was logged on that day, even when the reusable library changes later.

Tradeoffs and alternatives: making every diary row reference a mutable catalog record would reduce duplicated nutrient values but could silently change historical totals after a catalog edit or deletion. A recipe/ingredient model or gram-based serving definition would support richer quantities, with considerably more units and editing rules. This first catalog intentionally describes one serving; adding the same food again records another serving. Macros remain optional rather than blocking a useful calorie-only entry, so incomplete totals still need to be marked clearly. The catalog is private, with no shared community-food moderation or automatic nutrition verification.

### 26. One bodyweight per day, with a unit-consistent 30-day line graph

Implemented: registered users can save bodyweight in lb or kg under Settings. The database key is account plus calendar date, so saving the same day updates that day’s value. The API preserves the entered value/unit and returns a canonical kilogram value using `lb × 0.45359237`. Weight endpoints reject guests and enforce positive finite weights up to 1,500 kg or 3,307 lb. Reads return the latest 30 logged dates in ascending order; both clients filter these into the last 30 calendar-day positions.

Why: a daily record makes correcting an entry predictable. Chart points all use one selected display unit derived from canonical kilograms, so switching lb/kg does not mix incompatible heights. The line graph has a zero baseline, real calendar gaps for missing days, and textual date/value labels for assistive technology. The website uses a small SVG line plot plus an accessible date/value list. Mobile draws points and rotated line segments with native Views. Both join only adjacent logged days, without interpolating across missing measurements; neither adds a chart dependency. Weight reads also refresh on foreground/focus and every 15 seconds, preserving input drafts. The website date control permits today and earlier dates; the mobile picker and server accept any valid diary date. Future dates are not plotted in the current 30-day window.

Tradeoffs and alternatives: multiple weigh-ins per day would preserve more detail but need aggregation rules for a daily chart. Storing only kilograms would simplify comparisons but lose the original entered-unit snapshot. Plotting only consecutive logged dates would look compact but hide time gaps; connecting a line through missing days could imply observations that never occurred. A bar chart would emphasize each separate measurement but make trends less immediate; the requested line graph emphasizes change over time, while gaps avoid implying measurements that do not exist. A chart library would offer richer tooltips, zooming, and more chart types with additional code/dependencies. The current chart shows actual saved values only, with no interpolated measurements, targets, medical interpretation, or fabricated sample data. Longer history and a separate weight synchronization view remain future product choices.

### 27. Reuse precise creation timestamps for minute-level log timelines

Implemented: food and lift rows already store `created_at TIMESTAMPTZ DEFAULT now()` and are queried chronologically. The API now includes that existing value as UTC ISO-8601 `createdAt`, retaining milliseconds. Web and mobile render local `HH:mm` labels beside a timeline marker; the stored precision is not reduced. No schema migration is needed.

Why: exposing an existing timestamp and sharing a small formatter per client keeps this change within 50 changed code lines, including regression assertions. UTC transport prevents ambiguous timezone parsing, while device-local display fits the viewer’s clock. The selected diary date remains a separate calendar date.

Tradeoffs and alternatives: `createdAt` means when the entry was logged, not necessarily when the meal or exercise happened. A backdated diary entry still shows its real creation time. Capturing or editing the actual event time would require a separate occurrence timestamp and an input control. Replacing the diary date with a timestamp would change day-selection semantics; storing only hour/minute text would lose timezone and ordering information. Existing stored timestamps are reused without inventing historical meal times.

### 28. Named workouts own exercises; mobile is implemented first

Implemented: accounts → workouts → workout_exercises. A workout owns its name, calendar date, precise creation timestamp, and current status. Each exercise owns its lift values and references its workout; it no longer duplicates the account or diary date. Multiple workouts on the same day are allowed. Account ownership is checked through the parent workout for every mobile exercise write.

Why: a workout is the daily timeline entry, while its exercises describe what happened within it. Foreign keys enforce that relationship and cascade child deletion if a workout is removed. A separate exercise catalog with a many-to-many relationship could support reusable exercise definitions later, but adds no needed behavior for these logged exercise snapshots. Storing exercises as JSON would reduce table count, while making individual updates, constraints, and ownership checks less direct.

Current workout: starting a named workout makes it the account’s single current workout, across dates and devices. A partial unique index enforces that rule; a short account-row transaction serializes workout starts and exercise writes across Gunicorn workers. Mobile edits only the current workout inline. Historical workouts remain read-only in mobile; tapping one explicitly opens a native summary modal showing exercises, sets, reps, weights, and units. Tapping the current workout focuses its inline exercise field and never opens that modal. A new workout does not automatically open a popup.

Alternatives: deriving “current” from the latest timestamp would avoid a status field but make the lifecycle implicit. Keeping current status only on the phone would let devices disagree. Explicit finish/resume controls or one current workout per day could support other routines, with additional transitions and validation. A separate history screen would offer more space; the native modal keeps this small summary in context without adding navigation or UI dependencies.

Migration and rollout: the old lift_entries table becomes workout_exercises. Existing rows are grouped into one historical workout named “Workout” per owner and day, retaining exercise IDs, values, and timestamps. Old data cannot reveal multiple workout boundaries, so the migration does not invent them. Unowned legacy data stays hidden under unowned historical parents; new API-created workouts always belong to the authenticated account or isolated guest. The migration is repeatable.

Mobile API: GET/POST /api/workouts and POST/DELETE /api/workouts/{workout_id}/exercises[/exercise_id]. The selected date filters timeline parents; exercises inherit that date. The existing auth, session-scoped request cancellation, draft preservation, foreground refresh, and 15-second active polling are reused. The web interface is unchanged during this mobile-first phase. Its existing /api/lifts routes temporarily adapt to the relational model; date-only web writes append to the most recent workout on that day, or create a historical “Workout,” without switching mobile’s current workout. Removing that adapter waits for the web rollout.

Scope: this is a focused model/API extension plus one mobile screen, rather than a new backend or state framework. It is larger than the earlier under-50-line timestamp change because it adds a real parent-child relationship, preserves old records, and coordinates the current workout across devices.

### 29. Shared auth endpoints, native sheets, and account-preferred guest transfer

Implemented: mobile header Log in and Sign up buttons now open the existing SignIn form in a native page-sheet Modal rather than navigating to a hidden tab. Opening a form is a local UI action; submission uses POST /api/auth/login or POST /api/auth/register. Both mobile and web already use these same Flask REST endpoints. Mobile sends a SecureStore bearer token; browsers send HttpOnly cookies. Separate mobile and web authentication APIs are unnecessary.

Guest transition: signup upgrades the current guest account and preserves its ID/data. Successful login into an existing account transfers the guest’s food, custom foods, weights, and workouts with their exercise children. Existing account profile, password, and conflicting records win. Overlap keys are calendar date plus trimmed case-insensitive name for food/workouts, normalized name for custom foods, and calendar date for weight. An overlapping workout retains the account workout’s entire exercise list. Distinct entries transfer with their original IDs/timestamps. An existing account current workout also wins; an imported guest current workout becomes historical in that case.

Why and tradeoffs: the user requested retaining anonymous work after either login or signup. Login transfers records, revokes every consumed guest session, deletes the consumed guest owner, and creates a new unpredictable account session in one transaction with stable account-lock ordering. A failed session insert rolls the transfer back. Cookies and the saved mobile guest key are cleared after success; logout opens a fresh guest diary. A separate guest diary or import-preview screen would preserve more user control with another workflow. Name/date matching can collapse intentional repeated entries with the same name; explicit record identifiers or an import preview could refine that policy later. These matching rules are deliberately documented for review.

Login SQL review: account_by_email executes WHERE email = %s with a separate parameter tuple. The f-string only contains a static server-owned column projection; email and password are never interpolated into SQL. Password verification hashes the candidate in Python and compares digests. PostgreSQL regression tests submit SQL-like email/password payloads and verify generic 401 responses, no authentication, and intact accounts. This is a login-only review, not a claim that the whole application received a security audit.

Verification and checkpoint: all 26 API/database tests pass, including cookie/bearer login transfer, account-preferred conflicts, failed-login preservation, token rotation/revocation, and transaction rollback. Mobile TypeScript, ESLint, and iOS/Android JavaScript exports pass. The login sheet was visually verified in the iPhone simulator. Full disposable signup/login submission checks remain pending in the separate iPhone 17 Pro Max simulator; the original simulator contains the user’s active account and must not be logged out for testing.

Next requested change, not implemented: reshape workout storage into users, app-owned exercises, workout_sessions, workout_exercises, and exercise_sets. Only the application manages catalog definitions; users log performance against them. Existing food and auth/session storage must remain. The migration must preserve old names, ownership, timestamps and workout IDs, expand aggregate sets into per-set records, and adapt the shared API/mobile exercise selection without breaking existing web compatibility. No SQL for this new migration has been applied. Work stopped when remaining usage reached 4%.

## Phone installation: practical steps

1. Install Node.js 24, Python 3.12 or newer, and PostgreSQL (or Docker Desktop). Complete the root README’s web setup: copy web/.env.example to web/.env, install npm and Python requirements, start the database, and run npm run db:migrate from web.
2. Put the phone and computer on the same trusted Wi-Fi. Find the computer’s LAN IP in macOS System Settings → Wi-Fi → Details → TCP/IP; use that actual address wherever YOUR_COMPUTER_LAN_IP appears below.
3. Set HOST=0.0.0.0 in web/.env and run npm run dev from web. Keep this terminal open; it starts Gunicorn/API on port 3001 and the development website.
4. On the phone, open http://YOUR_COMPUTER_LAN_IP:3001/api/health in a browser. Confirm it returns {"status":"ok"}. If it fails, check the API, firewall, network isolation, and address before opening Expo.
5. Open mobile in a second terminal, run npm ci, and copy .env.example to .env. Set EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:3001 in mobile/.env, without an extra /api suffix.
6. Install a compatible Expo Go client, run npm start from mobile, and scan the QR code with the iPhone Camera or Android Expo Go scanner. Use a development build if Expo Go cannot run SDK 58 or a required native module. Restart Expo after changing its API URL. The computer, API, database, and Expo server must stay running for this local preview.
7. Create an account or log into the same account on both phone and website. Save a food, custom food, or daily weight on one client and reopen the matching screen on the other, or allow 15 seconds while active. Guests have separate diaries. A phone’s localhost points to the phone; an Expo tunnel does not automatically expose the Flask API.

For an independent installation, configure your own Expo project and app identifiers, authenticate with `npx eas-cli@latest login`, run `npx eas-cli@latest build:configure`, and add a preview profile with internal distribution in `eas.json`. Android: run `npx eas-cli@latest build --platform android --profile preview` and install the returned APK link. iPhone: configure Apple signing and register the device with `npx eas-cli@latest device:create`, then run `npx eas-cli@latest build --platform ios --profile preview` and use its installation link; TestFlight is another route. These steps require the relevant provider accounts and signing setup and have not been executed here.

For use away from the computer, host the built website and Gunicorn API at the same HTTPS origin with persistent PostgreSQL. Set mobile’s public API URL to that origin without an extra `/api`, then rebuild/restart it. Sign into the same account on phone and website. Entries share database ownership, while each device keeps its own session. Check sync by saving a food/custom food/weight on one device and reopening the matching screen on the other or allowing 15 seconds while active. Guest sessions remain separate; offline edits and instant push updates are not implemented.

## Password storage alternatives

This comparison is for the review decision in section 10. The requested SHA-512 format is implemented; the other rows describe alternatives, not capabilities already added.

| Approach | Advantages | Costs and limitations |
| --- | --- | --- |
| Salted SHA-512 hex, current | Matches the supplied example; standard-library implementation; compact, inspectable combined value. | Fast offline guesses; no adjustable password work factor; changing algorithms needs parser/schema and migration work. |
| Argon2id | Password-focused, memory-hard design; tunable cost; preferred modern option in OWASP guidance. | Requires compatible implementation and measured memory/CPU settings; changes the requested format and migration path. |
| scrypt | Memory-hard password KDF; available in Python/OpenSSL environments; tunable cost. | Availability and memory limits must be verified on the deployment; parameters need benchmarking and format/version handling. |
| PBKDF2-HMAC | Broad support; useful where compatibility or validated implementations matter; configurable iterations. | CPU-cost approach rather than memory-hard design; needs sufficiently strong, maintained parameters and a migration plan. |
| Managed identity or passkeys | Can reduce custom password handling and add mature recovery or phishing-resistant login options. | Changes the product/integration model; provider or platform dependencies, migration, and account-linking decisions remain. |

## Questions for review

- Is matching the screenshot’s fast SHA-512 password construction more important than adopting a modern password KDF before public use?
- Is a fixed 30-day session acceptable for shared devices, and should the user have a session/device list or shorter lifetime option?
- Should a guest be able to merge entries into an existing account, and how should inaccessible or abandoned guest data be retained or deleted?
- Who owns the pre-account legacy rows, and what evidence should be required before assigning them?
- Is polling/foreground refresh sufficient, or does the diary need immediate push updates and offline writes?
- Should custom foods gain named quantities, recipes, or versioned editing, rather than one serving per add?
- Is one bodyweight per day and a 30-day view sufficient, or should the app preserve multiple daily observations and longer history?
- Which environment will host Gunicorn/PostgreSQL, terminate HTTPS, back up data, and correctly identify source addresses for the shared rate limit?
- Which recovery and account-management features are required before other people use it: email verification/reset, 2FA/passkeys, deletion/export, and session controls?
- Is Expo Go/development preview enough for now, or should the next deliverable be a signed installation through EAS/TestFlight or an Android distribution route?

## Primary references

[S1] [Gunicorn design and worker model](https://gunicorn.org/design/)

[S2] [Python hashlib: digests, hex output, and key derivation](https://docs.python.org/3/library/hashlib.html)

[S3] [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

[S4] [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

[S5] [MDN Set-Cookie: HttpOnly, Secure, SameSite, and persistence](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)

[S6] [Expo SecureStore: platform storage and persistence limits](https://docs.expo.dev/versions/latest/sdk/securestore/)

[S7] [PostgreSQL row security policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

[S8] [USDA FoodData Central API guide](https://fdc.nal.usda.gov/api-guide/)

[S9] [Gunicorn deployment guidance](https://gunicorn.org/deploy/)

[S10] [Expo environment setup](https://docs.expo.dev/get-started/set-up-your-environment/)

[S11] [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/)

[S12] [EAS Build introduction](https://docs.expo.dev/build/introduction/)

## Implementation locations

Web: `web/client/src/main.tsx`, `styles.css`, `Account.tsx`, `Settings.tsx`, `api.ts`, `Extras.tsx`, `CustomFoods.tsx`, `MacroInputs.tsx`, `WeightTracker.tsx`, and `WeightTracker.css`.

Mobile: `mobile/theme.tsx`, `session.tsx`, `api.ts`, `SignIn.tsx`, `src/app/_layout.tsx`, `src/app/index.tsx`, and `src/app/lifts.tsx`.

Backend/data: `web/server/auth.py`, `app.py`, `db.py`, `nutrition.py`, `validation.py`, `schema.sql`, `web/requirements.txt`, and the Gunicorn configuration/start scripts.

Verification and operation: `docs/verification.md`, `web/tests`, `web/README.md`, `mobile/README.md`, and `web/compose.yaml`.
