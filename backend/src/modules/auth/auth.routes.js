const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const { pool } = require('../../lib/db');

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'dev-secret');

if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is required when NODE_ENV=production.');
}

function createToken(user) {
    return jwt.sign({
          sub: user.id,
          role: user.role,
          organizationId: user.organizationId,
          username: user.username || null,
          email: user.email || null
    }, JWT_SECRET, { expiresIn: '8h' });
}

function toDisplayName(firstName, lastName, email) {
    const full = `${firstName || ''} ${lastName || ''}`.trim();
    return full || email;
}

function parseAuthToken(req) {
    const authHeader = String(req.headers.authorization || '');
    if (!authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) return null;
    try {
          return jwt.verify(token, JWT_SECRET);
    } catch (error) {
          return null;
    }
}

function requireAdmin(req, res) {
    const user = parseAuthToken(req);
    if (!user) {
          res.status(401).json({ message: 'Unauthorized' });
          return null;
    }
    if (String(user.role || '').toLowerCase() !== 'admin') {
          res.status(403).json({ message: 'Admin access is required' });
          return null;
    }
    return user;
}

router.post('/register', async (req, res) => {
    const { email, username, password, name, organizationName, role, employeeType } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedUsername = String(username || normalizedEmail.split('@')[0] || '').trim().toLowerCase();
    const normalizedName = String(name || '').trim();
    const normalizedOrganization = String(organizationName || '').trim();
    const normalizedRole = String(role || 'owner').trim().toLowerCase();
    const allowedRoleSet = new Set(['owner', 'manager', 'employee', 'accountant']);
    const finalRole = allowedRoleSet.has(normalizedRole) ? normalizedRole : 'owner';
    const allowedEmployeeTypes = new Set(['asbuilt', 'sales', 'supervision', 'engineer']);
    const finalEmployeeType = finalRole === 'employee' && allowedEmployeeTypes.has(String(employeeType || '').trim().toLowerCase())
      ? String(employeeType).trim().toLowerCase()
          : null;

              if (!normalizedEmail || !password) {
                    return res.status(400).json({ message: 'Email and password are required' });
              }

              if (finalRole !== 'owner' && !normalizedOrganization) {
                    return res.status(400).json({ message: 'Organization name is required to join a team' });
              }

              const [firstNameRaw, ...lastNameParts] = normalizedName.split(/\s+/).filter(Boolean);
    const firstName = firstNameRaw || null;
    const lastName = lastNameParts.length ? lastNameParts.join(' ') : null;

              const client = await pool.connect();
    try {
          await client.query('BEGIN');

      const existing = await client.query(
              'SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(COALESCE(username, \'\')) = LOWER($2) LIMIT 1',
              [normalizedEmail, normalizedUsername]
            );
          if (existing.rows.length > 0) {
                  await client.query('ROLLBACK');
                  return res.status(409).json({ message: 'User already exists' });
          }

      let organizationId;

      if (finalRole === 'owner') {
              organizationId = randomUUID();
              await client.query(
                        `INSERT INTO organizations (id, name, timezone, currency)
                                 VALUES ($1, $2, 'UTC', 'USD')`,
                        [organizationId, normalizedOrganization || `${normalizedName || normalizedEmail} Organization`]
                      );
      } else {
              const orgResult = await client.query(
                        `SELECT id FROM organizations WHERE LOWER(name) = LOWER($1) LIMIT 1`,
                        [normalizedOrganization]
                      );
              if (!orgResult.rows.length) {
                        await client.query('ROLLBACK');
                        return res.status(404).json({ message: 'Organization not found. Check the exact organization name with your owner.' });
              }
              organizationId = orgResult.rows[0].id;
      }

      const userId = randomUUID();
          const passwordHash = await bcrypt.hash(password, 10);

      await client.query(
              `INSERT INTO users (id, organization_id, email, username, password_hash, first_name, last_name, role, employee_type, approval_status)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'approved')`,
              [userId, organizationId, normalizedEmail, normalizedUsername || null, passwordHash, firstName, lastName, finalRole, finalEmployeeType]
            );

      await client.query('COMMIT');

      const user = {
              id: userId,
              organizationId,
              email: normalizedEmail,
              username: normalizedUsername || null,
              name: normalizedName || normalizedEmail,
              role: finalRole,
              employeeType: finalEmployeeType,
              approvalStatus: 'approved'
      };

      return res.status(201).json({
              message: 'Account created successfully.',
              token: createToken(user),
              user
      });
    } catch (error) {
          await client.query('ROLLBACK');
          return res.status(500).json({ message: 'Unable to register user' });
    } finally {
          client.release();
    }
});

router.post('/login', async (req, res) => {
    const { email, username, password } = req.body || {};
    const identifier = String(email || username || '').trim().toLowerCase();
    if (!identifier || !password) {
          return res.status(400).json({ message: 'Email and password are required' });
    }

              try {
                    const result = await pool.query(
                            `SELECT id, organization_id, email, username, password_hash, first_name, last_name, role, employee_type, approval_status
                                   FROM users
                                          WHERE LOWER(email) = LOWER($1) OR LOWER(COALESCE(username, '')) = LOWER($1)
                                                 LIMIT 1`,
                            [identifier]
                          );
                    const row = result.rows[0];
                    if (!row || !row.password_hash) {
                            return res.status(401).json({ message: 'Invalid credentials' });
                    }

      const valid = await bcrypt.compare(password, row.password_hash);
                    if (!valid) {
                            return res.status(401).json({ message: 'Invalid credentials' });
                    }

      const approvalStatus = String(row.approval_status || 'approved').toLowerCase();
                    const role = String(row.role || 'owner').toLowerCase();

      const user = {
              id: row.id,
              organizationId: row.organization_id,
              email: row.email,
              username: row.username || null,
              name: toDisplayName(row.first_name, row.last_name, row.email),
              role,
              employeeType: row.employee_type || null,
              approvalStatus
      };
                    return res.json({ token: createToken(user), user });
              } catch (error) {
                    return res.status(500).json({ message: 'Unable to log in' });
              }
});

router.get('/pending-users', async (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;

             try {
                   const result = await pool.query(
                           `SELECT id, email, username, first_name, last_name, approval_status, created_at
                                  FROM users
                                         WHERE organization_id = $1
                                                  AND role = 'owner'
                                                           AND approval_status = 'pending_admin'
                                                                  ORDER BY created_at ASC`,
                           [admin.organizationId]
                         );

      const users = result.rows.map((row) => ({
              id: row.id,
              email: row.email,
              username: row.username,
              name: toDisplayName(row.first_name, row.last_name, row.email),
              approvalStatus: row.approval_status,
              createdAt: row.created_at
      }));
                   return res.json(users);
             } catch (error) {
                   return res.status(500).json({ message: 'Unable to load pending users' });
             }
});

router.post('/pending-users/:userId/approve', async (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;

              try {
                    const managerUsername = String((req.body && req.body.managerUsername) || '').trim().toLowerCase();
                    if (!managerUsername) {
                            return res.status(400).json({ message: 'managerUsername is required' });
                    }

      const managerExists = await pool.query(
              `SELECT id FROM users
                     WHERE organization_id = $1
                              AND (LOWER(COALESCE(username, '')) = LOWER($2) OR LOWER(email) = LOWER($2))
                                     LIMIT 1`,
              [admin.organizationId, managerUsername]
            );
                    if (!managerExists.rows.length) {
                            return res.status(404).json({ message: 'Manager user not found in organization' });
                    }

      const result = await pool.query(
              `UPDATE users
                     SET approval_status = 'pending_manager', manager_username = $3, updated_at = CURRENT_TIMESTAMP
                            WHERE id = $1 AND organization_id = $2 AND role = 'owner' AND approval_status = 'pending_admin'
                                   RETURNING id`,
              [req.params.userId, admin.organizationId, managerUsername]
            );
                    if (!result.rows.length) {
                            return res.status(404).json({ message: 'Pending user not found' });
                    }
                    return res.json({ ok: true, message: 'Assigned to manager for approval' });
              } catch (error) {
                    return res.status(500).json({ message: 'Unable to assign manager approval' });
              }
});

router.post('/pending-users/:userId/reject', async (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;

              try {
                    const result = await pool.query(
                            `UPDATE users
                                   SET approval_status = 'rejected', updated_at = CURRENT_TIMESTAMP
                                          WHERE id = $1 AND organization_id = $2 AND role = 'owner' AND approval_status IN ('pending_admin', 'pending_manager')
                                                 RETURNING id`,
                            [req.params.userId, admin.organizationId]
                          );
                    if (!result.rows.length) {
                            return res.status(404).json({ message: 'Pending user not found' });
                    }
                    return res.json({ ok: true, message: 'User rejected' });
              } catch (error) {
                    return res.status(500).json({ message: 'Unable to reject user' });
              }
});

router.get('/manager/pending-users', async (req, res) => {
    const claims = parseAuthToken(req);
    if (!claims) return res.status(401).json({ message: 'Unauthorized' });

             const managerIdentity = String(claims.username || claims.email || '').trim().toLowerCase();
    if (!managerIdentity) return res.status(400).json({ message: 'Missing manager identity in token' });

             try {
                   const result = await pool.query(
                           `SELECT id, email, username, first_name, last_name, manager_username, approval_status, created_at
                                  FROM users
                                         WHERE organization_id = $1
                                                  AND role = 'owner'
                                                           AND approval_status = 'pending_manager'
                                                                    AND LOWER(COALESCE(manager_username, '')) = LOWER($2)
                                                                           ORDER BY created_at ASC`,
                           [claims.organizationId, managerIdentity]
                         );

      const users = result.rows.map((row) => ({
              id: row.id,
              email: row.email,
              username: row.username,
              name: toDisplayName(row.first_name, row.last_name, row.email),
              managerUsername: row.manager_username,
              approvalStatus: row.approval_status,
              createdAt: row.created_at
      }));
                   return res.json(users);
             } catch (error) {
                   return res.status(500).json({ message: 'Unable to load manager queue' });
             }
});

router.post('/manager/pending-users/:userId/approve', async (req, res) => {
    const claims = parseAuthToken(req);
    if (!claims) return res.status(401).json({ message: 'Unauthorized' });
    const managerIdentity = String(claims.username || claims.email || '').trim().toLowerCase();

              try {
                    const result = await pool.query(
                            `UPDATE users
                                   SET approval_status = 'approved', updated_at = CURRENT_TIMESTAMP
                                          WHERE id = $1
                                                   AND organization_id = $2
                                                            AND approval_status = 'pending_manager'
                                                                     AND LOWER(COALESCE(manager_username, '')) = LOWER($3)
                                                                            RETURNING id`,
                            [req.params.userId, claims.organizationId, managerIdentity]
                          );
                    if (!result.rows.length) {
                            return res.status(404).json({ message: 'User not found in your manager queue' });
                    }
                    return res.json({ ok: true, message: 'User approved by manager' });
              } catch (error) {
                    return res.status(500).json({ message: 'Unable to approve user' });
              }
});

router.post('/manager/pending-users/:userId/reject', async (req, res) => {
    const claims = parseAuthToken(req);
    if (!claims) return res.status(401).json({ message: 'Unauthorized' });
    const managerIdentity = String(claims.username || claims.email || '').trim().toLowerCase();

              try {
                    const result = await pool.query(
                            `UPDATE users
                                   SET approval_status = 'rejected', updated_at = CURRENT_TIMESTAMP
                                          WHERE id = $1
                                                   AND organization_id = $2
                                                            AND approval_status = 'pending_manager'
                                                                     AND LOWER(COALESCE(manager_username, '')) = LOWER($3)
                                                                            RETURNING id`,
                            [req.params.userId, claims.organizationId, managerIdentity]
                          );
                    if (!result.rows.length) {
                            return res.status(404).json({ message: 'User not found in your manager queue' });
