const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { logger } = require('../utils/logger');

const router = express.Router();

// ============================
// TOKEN
// ============================
function generateAdminToken(adminId) {
  return jwt.sign(
    { adminId, type: 'super_admin' },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
}

// ============================
// AUTH MIDDLEWARE
// ============================
async function requireSuperAdmin(req, res, next) {
  const auth = req.headers.authorization;

  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token' });
  }

  try {
    const payload = jwt.verify(auth.substring(7), process.env.JWT_SECRET);

    if (payload.type !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const admin = await db.one(
      'SELECT * FROM platform_admins WHERE id=$1 AND is_active=true',
      [payload.adminId]
    ).catch(() => null);

    if (!admin) {
      return res.status(401).json({ error: 'Admin not found' });
    }

    req.admin = admin;
    next();

  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ============================
// SETUP (FIRST ADMIN)
// ============================
router.post('/setup', async (req, res) => {
  const count = await db.one('SELECT COUNT(*) as cnt FROM platform_admins');

  if (parseInt(count.cnt) > 0) {
    return res.status(403).json({ error: 'Admin already exists' });
  }

  const { email, password, full_name } = req.body;

  if (!email || !password || !full_name) {
    return res.status(400).json({ error: 'All fields required' });
  }

  const hash = await bcrypt.hash(password, 12);

  const admin = await db.one(
    `INSERT INTO platform_admins (email, password_hash, full_name)
     VALUES ($1,$2,$3)
     RETURNING id, email, full_name`,
    [email, hash, full_name]
  );

  logger.info(`Admin created: ${email}`);

  res.status(201).json({
    message: 'Super admin created',
    admin
  });
});

// ============================
// LOGIN
// ============================
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const admin = await db.one(
    'SELECT * FROM platform_admins WHERE email=$1 AND is_active=true',
    [email]
  ).catch(() => null);

  if (!admin) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, admin.password_hash);

  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  await db.query(
    'UPDATE platform_admins SET last_login=NOW() WHERE id=$1',
    [admin.id]
  );

  logger.info(`Admin login: ${email}`);

  res.json({
    token: generateAdminToken(admin.id),
    admin: {
      id: admin.id,
      email: admin.email,
      full_name: admin.full_name
    }
  });
});

// ============================
// COMPANIES
// ============================
router.get('/companies', requireSuperAdmin, async (req, res) => {
  const companies = await db.manyOrNone(
    `SELECT c.*,
            COUNT(DISTINCT u.id) as user_count,
            COALESCE(SUM(o.total),0) as total_revenue
     FROM companies c
     LEFT JOIN users u ON u.company_id=c.id
     LEFT JOIN orders o ON o.company_id=c.id AND o.status!='cancelled'
     GROUP BY c.id
     ORDER BY c.created_at DESC
     LIMIT 100`
  );

  res.json(companies);
});

// ============================
// USERS
// ============================
router.get('/users', requireSuperAdmin, async (req, res) => {
  const users = await db.manyOrNone(
    `SELECT u.id, u.email, u.full_name, u.role,
            u.is_active, u.last_login, u.created_at,
            c.name as company_name, c.plan_tier
     FROM users u
     LEFT JOIN companies c ON c.id=u.company_id
     ORDER BY u.created_at DESC
     LIMIT 200`
  );

  res.json(users);
});

// ============================
// 🔥 METRICS (UPGRADED)
// ============================
router.get('/metrics', requireSuperAdmin, async (req, res) => {

  const [companies, users, revenue, expiry] = await Promise.all([

    db.one(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE subscription_status = 'active') as active,
        COUNT(*) FILTER (WHERE subscription_status = 'trialing') as trialing,
        COUNT(*) FILTER (WHERE subscription_status = 'inactive') as inactive
      FROM companies
    `),

    db.one(`SELECT COUNT(*) as total FROM users`),

    db.one(`
      SELECT 
        COALESCE(SUM(total),0) as total_usd,
        COUNT(*) as order_count
      FROM orders
      WHERE status!='cancelled'
    `),

    db.one(`
      SELECT
        COUNT(*) FILTER (
          WHERE trial_ends_at <= NOW() + INTERVAL '7 days'
          AND trial_ends_at > NOW()
        ) as expiring_soon,

        COUNT(*) FILTER (
          WHERE trial_ends_at <= NOW()
        ) as expired
      FROM companies
    `)
  ]);

  // USER ACTIVITY
  const activeUsers = await db.one(`
    SELECT COUNT(*) as active_last_7_days
    FROM users
    WHERE last_login >= NOW() - INTERVAL '7 days'
  `);

  const byPlan = await db.manyOrNone(`
    SELECT plan_tier, COUNT(*) as count 
    FROM companies 
    GROUP BY plan_tier
  `);

  res.json({
    companies: {
      total: parseInt(companies.total),
      active: parseInt(companies.active),
      trialing: parseInt(companies.trialing),
      inactive: parseInt(companies.inactive)
    },

    subscriptions: {
      expiring_soon: parseInt(expiry.expiring_soon),
      expired: parseInt(expiry.expired)
    },

    users: {
      total: parseInt(users.total),
      active_last_7_days: parseInt(activeUsers.active_last_7_days)
    },

    revenue: {
      total_usd: parseFloat(revenue.total_usd),
      order_count: parseInt(revenue.order_count)
    },

    by_plan: byPlan
  });
});

// ============================
// UPDATE PLAN
// ============================
router.put('/companies/:id/plan', requireSuperAdmin, async (req, res) => {
  const { plan_tier, subscription_status } = req.body;

  const allowedPlans = ['solo', 'restaurant'];

  if (plan_tier && !allowedPlans.includes(plan_tier)) {
    return res.status(400).json({ error: 'Invalid plan' });
  }

  const company = await db.one(
    `UPDATE companies
     SET plan_tier = COALESCE($1, plan_tier),
         subscription_status = COALESCE($2, subscription_status)
     WHERE id = $3
     RETURNING *`,
    [plan_tier, subscription_status, req.params.id]
  );

  logger.info(`Admin updated company ${company.id}`);

  res.json(company);
});

// ============================
// USER STATUS
// ============================
router.put('/users/:id/status', requireSuperAdmin, async (req, res) => {
  const { is_active } = req.body;

  const user = await db.one(
    `UPDATE users
     SET is_active=$1
     WHERE id=$2
     RETURNING id, email, full_name, is_active`,
    [is_active, req.params.id]
  );

  logger.info(`Admin updated user ${user.email}`);

  res.json(user);
});

// ============================
// SYSTEM HEALTH
// ============================
router.get('/system-health', requireSuperAdmin, async (req, res) => {

  const dbCheck = await db.one('SELECT NOW()').catch(() => null);

  res.json({
    status: dbCheck ? 'healthy' : 'down',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;