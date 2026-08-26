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
const reportsRoutes = require('./modules/reports/reports.routes');
const schedulesRoutes = require('./modules/schedules/schedules.routes');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'dev-secret');

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required when NODE_ENV=production.');
}

app.use(cors());
app.use(express.json());

const leaveRequests = [];

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
app.use('/employees', authMiddleware, peopleRoutes);
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

app.use('/attendance', authMiddleware, attendanceRoutes);
app.use('/reports', authMiddleware, reportsRoutes);
app.use('/schedules', authMiddleware, schedulesRoutes);

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
