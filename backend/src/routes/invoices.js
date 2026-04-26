const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { authenticate, requireManager } = require('../middleware/auth');
const { uploadToS3 } = require('../services/storage');
const { addInvoiceParseJob } = require('../workers/queue');
const { logger } = require('../utils/logger');

const router = express.Router();
router.use(authenticate);

// Multer config
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only PDF and image files are allowed'));
  }
});

// ============================
// GET invoices
// ============================
router.get('/', requireManager, async (req, res) => {
  try {
    const invoices = await db.manyOrNone(
      `SELECT i.*, COUNT(ii.id) as item_count,
              u.full_name as created_by_name
       FROM invoices i
       LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
       LEFT JOIN users u ON u.id = i.created_by
       WHERE i.company_id = $1
       GROUP BY i.id, u.full_name
       ORDER BY i.created_at DESC
       LIMIT 50`,
      [req.companyId]
    );

    res.json(invoices);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ============================
// GET invoice detail
// ============================
router.get('/:id', requireManager, async (req, res) => {
  try {
    const invoice = await db.oneOrNone(
      'SELECT * FROM invoices WHERE id = $1 AND company_id = $2',
      [req.params.id, req.companyId]
    );

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const items = await db.manyOrNone(
      `SELECT ii.*, i.name as matched_ingredient_name
       FROM invoice_items ii
       LEFT JOIN ingredients i ON i.id = ii.ingredient_id AND i.company_id=$2
       WHERE ii.invoice_id = $1`,
      [req.params.id, req.companyId] // ✅ FIXED
    );

    res.json({ ...invoice, items });

  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ============================
// UPLOAD INVOICE
// ============================
router.post('/upload', requireManager, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { supplier } = req.body;
    if (!supplier) {
      return res.status(400).json({ error: 'Supplier required' });
    }

    const fileKey = `invoices/${req.companyId}/${Date.now()}-${req.file.originalname}`;
    const fileUrl = await uploadToS3(req.file.buffer, fileKey, req.file.mimetype);

    const invoice = await db.one(
      `INSERT INTO invoices 
       (company_id, supplier, file_url, file_name, parse_status, created_by)
       VALUES ($1,$2,$3,$4,'pending',$5)
       RETURNING *`,
      [req.companyId, supplier, fileUrl, req.file.originalname, req.user.id]
    );

    await addInvoiceParseJob({
      invoice_id: invoice.id,
      company_id: req.companyId,
      file_url: fileUrl
    });

    res.status(202).json({
      message: 'Invoice uploaded successfully',
      invoice_id: invoice.id
    });

  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ============================
// CONFIRM ITEMS
// ============================
router.post('/:id/confirm-items', requireManager, async (req, res) => {
  try {
    const { items } = req.body;

    for (const item of items) {
      await db.query(
        `UPDATE invoice_items 
         SET ingredient_id=$1, is_confirmed=true 
         WHERE id=$2 AND invoice_id=$3`, // ✅ FIXED
        [item.ingredient_id, item.id, req.params.id]
      );
    }

    res.json({ message: 'Items confirmed' });

  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;