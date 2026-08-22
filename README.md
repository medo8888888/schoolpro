# Alkashaf Workforce

The project has one real backend: `backend/src/server.js`. The root `server.js` only serves the static web application on port `3000`; it does not provide application data or authentication.

## Local development

1. Start PostgreSQL.
2. Run `npm install` and `npm install --prefix backend`.
3. Start the API with `npm run backend`.
4. Start the web server with `npm start`.
5. Open `http://localhost:3000/auth.html`.

The backend uses the local PostgreSQL URL from `.env.example` by default in development. Production requires explicit `DATABASE_URL`, `JWT_SECRET`, and `ADMIN_PASSWORD` values.

## Mobile API host

The browser uses `http://localhost:4000`. The Android emulator uses `http://10.0.2.2:4000`, and the iOS simulator uses `http://localhost:4000`. A physical device must use a reachable LAN or HTTPS API URL by setting `window.FIELDTRACK_API_BASE` in the packaged web configuration before running `npx cap sync`.

The `www/` directory is the Capacitor web bundle. After changing root web files, copy the changed files into `www/` or run the project's chosen build/sync process before creating a mobile build.
