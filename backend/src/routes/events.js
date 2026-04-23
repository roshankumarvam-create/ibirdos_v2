const express = require('express');
const db = require('../db');
const { authenticate, requireOwner, requireManager } = require('../middleware/auth');
const router = express.Router();
router.use(authenticate);

// GET /api/events
router.get('/', requireManager, async (req, res) => {
  const { status } = req.query;
  let q = `SELECT e.*, u.full_name as created_by_name, COUNT(er.id) as recipe_count
           FROM events e LEFT JOIN users u ON u.id=e.created_by
           LEFT JOIN event_recipes er ON er.event_id=e.id
           WHERE e.company_id=$1`;
  const params = [req.companyId];
  if (status) { params.push(status); q += ` AND e.status=$${params.length}`; }
  q += ' GROUP BY e.id, u.full_name ORDER BY e.event_date DESC';
  const events = await db.many(q, params);
  res.json(events);
});

// GET /api/events/:id
router.get('/:id', requireManager, async (req, res) => {
  const event = await db.one('SELECT * FROM events WHERE id=$1 AND company_id=$2', [req.params.id, req.companyId]);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const recipes = await db.many(
    `SELECT er.*, r.name as recipe_name, r.base_cost, r.selling_price, r.food_cost_percent, r.fc_status
     FROM event_recipes er JOIN recipes r ON r.id=er.recipe_id WHERE er.event_id=$1`,
    [req.params.id]
  );

  const prepLists = await db.many(
    'SELECT * FROM prep_lists WHERE event_id=$1', [req.params.id]
  );

  res.json({ ...event, recipes, prep_lists: prepLists });
});

// POST /api/events
router.post('/', requireOwner, async (req, res) => {
  const { name, event_type, event_date, end_date, guest_count, venue, client_name, client_phone, recipes, notes } = req.body;
  if (!name || !event_date) return res.status(400).json({ error: 'name and event_date required' });

  const result = await db.transaction(async (client) => {
    const event = await client.query(
      `INSERT INTO events (company_id, name, event_type, event_date, end_date, guest_count, venue, client_name, client_phone, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.companyId, name, event_type||'catering', event_date, end_date||null,
       guest_count||0, venue||null, client_name||null, client_phone||null, notes||null, req.user.id]
    );
    const eventId = event.rows[0].id;

    if (recipes?.length) {
      let totalCost = 0, totalRevenue = 0;
      for (const er of recipes) {
        const recipe = await client.query(
          'SELECT base_cost, selling_price FROM recipes WHERE id=$1 AND company_id=$2',
          [er.recipe_id, req.companyId]
        );
        if (recipe.rows.length === 0) continue;
        const servings = er.servings || (guest_count || 1);
        const costForEvent = recipe.rows[0].base_cost * servings;
        const revenueForEvent = (er.selling_price_override || recipe.rows[0].selling_price) * servings;
        totalCost += costForEvent;
        totalRevenue += revenueForEvent;

        await client.query(
          `INSERT INTO event_recipes (event_id, recipe_id, servings, selling_price_override, food_cost_at_event)
           VALUES ($1,$2,$3,$4,$5)`,
          [eventId, er.recipe_id, servings, er.selling_price_override||null, costForEvent]
        );
      }

      const fcPct = totalRevenue > 0 ? (totalCost / totalRevenue * 100) : 0;
      await client.query(
        `UPDATE events SET total_food_cost=$1, total_revenue=$2, gross_profit=$3, food_cost_percent=$4, profit_percent=$5 WHERE id=$6`,
        [totalCost, totalRevenue, totalRevenue - totalCost, fcPct, totalRevenue > 0 ? ((totalRevenue-totalCost)/totalRevenue*100) : 0, eventId]
      );

      // Auto-generate prep list for confirmed events
      if (guest_count > 0) {
        await client.query(
          `INSERT INTO prep_lists (company_id, event_id, title, due_by)
           VALUES ($1,$2,$3,$4)`,
          [req.companyId, eventId, `Prep — ${name}`, event_date]
        );
      }
    }

    return event.rows[0];
  });

  res.status(201).json(result);
});

// PUT /api/events/:id/status
router.put('/:id/status', requireOwner, async (req, res) => {
  const { status } = req.body;
  const valid = ['draft','confirmed','in_progress','completed','cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const event = await db.one(
    'UPDATE events SET status=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3 RETURNING *',
    [status, req.params.id, req.companyId]
  );
  res.json(event);
});

// GET /api/events/:id/prep — Generate/get prep list
router.get('/:id/prep', requireManager, async (req, res) => {
  const event = await db.one('SELECT * FROM events WHERE id=$1 AND company_id=$2', [req.params.id, req.companyId]);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  // Aggregate all ingredients across all event recipes scaled by guest count
  const ingredients = await db.many(
    `SELECT
       ri.ingredient_id, i.name as ingredient_name, i.unit, i.current_price,
       SUM(ri.quantity * er.servings) as required_quantity,
       r.name as recipe_name
     FROM event_recipes er
     JOIN recipe_ingredients ri ON ri.recipe_id=er.recipe_id
     JOIN ingredients i ON i.id=ri.ingredient_id
     JOIN recipes r ON r.id=er.recipe_id
     WHERE er.event_id=$1
     GROUP BY ri.ingredient_id, i.name, i.unit, i.current_price, r.name`,
    [req.params.id]
  );

  // Check stock for each
  const prepItems = await Promise.all(ingredients.map(async (item) => {
    const stock = req.user.location_id ? await db.one(
      'SELECT quantity_on_hand FROM inventory WHERE ingredient_id=$1 AND location_id=$2',
      [item.ingredient_id, req.user.location_id]
    ) : null;
    const inStock = stock?.quantity_on_hand || 0;
    const toPurchase = Math.max(0, item.required_quantity - inStock);
    return {
      ...item,
      in_stock: inStock,
      to_purchase: toPurchase,
      estimated_cost: toPurchase * item.current_price,
      status: inStock >= item.required_quantity ? 'sufficient' : 'low'
    };
  }));

  const totalPurchaseCost = prepItems.reduce((s, i) => s + i.estimated_cost, 0);
  res.json({ event, prep_items: prepItems, total_purchase_cost: totalPurchaseCost });
});

module.exports = router;
