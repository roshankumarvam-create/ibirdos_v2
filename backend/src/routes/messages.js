const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// Public: client sends message via quotation token (no auth)
router.post('/quotation/:token', async (req, res) => {
  const { body, sender_name } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'Message body required' });
  const quot = await db.one('SELECT * FROM quotations WHERE client_approval_token=$1', [req.params.token]).catch(() => null);
  if (!quot) return res.status(404).json({ error: 'Quotation not found' });
  const msg = await db.one(
    `INSERT INTO messages (company_id, quotation_id, sender_name, sender_role, body)
     VALUES ($1,$2,$3,'customer',$4) RETURNING *`,
    [quot.company_id, quot.id, sender_name || quot.client_name || 'Client', body.trim()]
  );
  res.status(201).json(msg);
});

// Public: get messages for quotation via token
router.get('/quotation/:token', async (req, res) => {
  const quot = await db.one('SELECT id, company_id FROM quotations WHERE client_approval_token=$1', [req.params.token]).catch(() => null);
  if (!quot) return res.status(404).json({ error: 'Quotation not found' });
  const msgs = await db.many('SELECT * FROM messages WHERE quotation_id=$1 ORDER BY created_at ASC', [quot.id]);
  res.json(msgs);
});

// Authenticated routes below
router.use(authenticate);

router.get('/', async (req, res) => {
  const { quotation_id, order_id } = req.query;
  if (!quotation_id && !order_id) return res.status(400).json({ error: 'quotation_id or order_id required' });
  let q = 'SELECT * FROM messages WHERE company_id=$1';
  const params = [req.companyId];
  if (quotation_id) { params.push(quotation_id); q += ` AND quotation_id=$${params.length}`; }
  if (order_id) { params.push(order_id); q += ` AND order_id=$${params.length}`; }
  q += ' ORDER BY created_at ASC';
  res.json(await db.many(q, params));
});

router.post('/', async (req, res) => {
  const { quotation_id, order_id, body } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'Message body required' });
  if (!quotation_id && !order_id) return res.status(400).json({ error: 'quotation_id or order_id required' });
  const msg = await db.one(
    `INSERT INTO messages (company_id, quotation_id, order_id, sender_id, sender_role, sender_name, body)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.companyId, quotation_id||null, order_id||null, req.user.id, req.user.role, req.user.full_name, body.trim()]
  );
  res.status(201).json(msg);
});

router.put('/:id/read', async (req, res) => {
  await db.query('UPDATE messages SET is_read=true WHERE id=$1 AND company_id=$2', [req.params.id, req.companyId]);
  res.json({ message: 'Marked as read' });
});

// Unread count
router.get('/unread-count', async (req, res) => {
  const { quotation_id } = req.query;
  let q = 'SELECT COUNT(*) as cnt FROM messages WHERE company_id=$1 AND is_read=false AND sender_role=\'customer\'';
  const params = [req.companyId];
  if (quotation_id) { params.push(quotation_id); q += ` AND quotation_id=$${params.length}`; }
  const result = await db.one(q, params);
  res.json({ count: parseInt(result.cnt) });
});

module.exports = router;
