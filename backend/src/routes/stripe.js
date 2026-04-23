const express = require('express');
const db = require('../db');
const { authenticate, requireOwner } = require('../middleware/auth');
const router = express.Router();

function getStripe() {
if (!process.env.STRIPE_SECRET_KEY) return null;
return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// PLAN → PRICE ID (REPLACE WITH REAL STRIPE IDS)
const PRICE_MAP = {
solo: 'price_solo_id',
restaurant: 'price_restaurant_id'
};

// ── CHECKOUT ─────────────────────────────
router.post('/checkout', authenticate, requireOwner, async (req, res) => {
const { plan, success_url, cancel_url } = req.body;

// DEV MODE
if (process.env.STRIPE_DEV_BYPASS === 'true') {
await db.query(
`UPDATE companies 
       SET plan_tier=$1, subscription_status='active' 
       WHERE id=$2`,
[plan, req.companyId]
);

```
return res.json({
  dev_bypass: true,
  redirect_url: success_url || '/dashboard'
});
```

}

const stripe = getStripe();
if (!stripe) {
return res.status(503).json({ error: 'Stripe not configured' });
}

if (!PRICE_MAP[plan]) {
return res.status(400).json({ error: 'Invalid plan' });
}

const user = await db.one('SELECT * FROM users WHERE id=$1', [req.user.id]);

const session = await stripe.checkout.sessions.create({
mode: 'subscription',
payment_method_types: ['card'],
customer_email: user.email,


line_items: [
  {
    price: PRICE_MAP[plan],
    quantity: 1
  }
],

metadata: {
  company_id: req.companyId,
  user_id: req.user.id,
  plan
},

success_url: success_url || `${process.env.FRONTEND_URL}/dashboard`,
cancel_url: cancel_url || `${process.env.FRONTEND_URL}/auth/register`


});

res.json({ url: session.url });
});

// ── WEBHOOK ─────────────────────────────
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
const stripe = getStripe();
if (!stripe) return res.json({ received: true });

const sig = req.headers['stripe-signature'];
let event;

try {
event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
} catch (err) {
return res.status(400).json({ error: err.message });
}

if (event.type === 'checkout.session.completed') {
const session = event.data.object;


await db.query(
  `UPDATE companies 
   SET subscription_status='active',
       stripe_customer_id=$1
   WHERE id=$2`,
  [session.customer, session.metadata.company_id]
);


}

res.json({ received: true });
});

// ── PLANS ─────────────────────────────
router.get('/plans', (req, res) => {
res.json([
{
id: 'solo',
name: 'Solo',
price: 49,
features: ['1 user only', 'Limited features']
},
{
id: 'restaurant',
name: 'Restaurant',
price: 149,
features: ['Up to 5 users', 'Full features']
}
]);
});

module.exports = router;
