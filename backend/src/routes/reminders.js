const express = require('express');
const db = require('../db');
const { authenticate, requireManager } = require('../middleware/auth');
const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const { done, type } = req.query;
  let query = `SELECT r.*, u.full_name as created_by_name FROM reminders r
    LEFT JOIN users u ON u.id=r.created_by WHERE r.company_id=$1`;
  const params = [req.companyId];
  if (done === 'false') query += ' AND r.is_done=false';
  if (done === 'true') query += ' AND r.is_done=true';
  if (type) { params.push(type); query += ` AND r.reminder_type=$${params.length}`; }
  query += ' ORDER BY r.due_at ASC LIMIT 100';
  res.json(await db.many(query, params));
});

router.get('/due', async (req, res) => {
  const due = await db.many(
    `SELECT * FROM reminders WHERE company_id=$1 AND is_done=false
     AND due_at <= NOW() + INTERVAL '24 hours' ORDER BY due_at ASC`,
    [req.companyId]
  );
  res.json(due);
});

router.post('/', requireManager, async (req, res) => {
  const { title, body, reminder_type, related_type, related_id, due_at, notify_email } = req.body;
  if (!title || !due_at) return res.status(400).json({ error: 'title and due_at required' });
  const r = await db.one(
    `INSERT INTO reminders (company_id, created_by, title, body, reminder_type, related_type, related_id, due_at, notify_email)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.companyId, req.user.id, title, body||null, reminder_type||'general',
     related_type||null, related_id||null, due_at, notify_email !== false]
  );
  res.status(201).json(r);
});

router.put('/:id/done', async (req, res) => {
  const r = await db.one(
    'UPDATE reminders SET is_done=true, done_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *',
    [req.params.id, req.companyId]
  );
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.json(r);
});

router.delete('/:id', requireManager, async (req, res) => {
  await db.query('DELETE FROM reminders WHERE id=$1 AND company_id=$2', [req.params.id, req.companyId]);
  res.json({ message: 'Deleted' });
});

module.exports = router;
