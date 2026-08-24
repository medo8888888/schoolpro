# Alkashaf Workforce — Deployment Guide

This app is ready to deploy. It's a Node.js/Express backend with a PostgreSQL
database, plus an Android app that connects to it. The backend automatically
creates its own database tables on first startup — no manual DB setup needed.

## Fastest path: Docker (recommended)

Requirements: Docker + Docker Compose installed on the server.

1. Copy this whole repository to the server.
2. Open `docker-compose.yml` in the root of the project and change these
   placeholder values to real secrets:
   - `POSTGRES_PASSWORD` (appears twice — must match in both places)
   - `JWT_SECRET` — any long random string
   - `ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` — the first admin
     login for the app
3. From the project root, run:
   ```
   docker compose up -d --build
   ```
4. The backend will be reachable on port `4000` of the server
   (e.g. `http://your-server-ip:4000` or `https://yourdomain.com` once a
   domain/reverse proxy is pointed at it).

That's it — the database and backend both start automatically, and the
database schema builds itself on first run.

## Manual path (without Docker)

Requirements: Node.js 22+, PostgreSQL 14+.

1. Create an empty PostgreSQL database.
2. Copy `backend/.env.example` to `backend/.env` and fill in real values
   (`DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_USERNAME`,
   `ADMIN_PASSWORD`).
3. From the `backend` folder, run:
   ```
   npm install
   npm start
   ```
4. The server listens on the `PORT` set in `.env` (default `4000`).

## Domain / HTTPS

Once the backend is running and reachable at a public domain (ideally with
HTTPS via a reverse proxy like Nginx or Caddy, or a load balancer), send
that final URL back — the Android app needs one small config change
(`www/auth.js`) to point at it, after which the app is rebuilt and ready
for real users.

## What this app needs, in short

- A place to run a Node.js process (Docker container, VM, or app service)
- A PostgreSQL database (the app creates its own tables automatically)
- Five environment variables: `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL`,
  `ADMIN_USERNAME`, `ADMIN_PASSWORD`
- Port 4000 open internally, mapped to your public domain/HTTPS setup
  however your infrastructure normally handles that
