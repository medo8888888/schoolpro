# Workforce Backend

This backend provides a lightweight working API for the workforce platform.

## Run

```bash
cd backend
npm install
set DATABASE_URL=postgres://postgres:postgres@localhost:5432/workforce
npm start
```

Notes:
- `DATABASE_URL` is required for persistent auth (owner signup/login stored in PostgreSQL).
- On first start, the backend auto-creates minimal `organizations` and `users` tables if they do not exist.

## Endpoints

- GET /health
- POST /auth/register
- POST /auth/login
- GET /organizations
- GET /employees
- POST /employees
- GET /attendance
- POST /attendance/clock-in
- POST /attendance/clock-out
- GET /leave/requests
- POST /leave/requests
- GET /schedules
- POST /schedules
- GET /reports/attendance
