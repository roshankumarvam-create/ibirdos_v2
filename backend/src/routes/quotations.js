const express = require('express');
const db = require('../db');
const { authenticate, requireOwner, requireManager } = require('../middleware/auth');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

// ============================================================
// GET /api/quotations — List quotations
// ============================================================
router.get('/', authenticate, requireManager, async (req, res) => {
  const { status } = req.query;
  let q = `
    SELECT qt.*, u.full_name as client_name_linked,
           e.name as event_name, e.event_date
    FROM quotations qt
    LEFT JOIN users u ON u.id = qt.client_id
    LEFT JOIN events e ON e.id = qt.event_id
    WHERE qt.company_id = $1
  `;
  const params = [req.companyId];
  if (status) { params.push(status); q += ` AND qt.status = $${params.length}`; }
  q += ' ORDER BY qt.created_at DESC LIMIT 50';
  const quotations = await db.many(q, params);
  res.json(quotations);
});

// ============================================================
// GET /api/quotations/:id — Quotation detail
// ============================================================
router.get('/:id', authenticate, async (req, res) => {
  // Allow access via approval token (no auth needed for client review)
  const quotation = await db.one(
    'SELECT * FROM quotations WHERE id=$1 AND company_id=$2',
    [req.params.id, req.companyId]
  );
  if (!quotation) return res.status(404).json({ error: 'Quotation not found' });

  const items = await db.many(
    `SELECT qi.*, r.name as recipe_name, r.image_url
     FROM quotation_items qi LEFT JOIN recipes r ON r.id=qi.recipe_id
     WHERE qi.quotation_id=$1 ORDER BY qi.id`,
    [req.params.id]
  );

  const company = await db.one('SELECT name, currency FROM companies WHERE id=$1', [req.companyId]);
  res.json({ ...quotation, items, company });
});

// ============================================================
// GET /api/quotations/review/:token — Client reviews via token (NO AUTH)
// ============================================================
router.get('/review/:token', async (req, res) => {
  const quotation = await db.one(
    `SELECT qt.*, c.name as company_name, c.currency, c.phone as company_phone
     FROM quotations qt JOIN companies c ON c.id = qt.company_id
     WHERE qt.client_approval_token = $1`,
    [req.params.token]
  );
  if (!quotation) return res.status(404).json({ error: 'Quotation not found or expired' });
  if (quotation.status === 'expired') return res.status(410).json({ error: 'This quotation has expired' });

  const items = await db.many(
    'SELECT * FROM quotation_items WHERE quotation_id=$1 ORDER BY id',
    [quotation.id]
  );

  // Mark as viewed
  if (quotation.status === 'sent') {
    await db.query("UPDATE quotations SET status='viewed' WHERE id=$1", [quotation.id]);
  }

  res.json({ ...quotation, items });
});

// ============================================================
// POST /api/quotations — Create quotation
// ============================================================
router.post('/', authenticate, requireOwner, async (req, res) => {
  const {
    client_id, client_name, client_email, client_phone,
    event_id, event_date, event_location, headcount,
    items, notes, terms, valid_days = 14,
    overhead_pct = 15, labor_pct = 25, tax_rate = 0, deposit_percent = 50
  } = req.body;

  if (!items?.length) return res.status(400).json({ error: 'At least one item required' });

  const result = await db.transaction(async (client) => {
    // Get company defaults
    const company = await client.query('SELECT * FROM companies WHERE id=$1', [req.companyId]);
    const comp = company.rows[0];

    // Calculate totals from items
    let foodCost = 0, subtotalFromItems = 0;
    const processedItems = [];

    for (const item of items) {
      let unitCost = 0, unitPrice = item.unit_price;
      if (item.recipe_id) {
        const recipe = await client.query(
          'SELECT selling_price, base_cost FROM recipes WHERE id=$1 AND company_id=$2',
          [item.recipe_id, req.companyId]
        );
        if (recipe.rows.length > 0) {
          unitPrice = item.unit_price || recipe.rows[0].selling_price;
          unitCost = recipe.rows[0].base_cost;
        }
      }
      const portionScale = item.portion_size_oz ? item.portion_size_oz / 8 : 1; // normalize to 8oz base
      const scaledUnitPrice = unitPrice * portionScale;
      const scaledUnitCost = unitCost * portionScale;
      const lineTotal = scaledUnitPrice * item.quantity;
      const lineCost = scaledUnitCost * item.quantity;
      const cogsPct = lineTotal > 0 ? (lineCost / lineTotal) * 100 : 0;

      foodCost += lineCost;
      subtotalFromItems += lineTotal;
      processedItems.push({
        recipe_id: item.recipe_id || null,
        name: item.name || 'Item',
        description: item.description || null,
        quantity: item.quantity || 1,
        portion_size_oz: item.portion_size_oz || null,
        unit_price: parseFloat(scaledUnitPrice.toFixed(2)),
        unit_cost: parseFloat(scaledUnitCost.toFixed(2)),
        line_total: parseFloat(lineTotal.toFixed(2)),
        line_cost: parseFloat(lineCost.toFixed(2)),
        cogs_pct: parseFloat(cogsPct.toFixed(2))
      });
    }

    const laborCost = subtotalFromItems * (labor_pct / 100);
    const overheadAmount = subtotalFromItems * (overhead_pct / 100);
    const subtotal = subtotalFromItems + laborCost + overheadAmount;
    const taxAmount = subtotal * (tax_rate / 100);
    const total = subtotal + taxAmount;
    const depositAmount = total * (deposit_percent / 100);
    const validUntil = new Date(Date.now() + valid_days * 86400000);

    const quot = await client.query(
      `INSERT INTO quotations
       (company_id, event_id, client_id, client_name, client_email, client_phone,
        food_cost, labor_cost, overhead_amount, subtotal, tax_rate, tax_amount, total,
        deposit_percent, deposit_amount, headcount, event_date, event_location,
        notes, terms, valid_until, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'draft')
       RETURNING *`,
      [req.companyId, event_id||null, client_id||null, client_name||null, client_email||null, client_phone||null,
       foodCost.toFixed(2), laborCost.toFixed(2), overheadAmount.toFixed(2), subtotal.toFixed(2),
       tax_rate, taxAmount.toFixed(2), total.toFixed(2),
       deposit_percent, depositAmount.toFixed(2),
       headcount||0, event_date||null, event_location||null,
       notes||null, terms||null, validUntil]
    );
    const quotId = quot.rows[0].id;

    for (const item of processedItems) {
      await client.query(
        `INSERT INTO quotation_items (quotation_id,recipe_id,name,description,quantity,portion_size_oz,unit_price,unit_cost,line_total,line_cost,cogs_pct)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [quotId, item.recipe_id, item.name, item.description, item.quantity, item.portion_size_oz,
         item.unit_price, item.unit_cost, item.line_total, item.line_cost, item.cogs_pct]
      );
    }

    return quot.rows[0];
  });

  res.status(201).json(result);
});

// ============================================================
// POST /api/quotations/:id/calculate — Dynamic pricing preview
// Used by client portal when adjusting portion sizes / headcount
// ============================================================
router.post('/:id/calculate', async (req, res) => {
  const { items, headcount, overhead_pct = 15, labor_pct = 25, tax_rate = 0 } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'Items required' });

  let foodCost = 0, subtotalFromItems = 0;
  const processedItems = [];

  for (const item of items) {
    let unitCost = 0, unitPrice = item.unit_price || 0;
    if (item.recipe_id) {
      const recipe = await db.one(
        'SELECT selling_price, base_cost FROM recipes WHERE id=$1',
        [item.recipe_id]
      );
      if (recipe) {
        unitPrice = item.unit_price || recipe.selling_price;
        unitCost = recipe.base_cost;
      }
    }
    const portionScale = item.portion_size_oz ? item.portion_size_oz / 8 : 1;
    const scaledPrice = unitPrice * portionScale;
    const scaledCost = unitCost * portionScale;
    const qty = item.quantity || (headcount || 1);
    const lineTotal = scaledPrice * qty;
    const lineCost = scaledCost * qty;

    foodCost += lineCost;
    subtotalFromItems += lineTotal;
    processedItems.push({
      ...item, unit_price: scaledPrice, line_total: lineTotal, line_cost: lineCost,
      cogs_pct: lineTotal > 0 ? (lineCost / lineTotal * 100).toFixed(1) : 0
    });
  }

  const laborCost = subtotalFromItems * (labor_pct / 100);
  const overheadAmount = subtotalFromItems * (overhead_pct / 100);
  const subtotal = subtotalFromItems + laborCost + overheadAmount;
  const taxAmount = subtotal * (tax_rate / 100);
  const total = subtotal + taxAmount;
  const overallCogs = total > 0 ? (foodCost / total * 100) : 0;

  res.json({
    items: processedItems,
    food_cost: foodCost.toFixed(2),
    labor_cost: laborCost.toFixed(2),
    overhead_amount: overheadAmount.toFixed(2),
    subtotal: subtotal.toFixed(2),
    tax_amount: taxAmount.toFixed(2),
    total: total.toFixed(2),
    overall_cogs_pct: overallCogs.toFixed(1),
    cogs_status: overallCogs <= 30 ? 'green' : overallCogs <= 35 ? 'yellow' : 'red'
  });
});

// ============================================================
// PUT /api/quotations/:id/send — Send to client
// ============================================================
router.put('/:id/send', authenticate, requireOwner, async (req, res) => {
  const quotation = await db.one('SELECT * FROM quotations WHERE id=$1 AND company_id=$2', [req.params.id, req.companyId]);
  if (!quotation) return res.status(404).json({ error: 'Quotation not found' });

  await db.query("UPDATE quotations SET status='sent' WHERE id=$1", [req.params.id]);

  const reviewUrl = `${process.env.FRONTEND_URL}/quotation/${quotation.client_approval_token}`;
  // Email would be sent here via sendQuotationEmail()

  res.json({ message: 'Quotation sent', review_url: reviewUrl, token: quotation.client_approval_token });
});

// ============================================================
// POST /api/quotations/approve/:token — Client approves
// ============================================================
router.post('/approve/:token', async (req, res) => {
  const quotation = await db.one(
    'SELECT * FROM quotations WHERE client_approval_token=$1 AND status IN (\'sent\',\'viewed\')',
    [req.params.token]
  );
  if (!quotation) return res.status(404).json({ error: 'Quotation not found or already processed' });

  await db.query(
    "UPDATE quotations SET status='approved', approved_at=NOW(), approved_by_client=true WHERE id=$1",
    [quotation.id]
  );

  res.json({ message: 'Quotation approved', quotation_number: quotation.quotation_number });
});

// ============================================================
// POST /api/quotations/:id/deposit — Create Stripe payment for deposit
// ============================================================
router.post('/:id/deposit', authenticate, async (req, res) => {
  const quotation = await db.one(
    "SELECT * FROM quotations WHERE id=$1 AND company_id=$2 AND status IN ('approved','sent','viewed')",
    [req.params.id, req.companyId]
  );
  if (!quotation) return res.status(404).json({ error: 'Quotation not found or not approved' });

  const company = await db.one('SELECT name, currency FROM companies WHERE id=$1', [req.companyId]);
  const depositCents = Math.round(parseFloat(quotation.deposit_amount) * 100);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: (company.currency || 'usd').toLowerCase(),
        unit_amount: depositCents,
        product_data: {
          name: `Deposit — ${quotation.quotation_number}`,
          description: `${quotation.deposit_percent}% deposit for your event booking`
        }
      },
      quantity: 1
    }],
    metadata: { quotation_id: quotation.id, company_id: req.companyId },
    success_url: `${process.env.FRONTEND_URL}/quotation/${quotation.client_approval_token}?deposit=success`,
    cancel_url: `${process.env.FRONTEND_URL}/quotation/${quotation.client_approval_token}?deposit=cancelled`
  });

  await db.query(
    'UPDATE quotations SET stripe_checkout_session_id=$1 WHERE id=$2',
    [session.id, quotation.id]
  );

  res.json({ checkout_url: session.url, session_id: session.id });
});

// ============================================================
// POST /api/quotations/stripe-webhook — Handle deposit payment
// ============================================================
router.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const quotationId = session.metadata?.quotation_id;
    if (quotationId) {
      await db.query(
        `UPDATE quotations SET deposit_paid=true, deposit_paid_at=NOW(),
         stripe_payment_intent_id=$1 WHERE id=$2`,
        [session.payment_intent, quotationId]
      );
    }
  }

  res.json({ received: true });
});

module.exports = router;
