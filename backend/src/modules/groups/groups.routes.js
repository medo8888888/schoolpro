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
      `SELECT g.id, g.name,
        (SELECT COUNT(*) FROM employees e WHERE e.department = g.name AND e.organization_id = g.organization_id) AS members
       FROM groups g
       WHERE g.organization_id = $1
       ORDER BY g.created_at DESC`,
      [organizationId]
    );
    const rows = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      members: Number(row.members) || 0
    }));
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to fetch groups' });
  }
});

router.post('/', async (req, res) => {
  const organizationId = organizationIdFromReq(req);
  if (!organizationId) return res.status(400).json({ message: 'Missing organization context in token' });

  const name = String((req.body && req.body.name) || '').trim();
  if (!name) return res.status(400).json({ message: 'Group name is required' });

  const id = randomUUID();
  try {
    await pool.query(
      `INSERT INTO groups (id, organization_id, name) VALUES ($1, $2, $3)`,
      [id, organizationId, name]
    );
    return res.status(201).json({ id, name, members: 0 });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to create group' });
  }
});

module.exports = router;
