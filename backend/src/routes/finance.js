const express = require('express');
const db = require('../db');
const { authenticate, requireOwner } = require('../middleware/auth');
const router = express.Router();
router.use(authenticate, requireOwner);

// GET /api/finance/weekly — Weekly P&L summary
router.get('/weekly', async (req, res) => {
  const { weeks = 8 } = req.query;
  const data = await db.many(
    `SELECT
       DATE_TRUNC('week', o.created_at) as week_start,
       COALESCE(SUM(o.total), 0) as revenue,
       COALESCE(SUM(o.total_cost), 0) as food_cost,
       COALESCE(SUM(o.gross_profit), 0) as gross_profit,
       CASE WHEN SUM(o.total)>0 THEN ROUND((SUM(o.total_cost)/SUM(o.total)*100)::numeric,1) ELSE 0 END as cogs_pct,
       COUNT(o.id) as order_count
     FROM orders o
     WHERE o.company_id=$1 AND o.status!='cancelled'
       AND o.created_at >= NOW() - ($2 || ' weeks')::interval
     GROUP BY DATE_TRUNC('week', o.created_at)
     ORDER BY week_start DESC`,
    [req.companyId, weeks]
  );
  res.json(data);
});

// GET /api/finance/event-pl-summary — All events P&L
router.get('/event-pl-summary', async (req, res) => {
  const events = await db.many(
    `SELECT e.id, e.name, e.event_date, e.guest_count, e.status,
       e.total_revenue, e.total_food_cost, e.total_labor_cost,
       e.food_cost_percent, e.gross_profit, e.profit_percent,
       CASE WHEN e.total_revenue>0
         THEN ROUND((e.total_food_cost/e.total_revenue*100)::numeric,1) ELSE 0 END as cogs_pct,
       CASE WHEN e.total_revenue>0 AND e.total_food_cost/e.total_revenue<=0.30 THEN 'green'
            WHEN e.total_revenue>0 AND e.total_food_cost/e.total_revenue<=0.35 THEN 'yellow'
            ELSE 'red' END as cogs_status
     FROM events e
     WHERE e.company_id=$1 AND e.status NOT IN ('cancelled','draft')
     ORDER BY e.event_date DESC LIMIT 50`,
    [req.companyId]
  );
  res.json(events);
});

// GET /api/finance/cogs-overview — COGS across all recipes
router.get('/cogs-overview', async (req, res) => {
  const recipes = await db.many(
    `SELECT id, name, category, base_cost, selling_price, food_cost_percent, fc_status, markup_percent
     FROM recipes WHERE company_id=$1 AND is_active=true ORDER BY food_cost_percent DESC`,
    [req.companyId]
  );
  const summary = {
    total: recipes.length,
    green: recipes.filter(r => r.fc_status === 'green').length,
    yellow: recipes.filter(r => r.fc_status === 'yellow').length,
    red: recipes.filter(r => r.fc_status === 'red').length,
    avg_cogs: recipes.length > 0
      ? (recipes.reduce((s, r) => s + parseFloat(r.food_cost_percent || 0), 0) / recipes.length).toFixed(1)
      : 0
  };
  res.json({ recipes, summary });
});

// GET /api/finance/ledger — Transaction ledger
router.get('/ledger', async (req, res) => {
  const { limit = 100, type } = req.query;
  let q = 'SELECT * FROM transaction_ledger WHERE company_id=$1';
  const params = [req.companyId];
  if (type) { params.push(type); q += ` AND transaction_type=$${params.length}`; }
  q += ` ORDER BY posted_at DESC LIMIT $${params.length + 1}`;
  params.push(parseInt(limit));
  const entries = await db.many(q, params);
  res.json(entries);
});

// GET /api/finance/price-history/:ingredientId
router.get('/price-history/:ingredientId', async (req, res) => {
  const history = await db.many(
    `SELECT pp.*, inv.supplier as invoice_supplier
     FROM price_points pp LEFT JOIN invoices inv ON inv.id=pp.invoice_id
     WHERE pp.ingredient_id=$1 AND pp.company_id=$2
     ORDER BY pp.recorded_at DESC LIMIT 50`,
    [req.params.ingredientId, req.companyId]
  );
  const ingredient = await db.one(
    'SELECT name, current_price, previous_price, unit FROM ingredients WHERE id=$1',
    [req.params.ingredientId]
  );
  res.json({ ingredient, history });
});

module.exports = router;
