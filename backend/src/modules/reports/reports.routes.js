const express = require('express');
const router = express.Router();
const { pool } = require('../../lib/db');

function organizationIdFromReq(req) {
  return req.user && req.user.organizationId ? req.user.organizationId : null;
}

router.get('/attendance', async (req, res) => {
  const organizationId = organizationIdFromReq(req);
  if (!organizationId) return res.status(400).json({ message: 'Missing organization context in token' });
  try {
    const result = await pool.query(
      `SELECT employee_name, type, status, event_time
       FROM attendance_events
       WHERE organization_id = $1
       ORDER BY event_time DESC`,
      [organizationId]
    );
    const rows = result.rows.map((entry) => ({
      employeeName: entry.employee_name || 'Unknown',
      type: entry.type,
      time: entry.event_time,
      status: entry.status
    }));
    return res.json({ rows });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to generate attendance report' });
  }
});

module.exports = router;
