const express = require('express');
const db = require('../db');
const { authenticate, requireOwner } = require('../middleware/auth');
const router = express.Router();

// GET /api/vendors — Browse vendor directory (no auth needed for browsing)
router.get('/', async (req, res) => {
  const { category, market, search } = req.query;
  let q = 'SELECT * FROM vendors WHERE is_active=true';
  const params = [];
  if (category) { params.push(category); q += ` AND category=$${params.length}`; }
  if (market) { params.push(`%${market}%`); q += ` AND $${params.length}=ANY(markets)`; }
  if (search) { params.push(`%${search}%`); q += ` AND name ILIKE $${params.length}`; }
  q += ' ORDER BY is_verified DESC, name';
  const vendors = await db.many(q, params);
  res.json(vendors);
});

// GET /api/vendors/connected — Company's connected vendors
router.get('/connected', authenticate, async (req, res) => {
  const connections = await db.many(
    `SELECT vc.*, v.name, v.category, v.logo_url, v.api_type, v.commission_pct, v.min_order_amount
     FROM vendor_connections vc JOIN vendors v ON v.id=vc.vendor_id
     WHERE vc.company_id=$1 AND vc.status='connected'`,
    [req.companyId]
  );
  res.json(connections);
});

// POST /api/vendors/:vendorId/connect — Connect a vendor
router.post('/:vendorId/connect', authenticate, requireOwner, async (req, res) => {
  const { api_key } = req.body;
  const vendor = await db.one('SELECT * FROM vendors WHERE id=$1', [req.params.vendorId]);
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

  const connection = await db.one(
    `INSERT INTO vendor_connections (company_id, vendor_id, status, api_key_encrypted)
     VALUES ($1,$2,'connected',$3)
     ON CONFLICT (company_id, vendor_id) DO UPDATE SET status='connected', api_key_encrypted=$3
     RETURNING *`,
    [req.companyId, req.params.vendorId, api_key || null]
  );
  res.status(201).json({ ...connection, vendor_name: vendor.name });
});

// DELETE /api/vendors/:vendorId/disconnect
router.delete('/:vendorId/disconnect', authenticate, requireOwner, async (req, res) => {
  await db.query(
    "UPDATE vendor_connections SET status='disconnected' WHERE company_id=$1 AND vendor_id=$2",
    [req.companyId, req.params.vendorId]
  );
  res.json({ message: 'Vendor disconnected' });
});

module.exports = router;
