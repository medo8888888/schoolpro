const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const connectionString = process.env.DATABASE_URL || (
  process.env.NODE_ENV === 'production'
    ? ''
    : 'postgres://postgres:postgres@localhost:5432/workforce'
);

if (!connectionString) {
  throw new Error('DATABASE_URL is required when NODE_ENV=production.');
}

const pool = new Pool({ connectionString });

const DEFAULT_ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'admin').trim().toLowerCase();
const DEFAULT_ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
const DEFAULT_ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'admin123'));

if (!DEFAULT_ADMIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD is required when NODE_ENV=production.');
}

async function ensureAuthSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id UUID PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      timezone VARCHAR(100) DEFAULT 'UTC',
      currency VARCHAR(10) DEFAULT 'USD',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      email VARCHAR(255) UNIQUE NOT NULL,
      username VARCHAR(120) UNIQUE,
      password_hash TEXT,
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      role VARCHAR(50) DEFAULT 'owner',
      employee_type VARCHAR(50),
      approval_status VARCHAR(50) DEFAULT 'approved',
      manager_username VARCHAR(120),
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(120)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'owner'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_type VARCHAR(50)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status VARCHAR(50) DEFAULT 'approved'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_username VARCHAR(120)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users (LOWER(username)) WHERE username IS NOT NULL`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      department VARCHAR(255),
      role VARCHAR(150),
      status VARCHAR(80) DEFAULT 'active',
      shift VARCHAR(120),
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS attendance_events (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      employee_id UUID,
      employee_name VARCHAR(255),
      type VARCHAR(80) NOT NULL,
      status VARCHAR(80) DEFAULT 'Saved',
      event_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const adminOrgResult = await pool.query(
    `SELECT id FROM organizations WHERE name = $1 LIMIT 1`,
    ['System Admin Organization']
  );

  const adminOrganizationId = adminOrgResult.rows[0]?.id || randomUUID();

  if (!adminOrgResult.rows.length) {
    await pool.query(
      `INSERT INTO organizations (id, name, timezone, currency) VALUES ($1, $2, $3, $4)`,
      [adminOrganizationId, 'System Admin Organization', 'UTC', 'USD']
    );
  }

  const adminUserResult = await pool.query(
    `SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(COALESCE(username, '')) = LOWER($2) LIMIT 1`,
    [DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_USERNAME]
  );

  if (!adminUserResult.rows.length) {
    const adminPasswordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
    await pool.query(
      `INSERT INTO users (id, organization_id, email, username, password_hash, first_name, last_name, role, approval_status, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'admin', 'approved', 'active')`,
      [randomUUID(), adminOrganizationId, DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_USERNAME, adminPasswordHash, 'System', 'Admin']
    );
  }
}

module.exports = {
  pool,
  ensureAuthSchema
};
