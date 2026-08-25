const express = require('express');
const router = express.Router();
const { randomUUID } = require('crypto');
const { pool } = require('../../lib/db');

const DEFAULT_WEEK = [
  { day: 'Saturday', shift: '7:30 AM - 5:00 PM' },
  { day: 'Sunday', shift: '7:30 AM - 5:00 PM' },
  { day: 'Monday', shift: '7:30 AM - 5:00 PM' },
  { day: 'Tuesday', shift: '7:30 AM - 5:00 PM' },
  { day: 'Wednesday', shift: '7:30 AM - 5:00 PM' },
  { day: 'Thursday', shift: '7:30 AM - 1:00 PM' },
  { day: 'Friday', shift: 'Off' }
];

function organizationIdFromReq(req) {
  return req.user && req.user.organizationId ? req.user.organizationId : null;
}

async function ensureDefaultSchedule(organizationId) {
  const existing = await pool.query(
    `SELECT COUNT(*) FROM schedules WHERE organization_id = $1`,
    [organizationId]
  );
  if (Number(existing.rows[0].count) > 0) return;

  for (let i = 0; i < DEFAULT_WEEK.length; i += 1) {
    const { day, shift } = DEFAULT_WEEK[i];
    await pool.query(
      `INSERT INTO schedules (id, organization_id, day, shift, sort_order) VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), organizationId, day, shift, i]
    );
  }
}

router.get('/', async (req, res) => {
  const organizationId = organizationIdFromReq(req);
  if (!organizationId) return res.status(400).json({ message: 'Missing organization context in token' });
  try {
    await ensureDefaultSchedule(organizationId);
    const result = await pool.query(
      `SELECT id, day, shift FROM schedules WHERE organization_id = $1 ORDER BY sort_order ASC`,
      [organizationId]
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to fetch schedule' });
  }
});

router.put('/:id', async (req, res) => {
  const organizationId = organizationIdFromReq(req);
  if (!organizationId) return res.status(400).json({ message: 'Missing organization context in token' });
  const shift = String((req.body && req.body.shift) || '').trim();
  if (!shift) return res.status(400).json({ message: 'Shift value is required' });
  try {
    const result = await pool.query(
      `UPDATE schedules SET shift = $1 WHERE id = $2 AND organization_id = $3 RETURNING id, day, shift`,
      [shift, req.params.id, organizationId]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Schedule entry not found' });
    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to update schedule' });
  }
});

module.exports = router;
