const express = require('express');
const router = express.Router();

const groups = [
  { id: 'group-1', name: 'Sales Team', members: 2 },
  { id: 'group-2', name: 'Security Team', members: 1 }
];

router.get('/', (req, res) => res.json(groups));

router.post('/', (req, res) => {
  const group = { id: `group-${Date.now()}`, ...req.body };
  groups.push(group);
  res.status(201).json(group);
});

module.exports = router;
