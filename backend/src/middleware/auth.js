const jwt = require('jsonwebtoken');
const db = require('../db');

// ============================
// AUTHENTICATE
// ============================
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 🔥 FIX: use decoded.id (NOT userId)
    const user = await db.oneOrNone(
      'SELECT * FROM users WHERE id=$1',
      [decoded.id]
    );

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // ✅ Attach full user
    req.user = user;

    // 🔥 VERY IMPORTANT (multi-tenant)
    req.companyId = user.company_id;

    next();
  } catch (err) {
    console.error("AUTH ERROR:", err);
    return res.status(401).json({ error: 'Unauthorized' });
  }
};

// ============================
// ROLE SYSTEM
// ============================
const requireRole = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    next();
  };
};

const requireOwner = requireRole(['owner']);
const requireManager = requireRole(['owner', 'manager']);
const requireStaff = requireRole(['owner', 'manager', 'staff']);

module.exports = {
  authenticate,
  requireRole,
  requireOwner,
  requireManager,
  requireStaff
};