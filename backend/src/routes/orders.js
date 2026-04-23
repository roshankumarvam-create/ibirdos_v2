const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

// ✅ define missing things here
const requireStaff = requireRole(['owner', 'manager', 'staff']);
const CAN_SEE_FINANCIALS = new Set(['owner', 'manager']);

// ============================================================
// GET ORDERS
// ============================================================
router.get('/', async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;

    let query = `SELECT * FROM orders WHERE company_id=$1`;
    const params = [req.user.company_id];

    if (status) {
      params.push(status);
      query += ` AND status=$${params.length}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const orders = await db.manyOrNone(query, params);

    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET ORDER BY ID
// ============================================================
router.get('/:id', async (req, res) => {
  try {
    const order = await db.oneOrNone(
      'SELECT * FROM orders WHERE id=$1 AND company_id=$2',
      [req.params.id, req.user.company_id]
    );

    if (!order) return res.status(404).json({ error: 'Order not found' });

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// CREATE ORDER
// ============================================================
router.post('/', async (req, res) => {
  try {
    const { total = 0 } = req.body;

    const order = await db.one(
      `INSERT INTO orders (company_id, total, status)
       VALUES ($1,$2,'pending') RETURNING *`,
      [req.user.company_id, total]
    );

    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// UPDATE STATUS
// ============================================================
router.put('/:id/status', requireStaff, async (req, res) => {
  try {
    const { status } = req.body;

    const order = await db.oneOrNone(
      'UPDATE orders SET status=$1 WHERE id=$2 AND company_id=$3 RETURNING *',
      [status, req.params.id, req.user.company_id]
    );

    if (!order) return res.status(404).json({ error: 'Order not found' });

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;