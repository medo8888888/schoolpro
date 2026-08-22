const express = require('express');
const router = express.Router();
const { randomUUID } = require('crypto');
const { pool } = require('../../lib/db');

function organizationIdFromReq(req) {
  return req.user && req.user.organizationId ? req.user.organizationId : null;
}

router.get('/', async (req, res) => {
  const organizationId = organizationIdFromReq(req);
  if (!organizationId) return res.status(400).json({ message: 'Missing organization context in token' });
  try {
    const result = await pool.query(
      `SELECT id, employee_id, employee_name, type, status, event_time
       FROM attendance_events
       WHERE organization_id = $1
       ORDER BY event_time DESC`,
      [organizationId]
    );
    const rows = result.rows.map((entry) => ({
      id: entry.id,
      employeeId: entry.employee_id,
      employeeName: entry.employee_name || 'Unknown',
      type: entry.type,
      status: entry.status,
      clockIn: entry.type === 'Clock in' ? entry.event_time : undefined,
      clockOut: entry.type === 'Clock out' ? entry.event_time : undefined
    }));
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to fetch attendance entries' });
  }
});

router.post('/clock-in', async (req, res) => {
  const organizationId = organizationIdFromReq(req);
  if (!organizationId) return res.status(400).json({ message: 'Missing organization context in token' });
  const entry = {
    id: randomUUID(),
    organizationId,
    employeeId: req.user?.sub || null,
    employeeName: 'Current Employee',
    type: 'Clock in',
    status: 'checked-in'
  };
  try {
    await pool.query(
      `INSERT INTO attendance_events (id, organization_id, employee_id, employee_name, type, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [entry.id, entry.organizationId, entry.employeeId, entry.employeeName, entry.type, 'Verified']
    );
    return res.status(201).json({ ...entry, clockIn: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to save clock-in' });
  }
});

router.post('/clock-out', async (req, res) => {
  const organizationId = organizationIdFromReq(req);
  if (!organizationId) return res.status(400).json({ message: 'Missing organization context in token' });
  const entry = {
    id: randomUUID(),
    organizationId,
    employeeId: req.user?.sub || null,
    employeeName: 'Current Employee',
    type: 'Clock out',
    status: 'checked-out',
    totalHours: 8
  };
  try {
    await pool.query(
      `INSERT INTO attendance_events (id, organization_id, employee_id, employee_name, type, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [entry.id, entry.organizationId, entry.employeeId, entry.employeeName, entry.type, 'Saved']
    );
    return res.json({ ...entry, clockOut: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to save clock-out' });
  }
});

module.exports = router;
