const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

let sendInviteEmail = async () => {};
let sendWelcomeEmail = async () => {};

try {
  const emailService = require('../services/email');
  sendInviteEmail = emailService.sendInviteEmail || sendInviteEmail;
  sendWelcomeEmail = emailService.sendWelcomeEmail || sendWelcomeEmail;
} catch (e) {
  console.warn('Email service not configured');
}

const router = express.Router();

// ================= VALIDATION =================
const RegisterSchema = z.object({
  full_name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  company_name: z.string().optional(),
  plan_tier: z.enum(['solo','restaurant']).optional(),
  plan: z.enum(['solo','restaurant']).optional()
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['manager','staff','customer'])
});

// ================= HELPERS =================

// 🔥 FIXED TOKEN
const generateToken = (user) =>
  jwt.sign(
    {
      id: user.id,
      email: user.email,
      company_id: user.company_id,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

const slugify = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).substring(2, 6);

// ================= REGISTER =================
router.post('/register', async (req, res) => {
  try {

    const debug = await db.query(`
      SELECT current_database(), inet_server_addr(), inet_server_port()
    `);
    console.log("🔥 DB DEBUG:", debug.rows);

    const data = RegisterSchema.parse(req.body);
    const hash = await bcrypt.hash(data.password, 10);

    const existing = await db.query(
      'SELECT id FROM users WHERE email=$1',
      [data.email]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email exists' });
    }

    const finalPlan = data.plan_tier || data.plan || 'restaurant';

    const companyRes = await db.query(
      `INSERT INTO companies (name, slug, plan_tier, subscription_status)
       VALUES ($1,$2,$3,'trialing') RETURNING *`,
      [
        data.company_name || `${data.full_name}'s Kitchen`,
        slugify(data.company_name || data.full_name),
        finalPlan
      ]
    );

    const company = companyRes.rows[0];

    const role = 'owner';

    const userRes = await db.query(
      `INSERT INTO users (company_id,email,password_hash,full_name,role)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [company.id, data.email, hash, data.full_name, role]
    );

    const user = userRes.rows[0];

    // 🔥 FIX: NON-BLOCKING EMAIL (NO TIMEOUT)
    sendWelcomeEmail(user.email, user.full_name, company.name).catch(console.error);

    // 🔥 FIX: FULL TOKEN
    res.json({
      token: generateToken(user),
      user
    });

  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= LOGIN =================
router.post('/login', async (req, res) => {
  try {
    const data = LoginSchema.parse(req.body);

    const result = await db.query(
      `SELECT u.*, c.name as company_name, c.slug as company_slug
       FROM users u
       LEFT JOIN companies c ON c.id=u.company_id
       WHERE u.email=$1`,
      [data.email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid login' });
    }

    const user = result.rows[0];

    const valid = await bcrypt.compare(data.password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid login' });

    // 🔥 FIX: FULL TOKEN
    res.json({
      token: generateToken(user),
      user
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= ME =================
router.get('/me', authenticate, async (req, res) => {
  res.json(req.user);
});

// ================= INVITE =================
router.post('/invite', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'owner' && req.user.role !== 'manager') {
      return res.status(403).json({ error: 'No permission' });
    }

    const data = InviteSchema.parse(req.body);

    const companyRes = await db.query(
      'SELECT name FROM companies WHERE id=$1',
      [req.user.company_id]
    );

    const companyName = companyRes.rows[0]?.name || 'iBirdOS';

    const inviteRes = await db.query(
      `INSERT INTO invite_tokens (company_id, invited_by, email, role)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.company_id, req.user.id, data.email, data.role]
    );

    const invite = inviteRes.rows[0];

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const link = `${baseUrl}/auth/accept-invite?token=${invite.token}`;

    await sendInviteEmail(
      data.email,
      req.user.full_name || 'Owner',
      companyName,
      data.role,
      link
    );

    res.json({ link });

  } catch (err) {
    console.error("INVITE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= ACCEPT INVITE =================
router.post('/accept-invite', async (req, res) => {
  try {
    const { token, full_name, password } = req.body;

    if (!token || !full_name || !password) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const inviteRes = await db.query(
      `SELECT * FROM invite_tokens 
       WHERE token=$1 
       AND is_used=false 
       AND expires_at > NOW()`,
      [token]
    );

    if (inviteRes.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired invite link' });
    }

    const invite = inviteRes.rows[0];

    const existing = await db.query(
      'SELECT * FROM users WHERE email=$1',
      [invite.email]
    );

    let user;

    if (existing.rows.length > 0) {
      user = existing.rows[0];

      await db.query(
        `UPDATE users 
         SET company_id=$1, role=$2 
         WHERE id=$3`,
        [invite.company_id, invite.role, user.id]
      );

    } else {
      const hash = await bcrypt.hash(password, 10);

      const userRes = await db.query(
        `INSERT INTO users (company_id,email,password_hash,full_name,role)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [invite.company_id, invite.email, hash, full_name, invite.role]
      );

      user = userRes.rows[0];
    }

    await db.query(
      'UPDATE invite_tokens SET is_used=true WHERE token=$1',
      [token]
    );

    res.json({
      token: generateToken(user),
      user
    });

  } catch (err) {
    console.error("ACCEPT INVITE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;