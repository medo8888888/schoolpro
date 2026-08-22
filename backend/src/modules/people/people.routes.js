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
      `SELECT id, name, role, department AS "group", status, email, shift, lat, lng
       FROM employees
       WHERE organization_id = $1
       ORDER BY created_at DESC`,
      [organizationId]
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to fetch people' });
  }
});

router.post('/', async (req, res) => {
  const organizationId = organizationIdFromReq(req);
  if (!organizationId) return res.status(400).json({ message: 'Missing organization context in token' });

  const payload = req.body || {};
  const name = String(payload.name || '').trim();
  if (!name) return res.status(400).json({ message: 'Employee name is required' });

  const employee = {
    id: randomUUID(),
    organizationId,
    name,
    email: payload.email ? String(payload.email).trim().toLowerCase() : null,
    department: payload.group || payload.department || null,
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
      role: employee.role,
      group: employee.department,
      status: employee.status,
      email: employee.email,
      shift: employee.shift,
      lat: employee.lat,
      lng: employee.lng
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to create person' });
  }
});

module.exports = router;
