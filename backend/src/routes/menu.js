const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// ============================================================
// GET /api/menu/:slug — Public menu for a restaurant (no auth required)
// ============================================================
router.get('/:slug', async (req, res) => {
  const company = await db.one(
    'SELECT id, name, slug, currency, settings FROM companies WHERE slug=$1 AND is_active=true',
    [req.params.slug]
  );
  if (!company) return res.status(404).json({ error: 'Restaurant not found' });

  // Get available recipes — only selling_price visible, no cost data
  const recipes = await db.many(
    `SELECT id, name, description, category, cuisine, selling_price,
       portion_size_oz, allergens, image_url, is_available
     FROM recipes
     WHERE company_id=$1 AND is_active=true AND is_available=true
     ORDER BY category, name`,
    [company.id]
  );

  // Group by category
  const categories = {};
  for (const r of recipes) {
    const cat = r.category || 'Other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(r);
  }

  res.json({
    restaurant: { name: company.name, slug: company.slug, currency: company.currency },
    categories,
    recipe_count: recipes.length
  });
});

// ============================================================
// POST /api/menu/:slug/order — Customer places order
// Customer must be authenticated and belong to this company
// ============================================================
router.post('/:slug/order', authenticate, async (req, res) => {
  const company = await db.one(
    'SELECT id FROM companies WHERE slug=$1 AND is_active=true',
    [req.params.slug]
  );
  if (!company) return res.status(404).json({ error: 'Restaurant not found' });

  // Verify customer belongs to this restaurant
  if (req.user.company_id !== company.id) {
    return res.status(403).json({ error: 'You are not registered with this restaurant' });
  }
  if (req.user.role !== 'customer') {
    return res.status(403).json({ error: 'Only customers can order from the menu' });
  }

  // Delegate to order creation logic (same as internal)
  const { items, special_instructions, delivery_address } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'No items in order' });

  // Validate and price items
  let subtotal = 0;
  const orderItems = [];
  for (const item of items) {
    const recipe = await db.one(
      'SELECT id, name, selling_price, base_cost FROM recipes WHERE id=$1 AND company_id=$2 AND is_active=true AND is_available=true',
      [item.recipe_id, company.id]
    );
    if (!recipe) return res.status(400).json({ error: `Item not available` });
    const qty = Math.max(1, parseInt(item.quantity));
    subtotal += recipe.selling_price * qty;
    orderItems.push({ ...item, quantity: qty, unit_price: recipe.selling_price, unit_cost: recipe.base_cost });
  }

  const company_full = await db.one('SELECT default_tax_rate FROM companies WHERE id=$1', [company.id]);
  const tax = subtotal * (company_full.default_tax_rate / 100);
  const total = subtotal + tax;

  const order = await db.transaction(async (client) => {
    const o = await client.query(
      `INSERT INTO orders (company_id, customer_id, order_type, status, subtotal, tax_amount, total, total_cost, special_instructions, delivery_address)
       VALUES ($1,$2,'online','pending',$3,$4,$5,$6,$7,$8) RETURNING *`,
      [company.id, req.user.id, subtotal, tax, total,
       orderItems.reduce((s, oi) => s + oi.unit_cost * oi.quantity, 0),
       special_instructions || null, delivery_address || null]
    );
    for (const oi of orderItems) {
      await client.query(
        'INSERT INTO order_items (order_id,recipe_id,quantity,unit_price,unit_cost,line_total,line_cost) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [o.rows[0].id, oi.recipe_id, oi.quantity, oi.unit_price, oi.unit_cost, oi.unit_price*oi.quantity, oi.unit_cost*oi.quantity]
      );
    }
    return o.rows[0];
  });

  res.status(201).json({
    order_number: order.order_number,
    status: order.status,
    subtotal: order.subtotal,
    tax: order.tax_amount,
    total: order.total,
    message: 'Order placed successfully'
  });
});

// ============================================================
// GET /api/menu/:slug/orders/my — Customer's own orders
// ============================================================
router.get('/:slug/orders/my', authenticate, async (req, res) => {
  const company = await db.one('SELECT id FROM companies WHERE slug=$1', [req.params.slug]);
  if (!company || req.user.company_id !== company.id) return res.status(403).json({ error: 'Access denied' });

  const orders = await db.many(
    `SELECT o.id, o.order_number, o.status, o.total, o.created_at,
       JSON_AGG(JSON_BUILD_OBJECT('name', r.name, 'quantity', oi.quantity, 'price', oi.unit_price)) as items
     FROM orders o JOIN order_items oi ON oi.order_id=o.id JOIN recipes r ON r.id=oi.recipe_id
     WHERE o.company_id=$1 AND o.customer_id=$2
     GROUP BY o.id ORDER BY o.created_at DESC LIMIT 20`,
    [company.id, req.user.id]
  );
  res.json(orders);
});

module.exports = router;
