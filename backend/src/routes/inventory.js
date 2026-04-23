const express = require('express');
const db = require('../db');
const { authenticate, requireOwner, requireManager } = require('../middleware/auth');
const router = express.Router();
router.use(authenticate);

// GET /api/inventory
router.get('/', requireManager, async (req, res) => {
  const { location_id } = req.query;
  const locId = location_id || req.user.location_id;

  const items = await db.many(
    `SELECT inv.*, i.name, i.unit, i.category, i.current_price, i.supplier,
       CASE WHEN inv.quantity_on_hand <= inv.reorder_threshold THEN true ELSE false END as is_low_stock
     FROM inventory inv JOIN ingredients i ON i.id=inv.ingredient_id
     WHERE inv.company_id=$1 ${locId ? 'AND inv.location_id=$2' : ''}
     ORDER BY is_low_stock DESC, i.name`,
    locId ? [req.companyId, locId] : [req.companyId]
  );
  res.json(items);
});

// PUT /api/inventory/:ingredientId — Manual stock update
router.put('/:ingredientId', requireManager, async (req, res) => {
  const { quantity_on_hand, reorder_threshold, location_id } = req.body;
  const locId = location_id || req.user.location_id;
  if (!locId) return res.status(400).json({ error: 'location_id required' });

  const inv = await db.one(
    `INSERT INTO inventory (company_id, location_id, ingredient_id, quantity_on_hand, reorder_threshold)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (location_id, ingredient_id)
     DO UPDATE SET
       quantity_on_hand=COALESCE($4, inventory.quantity_on_hand),
       reorder_threshold=COALESCE($5, inventory.reorder_threshold),
       last_updated=NOW()
     RETURNING *`,
    [req.companyId, locId, req.params.ingredientId, quantity_on_hand ?? null, reorder_threshold ?? null]
  );
  res.json(inv);
});

// GET /api/inventory/low-stock
router.get('/low-stock', requireManager, async (req, res) => {
  const items = await db.many(
    `SELECT inv.*, i.name, i.unit, i.category, i.supplier, i.current_price,
       (inv.reorder_threshold - inv.quantity_on_hand) as shortage,
       (inv.reorder_threshold - inv.quantity_on_hand) * i.current_price as estimated_purchase_cost
     FROM inventory inv JOIN ingredients i ON i.id=inv.ingredient_id
     WHERE inv.company_id=$1 AND inv.quantity_on_hand <= inv.reorder_threshold AND inv.reorder_threshold > 0
     ORDER BY shortage DESC`,
    [req.companyId]
  );
  res.json(items);
});

module.exports = router;
