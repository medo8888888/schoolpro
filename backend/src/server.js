const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { ensureAuthSchema } = require('./lib/db');
const { pool } = require('./lib/db');
const authRoutes = require('./modules/auth/auth.routes');
const attendanceRoutes = require('./modules/attendance/attendance.routes');
const peopleRoutes = require('./modules/people/people.routes');
const groupsRoutes = require('./modules/groups/groups.routes');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'dev-secret');

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required when NODE_ENV=production.');
}

app.use(cors());
app.use(express.json());

const leaveRequests = [];
const schedules = [];

function requireOrganizationId(req, res) {
  const organizationId = req.user && req.user.organizationId;
  if (!organizationId) {
    res.status(400).json({ message: 'Missing organization context in token' });
    return null;
  }
  return organizationId;
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const token = authHeader.split('Bearer ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

app.get('/health', (req, res) => res.json({ ok: true, system: 'jibble-style-backend' }));

app.use('/auth', authRoutes);
app.use('/people', authMiddleware, peopleRoutes);
app.use('/groups', authMiddleware, groupsRoutes);

app.get('/organizations', authMiddleware, async (req, res) => {
  const organizationId = requireOrganizationId(req, res);
  if (!organizationId) return;
  try {
    const result = await pool.query(
      `SELECT id, name, timezone, currency FROM organizations WHERE id = $1 LIMIT 1`,
      [organizationId]
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to fetch organizations' });
  }
});

app.get('/employees', authMiddleware, async (req, res) => {
  const organizationId = requireOrganizationId(req, res);
  if (!organizationId) return;
  try {
    const result = await pool.query(
      `SELECT id, name, email, department, role, status, shift, lat, lng
       FROM employees
       WHERE organization_id = $1
       ORDER BY created_at DESC`,
      [organizationId]
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to fetch employees' });
  }
});

app.post('/employees', authMiddleware, async (req, res) => {
  const organizationId = requireOrganizationId(req, res);
  if (!organizationId) return;

  const payload = req.body || {};
  const name = String(payload.name || '').trim();
  if (!name) {
    return res.status(400).json({ message: 'Employee name is required' });
  }

  const employee = {
    id: randomUUID(),
    organizationId,
    name,
    email: payload.email ? String(payload.email).trim().toLowerCase() : null,
    department: payload.department || null,
    role: payload.role || null,
    status: payload.status || 'active',
    shift: payload.shift || null,
    lat: Number.isFinite(Number(payload.lat)) ? Number(payload.lat) : null,
    lng: Number.isFinite(Number(payload.lng)) ? Number(payload.lng) : null
  };

  try {
    await pool.query(
      `INSERT INTO employees (id, organization_id, name, email, department, role, status, shift, lat, lng)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        employee.id,
        employee.organizationId,
        employee.name,
        employee.email,
        employee.department,
        employee.role,
        employee.status,
        employee.shift,
        employee.lat,
        employee.lng
      ]
    );
    return res.status(201).json({
      id: employee.id,
      name: employee.name,
      email: employee.email,
      department: employee.department,
      role: employee.role,
      status: employee.status,
      shift: employee.shift,
      lat: employee.lat,
      lng: employee.lng
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to create employee' });
  }
});

app.get('/attendance', authMiddleware, async (req, res) => {
  const organizationId = requireOrganizationId(req, res);
  if (!organizationId) return;
  try {
    const result = await pool.query(
      `SELECT id, employee_id, employee_name, type, status, event_time
       FROM attendance_events
       WHERE organization_id = $1
       ORDER BY event_time DESC`,
      [organizationId]
    );

    const rows = result.rows.map((item) => ({
      id: item.id,
      employeeId: item.employee_id,
      employeeName: item.employee_name || 'Current Employee',
      type: item.type,
      time: new Date(item.event_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: item.status || 'Saved'
    }));
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to fetch attendance' });
  }
});

app.use('/attendance', authMiddleware, attendanceRoutes);

app.get('/leave/requests', authMiddleware, (req, res) => res.json(leaveRequests));
app.post('/leave/requests', authMiddleware, (req, res) => {
  const request = {
    id: `leave-${Date.now()}`,
    employeeId: req.user.sub,
    ...req.body,
    status: 'pending'
  };
  leaveRequests.push(request);
  res.status(201).json(request);
});

app.get('/schedules', authMiddleware, (req, res) => res.json(schedules));
app.post('/schedules', authMiddleware, (req, res) => {
  const schedule = { id: `sched-${Date.now()}`, ...req.body };
  schedules.push(schedule);
  res.status(201).json(schedule);
});

app.get('/reports/attendance', authMiddleware, async (req, res) => {
  const organizationId = requireOrganizationId(req, res);
  if (!organizationId) return;
  try {
    const result = await pool.query(
      `SELECT id, employee_name, type, status, event_time
       FROM attendance_events
       WHERE organization_id = $1
       ORDER BY event_time DESC`,
      [organizationId]
    );
    const rows = result.rows.map((item) => ({
      id: item.id,
      employeeName: item.employee_name || 'Unknown',
      type: item.type || 'Activity',
      time: new Date(item.event_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: item.status || 'Saved'
    }));
    return res.json({ total: rows.length, verified: rows.filter((item) => item.status === 'Verified').length, rows });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to build attendance report' });
  }
});

function startServer(port, attempts = 0) {
  const server = app.listen(port, () => {
    console.log(`Workforce backend running on http://localhost:${port}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      if (attempts >= 10) {
        console.error(`Unable to start backend after trying ports ${PORT}-${PORT + attempts}.`);
        process.exit(1);
      }
      const nextPort = Number(port) + 1;
      console.warn(`Port ${port} is busy, trying ${nextPort}`);
      server.close(() => startServer(nextPort, attempts + 1));
    } else {
      throw error;
    }
  });
}

ensureAuthSchema()
  .then(() => startServer(PORT))
  .catch((error) => {
    console.error('Database initialization failed:', error.message);
    process.exit(1);
  });
