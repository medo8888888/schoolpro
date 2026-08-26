const express = require('express');
const router = express.Router();
const { randomUUID } = require('crypto');
const { pool } = require('../../lib/db');

function organizationIdFromReq(req) {
  return req.user && req.user.organizationId ? req.user.organizationId : null;
}

async function resolveEmployeeName(req) {
  const userId = req.user && req.user.sub;
  if (!userId) return req.user?.username || req.user?.email || 'Unknown';
  try {
    const result = await pool.query(
      `SELECT first_name, last_name, username, email FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    if (!result.rows.length) return req.user?.username || req.user?.email || 'Unknown';
    const row = result.rows[0];
    const fullName = `${row.first_name || ''} ${row.last_name || ''}`.trim();
    return fullName || row.username || row.email || 'Unknown';
  } catch (error) {
    return req.user?.username || req.user?.email || 'Unknown';
  }
}

function extractLocation(body) {
  const location = body && body.location;
  if (!location) return { lat: null, lng: null };
  const lat = Number(location.lat);
  const lng = Number(location.lng);
  return {
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null
  };
}

router.get('/', async (req, res) => {
  const organizationId = organizationIdFromReq(req);
  if (!organizationId) return res.status(400).json({ message: 'Missing organization context in token' });
  try {
    const result = await pool.query(
      `SELECT id, employee_id, employee_name, type, status, lat, lng, event_time
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
      lat: entry.lat,
      lng: entry.lng,
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
  const employeeName = await resolveEmployeeName(req);
  const { lat, lng } = extractLocation(req.body);
  const entry = {
    id: randomUUID(),
    organizationId,
    employeeId: req.user?.sub || null,
    employeeName,
    type: 'Clock in',
    status: lat !== null ? 'Verified' : 'Verified (no GPS)'
  };
  try {
    await pool.query(
      `INSERT INTO attendance_events (id, organization_id, employee_id, employee_name, type, status, lat, lng)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [entry.id, entry.organizationId, entry.employeeId, entry.employeeName, entry.type, entry.status, lat, lng]
    );
    return res.status(201).json({ ...entry, lat, lng, clockIn: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to save clock-in' });
  }
});

router.post('/clock-out', async (req, res) => {
  const organizationId = organizationIdFromReq(req);
  if (!organizationId) return res.status(400).json({ message: 'Missing organization context in token' });
  const employeeName = await resolveEmployeeName(req);
  const { lat, lng } = extractLocation(req.body);
  const entry = {
    id: randomUUID(),
    organizationId,
    employeeId: req.user?.sub || null,
    employeeName,
    type: 'Clock out',
    status: 'Saved'
  };
  try {
    await pool.query(
      `INSERT INTO attendance_events (id, organization_id, employee_id, employee_name, type, status, lat, lng)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [entry.id, entry.organizationId, entry.employeeId, entry.employeeName, entry.type, entry.status, lat, lng]
    );
    return res.json({ ...entry, lat, lng, clockOut: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to save clock-out' });
  }
});

module.exports = router;
