const express = require('express');
const db = require('../db');
const { authenticate, requireStaff } = require('../middleware/auth');

const router = express.Router();

// ============================
// MIDDLEWARE
// ============================
router.use(authenticate);
router.use(requireStaff);

// ============================
// GET QUEUE
// ============================
router.get('/queue', async (req, res) => {
  try {
    const lists = await db.manyOrNone(
      `SELECT pl.*,
         COUNT(pli.id) as total_items,
         COUNT(CASE WHEN pli.is_completed THEN 1 END) as completed_items
       FROM prep_lists pl
       LEFT JOIN prep_list_items pli ON pli.prep_list_id = pl.id
       WHERE pl.company_id=$1
       GROUP BY pl.id
       ORDER BY pl.created_at DESC`,
      [req.user.company_id]
    );

    res.json(lists);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// GET PREP LIST
// ============================
router.get('/prep/:id', async (req, res) => {
  try {
    const list = await db.oneOrNone(
      'SELECT * FROM prep_lists WHERE id=$1 AND company_id=$2',
      [req.params.id, req.user.company_id]
    );

    if (!list) {
      return res.status(404).json({ error: 'Prep list not found' });
    }

    const items = await db.manyOrNone(
      `SELECT * FROM prep_list_items WHERE prep_list_id=$1`,
      [req.params.id]
    );

    res.json({ ...list, items });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// UPDATE ITEM
// ============================
router.put('/prep/:listId/items/:itemId', async (req, res) => {
  try {
    const { is_completed } = req.body;

    const item = await db.oneOrNone(
      `UPDATE prep_list_items SET
         is_completed=$1,
         completed_at=CASE WHEN $1 THEN NOW() ELSE NULL END
       WHERE id=$2
       RETURNING *`,
      [is_completed, req.params.itemId]
    );

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(item);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// GET TODAY ORDERS
// ============================
router.get('/orders/today', async (req, res) => {
  try {
    const orders = await db.manyOrNone(
      `SELECT id, status, created_at
       FROM orders
       WHERE company_id=$1
       ORDER BY created_at DESC`,
      [req.user.company_id]
    );

    res.json(orders);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// LOG WASTE
// ============================
router.post('/waste', async (req, res) => {
  try {
    const { ingredient_id, quantity, unit } = req.body;

    if (!ingredient_id || !quantity || !unit) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const log = await db.one(
      `INSERT INTO waste_logs (company_id, ingredient_id, quantity, unit)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [req.user.company_id, ingredient_id, quantity, unit]
    );

    res.status(201).json(log);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// GET WASTE
// ============================
router.get('/waste', async (req, res) => {
  try {
    const logs = await db.manyOrNone(
      `SELECT * FROM waste_logs WHERE company_id=$1 ORDER BY created_at DESC`,
      [req.user.company_id]
    );

    res.json(logs);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// HACCP LOG
// ============================
router.post('/haccp', async (req, res) => {
  try {
    const { log_type, temperature } = req.body;

    if (!log_type || temperature === undefined) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const log = await db.one(
      `INSERT INTO haccp_logs (company_id, log_type, temperature)
       VALUES ($1,$2,$3)
       RETURNING *`,
      [req.user.company_id, log_type, temperature]
    );

    res.status(201).json(log);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;