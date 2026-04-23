const express = require('express');
const db = require('../db');
const { authenticate, requireOwner, requireManager } = require('../middleware/auth');
const router = express.Router();
router.use(authenticate);

// ============================================================
// GET /api/event-templates — List templates
// ============================================================
router.get('/', async (req, res) => {
  const templates = await db.many(
    `SELECT et.*, COUNT(etr.id) as recipe_count,
            u.full_name as created_by_name
     FROM event_templates et
     LEFT JOIN event_template_recipes etr ON etr.template_id = et.id
     LEFT JOIN users u ON u.id = et.created_by
     WHERE et.company_id=$1 AND et.is_active=true
     GROUP BY et.id, u.full_name ORDER BY et.name`,
    [req.companyId]
  );
  res.json(templates);
});

// ============================================================
// GET /api/event-templates/:id — Template detail with recipes
// ============================================================
router.get('/:id', async (req, res) => {
  const template = await db.one(
    'SELECT * FROM event_templates WHERE id=$1 AND company_id=$2',
    [req.params.id, req.companyId]
  );
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const recipes = await db.many(
    `SELECT etr.*, r.name as recipe_name, r.base_cost, r.selling_price, r.food_cost_percent, r.fc_status
     FROM event_template_recipes etr JOIN recipes r ON r.id=etr.recipe_id
     WHERE etr.template_id=$1`,
    [req.params.id]
  );
  res.json({ ...template, recipes });
});

// ============================================================
// POST /api/event-templates — Create template
// ============================================================
router.post('/', requireOwner, async (req, res) => {
  const { name, description, headcount_default, event_type,
          default_overhead_pct, default_labor_pct, default_margin_pct,
          default_lead_time_days, recipes } = req.body;

  const result = await db.transaction(async (client) => {
    const template = await client.query(
      `INSERT INTO event_templates
       (company_id, name, description, headcount_default, event_type,
        default_overhead_pct, default_labor_pct, default_margin_pct,
        default_lead_time_days, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.companyId, name, description||null, headcount_default||0, event_type||'catering',
       default_overhead_pct||15, default_labor_pct||25, default_margin_pct||30,
       default_lead_time_days||3, req.user.id]
    );
    const templateId = template.rows[0].id;

    if (recipes?.length) {
      for (const r of recipes) {
        await client.query(
          'INSERT INTO event_template_recipes (template_id, recipe_id, servings_per_headcount, notes) VALUES ($1,$2,$3,$4)',
          [templateId, r.recipe_id, r.servings_per_headcount||1, r.notes||null]
        );
      }
    }
    return template.rows[0];
  });

  res.status(201).json(result);
});

// ============================================================
// POST /api/event-templates/:id/create-event — Instantiate event from template
// ============================================================
router.post('/:id/create-event', requireOwner, async (req, res) => {
  const template = await db.one(
    'SELECT * FROM event_templates WHERE id=$1 AND company_id=$2',
    [req.params.id, req.companyId]
  );
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const { event_date, headcount_actual, client_name, client_phone, notes, venue } = req.body;
  if (!event_date) return res.status(400).json({ error: 'event_date required' });

  const headcount = headcount_actual || template.headcount_default;

  const result = await db.transaction(async (client) => {
    // Create event from template
    const event = await client.query(
      `INSERT INTO events
       (company_id, name, event_type, event_date, guest_count, venue, client_name, client_phone, notes, created_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'confirmed') RETURNING *`,
      [req.companyId, template.name, template.event_type, event_date,
       headcount, venue||null, client_name||null, client_phone||null, notes||null, req.user.id]
    );
    const eventId = event.rows[0].id;

    // Copy template recipes to event
    const templateRecipes = await client.query(
      'SELECT * FROM event_template_recipes WHERE template_id=$1', [req.params.id]
    );

    let totalCost = 0, totalRevenue = 0;
    for (const er of templateRecipes.rows) {
      const recipe = await client.query('SELECT * FROM recipes WHERE id=$1', [er.recipe_id]);
      if (!recipe.rows.length) continue;
      const servings = Math.ceil(headcount * er.servings_per_headcount);
      const costForEvent = recipe.rows[0].base_cost * servings;
      const revenueForEvent = recipe.rows[0].selling_price * servings;
      totalCost += costForEvent;
      totalRevenue += revenueForEvent;

      await client.query(
        'INSERT INTO event_recipes (event_id, recipe_id, servings, food_cost_at_event) VALUES ($1,$2,$3,$4)',
        [eventId, er.recipe_id, servings, costForEvent]
      );
    }

    // Add labor + overhead defaults from template
    const laborCost = totalRevenue * (template.default_labor_pct / 100);
    const overheadCost = totalRevenue * (template.default_overhead_pct / 100);
    const totalCostWithOverhead = totalCost + laborCost + overheadCost;
    const fcPct = totalRevenue > 0 ? (totalCostWithOverhead / totalRevenue * 100) : 0;

    await client.query(
      `UPDATE events SET total_food_cost=$1, total_revenue=$2, gross_profit=$3,
       food_cost_percent=$4, profit_percent=$5, total_labor_cost=$6 WHERE id=$7`,
      [totalCostWithOverhead, totalRevenue, totalRevenue - totalCostWithOverhead,
       fcPct, totalRevenue > 0 ? ((totalRevenue-totalCostWithOverhead)/totalRevenue*100) : 0,
       laborCost, eventId]
    );

    // Auto-generate prep list
    await client.query(
      `INSERT INTO prep_lists (company_id, event_id, title, due_by)
       VALUES ($1,$2,$3,$4)`,
      [req.companyId, eventId, `Kitchen Packet — ${template.name}`, event_date]
    );

    return event.rows[0];
  });

  res.status(201).json(result);
});

// ============================================================
// GET /api/event-templates/pl/:eventId — Full event P&L
// food + labor + overhead + margin
// ============================================================
router.get('/pl/:eventId', requireOwner, async (req, res) => {
  const event = await db.one('SELECT * FROM events WHERE id=$1 AND company_id=$2', [req.params.eventId, req.companyId]);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  // Food cost breakdown by recipe
  const recipes = await db.many(
    `SELECT er.*, r.name as recipe_name, r.food_cost_percent, r.fc_status,
            r.base_cost as cost_per_serving, r.selling_price as price_per_serving
     FROM event_recipes er JOIN recipes r ON r.id=er.recipe_id
     WHERE er.event_id=$1`,
    [req.params.eventId]
  );

  // Labor entries
  const labor = await db.many(
    `SELECT le.*, u.full_name FROM labor_entries le
     LEFT JOIN users u ON u.id=le.user_id WHERE le.event_id=$1`,
    [req.params.eventId]
  );
  const totalLaborCost = labor.reduce((s, l) => s + parseFloat(l.total_cost), 0);

  // Waste costs from this event
  const waste = await db.one(
    'SELECT COALESCE(SUM(waste_cost),0) as total FROM waste_logs WHERE event_id=$1',
    [req.params.eventId]
  );

  // Quotation if exists
  const quotation = await db.one(
    'SELECT * FROM quotations WHERE event_id=$1 ORDER BY created_at DESC LIMIT 1',
    [req.params.eventId]
  ).catch(() => null);

  const foodCost = parseFloat(event.total_food_cost || 0);
  const revenue = parseFloat(event.total_revenue || 0);
  const wasteCost = parseFloat(waste.total);
  const totalCost = foodCost + totalLaborCost + wasteCost;
  const grossProfit = revenue - totalCost;
  const profitPct = revenue > 0 ? (grossProfit / revenue * 100) : 0;
  const cogsPct = revenue > 0 ? (foodCost / revenue * 100) : 0;
  const cogsStatus = cogsPct <= 30 ? 'green' : cogsPct <= 35 ? 'yellow' : 'red';

  res.json({
    event,
    recipes,
    labor_entries: labor,
    pl: {
      revenue: revenue.toFixed(2),
      food_cost: foodCost.toFixed(2),
      labor_cost: totalLaborCost.toFixed(2),
      waste_cost: wasteCost.toFixed(2),
      total_cost: totalCost.toFixed(2),
      gross_profit: grossProfit.toFixed(2),
      profit_pct: profitPct.toFixed(1),
      cogs_pct: cogsPct.toFixed(1),
      cogs_status: cogsStatus,
      headcount: event.guest_count,
      cost_per_head: event.guest_count > 0 ? (totalCost / event.guest_count).toFixed(2) : 0,
      revenue_per_head: event.guest_count > 0 ? (revenue / event.guest_count).toFixed(2) : 0
    },
    quotation: quotation || null
  });
});

// ============================================================
// POST /api/event-templates/labor/:eventId — Add labor entry
// ============================================================
router.post('/labor/:eventId', requireManager, async (req, res) => {
  const { role_label, hours, rate_per_hour, user_id, notes } = req.body;
  if (!hours || !rate_per_hour) return res.status(400).json({ error: 'hours and rate_per_hour required' });

  const entry = await db.one(
    `INSERT INTO labor_entries (company_id, event_id, user_id, role_label, hours, rate_per_hour, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.companyId, req.params.eventId, user_id||null, role_label||null, hours, rate_per_hour, notes||null]
  );

  // Update event labor cost total
  await db.query(
    `UPDATE events SET total_labor_cost = (
       SELECT COALESCE(SUM(total_cost),0) FROM labor_entries WHERE event_id=$1
     ) WHERE id=$1`,
    [req.params.eventId]
  );

  res.status(201).json(entry);
});

module.exports = router;
