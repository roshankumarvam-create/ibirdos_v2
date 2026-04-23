const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// Apply auth middleware
router.use(authenticate);

// ============================
// HELPER: ROLE FILTER
// ============================
const filterForRole = (company, role) => {
  if (role === 'owner' || role === 'manager') {
    return company;
  }

  // staff → hide sensitive fields
  const { subscription_status, ...safe } = company;
  return safe;
};

// ============================
// GET COMPANY DATA
// ============================
router.get('/me', requireRole(['owner', 'manager']), async (req, res) => {
  try {
    const company = await db.one(
      'SELECT * FROM companies WHERE id=$1',
      [req.user.company_id]
    );

    const locations = await db.manyOrNone(
      'SELECT * FROM locations WHERE company_id=$1 ORDER BY name',
      [req.user.company_id]
    );

    const staff = await db.manyOrNone(
      `SELECT id, full_name, email, role, is_active, last_login, created_at
       FROM users
       WHERE company_id=$1
       ORDER BY role, full_name`,
      [req.user.company_id]
    );

    const invites = await db.manyOrNone(
      `SELECT *
       FROM invite_tokens
       WHERE company_id=$1
       AND is_used=false
       AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [req.user.company_id]
    );

    const safeCompany = filterForRole(company, req.user.role);

    res.json({
      ...safeCompany,
      locations,
      staff,
      pending_invites: invites
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// UPDATE COMPANY
// ============================
router.put('/me', requireRole(['owner', 'manager']), async (req, res) => {
  try {
    const {
      name,
      phone,
      address,
      default_markup_percent,
      default_tax_rate,
      currency
    } = req.body;

    const updated = await db.one(
      `UPDATE companies SET
        name=COALESCE($1,name),
        phone=COALESCE($2,phone),
        address=COALESCE($3,address),
        default_markup_percent=COALESCE($4,default_markup_percent),
        default_tax_rate=COALESCE($5,default_tax_rate),
        currency=COALESCE($6,currency),
        updated_at=NOW()
       WHERE id=$7
       RETURNING *`,
      [
        name,
        phone,
        address,
        default_markup_percent,
        default_tax_rate,
        currency,
        req.user.company_id
      ]
    );

    const safeCompany = filterForRole(updated, req.user.role);

    res.json(safeCompany);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// DELETE STAFF
// ============================
router.delete('/staff/:userId', requireRole(['owner', 'manager']), async (req, res) => {
  try {
    const user = await db.oneOrNone(
      'SELECT role FROM users WHERE id=$1 AND company_id=$2',
      [req.params.userId, req.user.company_id]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === 'owner') {
      return res.status(403).json({ error: 'Cannot remove owner' });
    }

    await db.query(
      'UPDATE users SET is_active=false WHERE id=$1',
      [req.params.userId]
    );

    res.json({ message: 'User deactivated' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;