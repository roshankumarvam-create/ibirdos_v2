const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { authenticate, requireOwner } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

// ============================
// VALIDATION
// ============================
const IngredientSchema = z.object({
  name: z.string().min(1).max(255),
  category: z.string().optional(),
  unit: z.enum(['kg','g','lb','oz','l','ml','each','case','dozen','bunch']),
  current_price: z.number().min(0),
  supplier: z.string().optional(),
  supplier_code: z.string().optional(),
  gl_code: z.string().optional()
});

// ============================
// GET INGREDIENTS
// ============================
router.get('/', async (req, res) => {
  try {
    const { search, category } = req.query;

    let query = `SELECT * FROM ingredients WHERE company_id=$1 AND is_active=true`;
    const params = [req.user.company_id];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND name ILIKE $${params.length}`;
    }

    if (category) {
      params.push(category);
      query += ` AND category=$${params.length}`;
    }

    query += ' ORDER BY category, name';

    const items = await db.manyOrNone(query, params);

    res.json(items);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// CREATE INGREDIENT
// ============================
router.post('/', requireOwner, async (req, res) => {
  try {
    const data = IngredientSchema.parse(req.body);

    const ing = await db.one(
      `INSERT INTO ingredients (company_id, name, category, unit, current_price, supplier, supplier_code, gl_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        req.user.company_id,
        data.name,
        data.category,
        data.unit,
        data.current_price,
        data.supplier,
        data.supplier_code,
        data.gl_code || '5100-COGS'
      ]
    );

    res.status(201).json(ing);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// UPDATE INGREDIENT
// ============================
router.put('/:id', requireOwner, async (req, res) => {
  try {
    const existing = await db.oneOrNone(
      'SELECT id FROM ingredients WHERE id=$1 AND company_id=$2',
      [req.params.id, req.user.company_id]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Ingredient not found' });
    }

    const { name, category, unit, current_price, supplier, supplier_code } = req.body;

    const updated = await db.one(
      `UPDATE ingredients SET
        name=COALESCE($1,name),
        category=COALESCE($2,category),
        unit=COALESCE($3,unit),
        current_price=COALESCE($4,current_price),
        supplier=COALESCE($5,supplier),
        supplier_code=COALESCE($6,supplier_code),
        updated_at=NOW()
       WHERE id=$7 AND company_id=$8 RETURNING *`,
      [
        name,
        category,
        unit,
        current_price,
        supplier,
        supplier_code,
        req.params.id,
        req.user.company_id
      ]
    );

    res.json(updated);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// DELETE (SOFT)
// ============================
router.delete('/:id', requireOwner, async (req, res) => {
  try {
    await db.query(
      'UPDATE ingredients SET is_active=false WHERE id=$1 AND company_id=$2',
      [req.params.id, req.user.company_id]
    );

    res.json({ message: 'Ingredient deactivated' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;