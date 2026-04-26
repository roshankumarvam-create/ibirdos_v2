const express = require('express');
const db = require('../db');
const { authenticate, requireManager } = require('../middleware/auth');

const analyticsRouter = express.Router();
analyticsRouter.use(authenticate);

// ============================================================
// HELPER: FILTER FOR MANAGER
// ============================================================
function filterManagerData(data, role) {
  if (role === 'owner' || role === 'super_admin') return data;

  if (role === 'manager') {
    const {
      total_revenue,
      gross_profit,
      total_profit,
      net_profit,
      ...safe
    } = data;
    return safe;
  }

  return {};
}

// ============================================================
// SUMMARY
// ============================================================
analyticsRouter.get('/summary', requireManager, async (req, res) => {
  try {
    const stats = await db.oneOrNone( // ✅ FIXED
      `SELECT
         COALESCE(SUM(o.total), 0) as total_revenue,
         COALESCE(SUM(o.total_cost), 0) as total_cost,
         COALESCE(SUM(o.gross_profit), 0) as gross_profit,
         CASE WHEN SUM(o.total) > 0 THEN ROUND((SUM(o.total_cost)/SUM(o.total)*100)::numeric,1) ELSE 0 END as food_cost_percent,
         COUNT(o.id) as total_orders
       FROM orders o
       WHERE o.company_id=$1 AND o.status != 'cancelled'`,
      [req.companyId]
    );

    res.json(filterManagerData(stats || {}, req.user.role)); // ✅ safe fallback
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// REVENUE CHART
// ============================================================
analyticsRouter.get('/revenue-chart', requireManager, async (req, res) => {
  try {
    const data = await db.manyOrNone( // ✅ safer
      `SELECT
         DATE(o.created_at) as date,
         COALESCE(SUM(o.total), 0) as revenue,
         COALESCE(SUM(o.total_cost), 0) as cost,
         COALESCE(SUM(o.gross_profit), 0) as profit,
         CASE WHEN SUM(o.total) > 0 THEN ROUND((SUM(o.total_cost)/SUM(o.total)*100)::numeric,1) ELSE 0 END as food_cost_pct
       FROM orders o
       WHERE o.company_id=$1 AND o.status != 'cancelled'
       GROUP BY DATE(o.created_at)
       ORDER BY date`,
      [req.companyId]
    );

    if (req.user.role === 'manager') {
      return res.json(data.map(d => ({
        date: d.date,
        cost: d.cost,
        food_cost_pct: d.food_cost_pct
      })));
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// TOP RECIPES
// ============================================================
analyticsRouter.get('/top-recipes', requireManager, async (req, res) => {
  try {
    const data = await db.manyOrNone(
      `SELECT r.id, r.name,
         r.food_cost_percent,
         COUNT(oi.id) as times_ordered,
         SUM(oi.quantity) as total_servings,
         SUM(oi.line_total) as total_revenue,
         SUM(oi.line_cost) as total_cost,
         SUM(oi.line_total - oi.line_cost) as total_profit
       FROM order_items oi
       JOIN recipes r ON r.id = oi.recipe_id AND r.company_id=$1  -- ✅ FIXED
       JOIN orders o ON o.id = oi.order_id AND o.company_id=$1   -- ✅ FIXED
       WHERE o.status != 'cancelled'
       GROUP BY r.id, r.name, r.food_cost_percent
       ORDER BY total_revenue DESC LIMIT 10`,
      [req.companyId]
    );

    if (req.user.role === 'manager') {
      return res.json(data.map(r => ({
        id: r.id,
        name: r.name,
        food_cost_percent: r.food_cost_percent,
        times_ordered: r.times_ordered,
        total_servings: r.total_servings,
        total_cost: r.total_cost
      })));
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// FOOD COST TREND
// ============================================================
analyticsRouter.get('/food-cost-trend', requireManager, async (req, res) => {
  try {
    const recipes = await db.manyOrNone(
      `SELECT name, food_cost_percent, fc_status
       FROM recipes WHERE company_id=$1`,
      [req.companyId]
    );

    res.json(recipes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// CEO DASHBOARD
// ============================================================
analyticsRouter.get('/ceo-dashboard', async (req, res) => {
  try {
    if (req.user.role !== 'owner' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only owner can access CEO dashboard' });
    }

    const stats = await db.oneOrNone( // ✅ FIXED
      `SELECT
         COALESCE(SUM(total), 0) as weekly_revenue,
         CASE WHEN SUM(total) > 0 THEN ROUND((SUM(total_cost)/SUM(total)*100)::numeric,1) ELSE 0 END as food_cost_percent,
         COUNT(id) as total_orders
       FROM orders WHERE company_id=$1`,
      [req.companyId]
    );

    res.json(stats || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ALERTS ROUTER
// ============================================================
const alertsRouter = express.Router();
alertsRouter.use(authenticate);

alertsRouter.get('/', async (req, res) => {
  try {
    const alerts = await db.manyOrNone(
      `SELECT * FROM alerts WHERE company_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [req.companyId]
    );

    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

alertsRouter.put('/:id/read', async (req, res) => {
  try {
    await db.query(
      'UPDATE alerts SET is_read=true WHERE id=$1 AND company_id=$2',
      [req.params.id, req.companyId]
    );

    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { analyticsRouter, alertsRouter };