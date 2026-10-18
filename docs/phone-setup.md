# Use Avocado on your phone

The phone app and website call one Flask/Gunicorn API, backed by one PostgreSQL database. Sign into the same account on both to see the same diary, custom foods, and weight logs. Guest diaries are separate.

## Preview on the same Wi-Fi

1. Follow the root README's first-run setup: install web/Node and Python dependencies, start PostgreSQL, configure `web/.env`, and run `npm run db:migrate` from `web`.
2. Find the computer's LAN IP in macOS System Settings → Wi-Fi → Details → TCP/IP. Use the actual address wherever `YOUR_COMPUTER_LAN_IP` appears below.
3. Set `HOST=0.0.0.0` in `web/.env`. Run `npm run dev` from `web`, or restart it if it was already running. Keep this terminal open.
4. On the phone, open `http://YOUR_COMPUTER_LAN_IP:3001/api/health` in its browser. It should show `{"status":"ok"}`. If it does not, check that both devices are on the same trusted network, the API is running, and the firewall permits port 3001. A guest Wi-Fi network may isolate devices.
5. In a second terminal, open the project's `mobile` directory, run `npm ci`, and copy `.env.example` to `.env`. Set `EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:3001` in that file.
6. Install a compatible Expo Go client on the phone, then run `npm start` from `mobile`. Scan the terminal's QR code: use the Camera app on iPhone or Expo Go's QR scanner on Android. If Expo Go is incompatible with SDK 58 or lacks a required native module, use an EAS development build.
7. Open Avocado, create an account if needed, and log into that same account on the website. Add a food on one client and return to the other. Active clients refresh about every 15 seconds; reopening a screen or returning to the app also refreshes it.

Restart Expo after changing `mobile/.env`. A physical phone's `localhost` points to the phone, not the computer. An Expo tunnel only connects Metro; it does not automatically expose the separate Flask API. The computer, API, database, and Expo server must remain running for this local preview.

Local HTTP is for a trusted development network. Do not put database credentials or the USDA key in the public mobile API URL.

## Install an app that runs without Expo Go

An installable build requires an Expo account, app identifiers you own, native signing, and a backend reachable from the phone. For normal use away from the computer, deploy the website and API together at an HTTPS origin backed by persistent PostgreSQL, then set `EXPO_PUBLIC_API_URL` to that origin before building.

From `mobile`, run `npx eas-cli@latest login`, then `npx eas-cli@latest build:configure`. Configure your Expo project and your own `ios.bundleIdentifier` / `android.package` in `app.json`; do not reuse another app's identifiers. For an internal installation, add a `preview` build profile with `distribution: "internal"` in `eas.json`.

- Android: `npx eas-cli@latest build --platform android --profile preview` creates an internal APK. Open the returned installation link on the phone and follow Android's installation prompt.
- iPhone: an internal ad hoc build requires Apple Developer membership, signing, and registration of the test device. Run `npx eas-cli@latest device:create`, register the device, then run `npx eas-cli@latest build --platform ios --profile preview`. Install from the resulting EAS link. TestFlight is another distribution route and also requires Apple setup.

These commands may involve provider accounts, signing credentials, or paid services. No EAS build, signed IPA/APK, Apple/Google submission, or public deployment has been performed here. `npm run build` in mobile exports JavaScript bundles; it does not install the app on a phone.

## One backend in production

The Gunicorn server receives `DATABASE_URL`, `USDA_API_KEY`, `AVOCADO_ENV=production`, `HOST`, and the host's `PORT`. Build the website, run migrations, then start Gunicorn behind HTTPS as described in the root README. The website calls relative `/api` paths; the phone's `EXPO_PUBLIC_API_URL` should be the same HTTPS origin, without an extra `/api` suffix.

Cookies keep browser sessions for up to 30 days; mobile keeps its session token in SecureStore. Each device signs in independently. They share account data through the API/database, not by copying cookies. Clearing guest storage can lose access to that guest diary; creating an account preserves it across devices.

## Verify sync

Log into the same account on both clients. Save a custom food and a food entry on the website, then open Food on the phone. Save a daily weight in Settings on one client, then check Settings on the other. Allow up to 15 seconds while active or reopen the screen. The line graph uses one display unit and leaves missing days blank. Network access is required; offline writes and instant push sync are not implemented.

References: [Expo setup](https://docs.expo.dev/get-started/set-up-your-environment/), [EAS Build](https://docs.expo.dev/build/introduction/), [internal distribution](https://docs.expo.dev/build/internal-distribution/).
