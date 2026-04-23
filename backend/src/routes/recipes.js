const express = require('express');
const { z } = require('zod');
const multer = require('multer');
const db = require('../db');
const { authenticate, CAN_SEE_FINANCIALS } = require('../middleware/auth');
const { extractRecipeFromFile } = require('../services/recipeOcr');

const router = express.Router();
router.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const RecipeSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.string().optional(),
  cuisine: z.string().optional(),
  servings: z.number().int().positive().default(1),
  markup_percent: z.number().min(0).max(1000).optional(),
  ingredients: z.array(z.object({
    ingredient_id: z.string().uuid(),
    quantity: z.number().positive(),
    unit: z.string()
  })).min(1)
});


// ============================
// PERMISSION HELPERS
// ============================
function canEdit(user, recipe) {
  if (user.role === 'owner') return true;
  if (user.role === 'manager') return true;
  if (user.role === 'staff' && recipe.created_by === user.id) return true;
  return false;
}

function canDelete(user, recipe) {
  if (user.role === 'owner') return true;
  if (user.role === 'manager') return true;
  if (user.role === 'staff' && recipe.created_by === user.id) return true;
  return false;
}


// ============================
// GET ALL RECIPES
// ============================
router.get('/', async (req, res) => {

  const canSeeFinancials = CAN_SEE_FINANCIALS.has(req.user.role);

  const recipes = await db.manyOrNone(
    `SELECT 
        r.id,
        r.name,
        r.category,
        r.servings,
        r.created_by,
        u.full_name as created_by_name,
        u.role as created_by_role,
        ${canSeeFinancials ? 'r.base_cost, r.markup_percent, r.food_cost_percent,' : ''}
        COUNT(ri.id) as ingredient_count
     FROM recipes r
     LEFT JOIN users u ON u.id = r.created_by
     LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
     WHERE r.company_id = $1 AND r.is_active = true
     GROUP BY r.id, u.full_name, u.role
     ORDER BY r.name`,
    [req.companyId]
  );

  res.json(recipes);
});


// ============================
// GET SINGLE RECIPE
// ============================
router.get('/:id', async (req, res) => {

  const recipe = await db.oneOrNone(
    `SELECT r.*, u.full_name as created_by_name, u.role as created_by_role
     FROM recipes r
     LEFT JOIN users u ON u.id = r.created_by
     WHERE r.id=$1 AND r.company_id=$2`,
    [req.params.id, req.companyId]
  );

  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

  const ingredients = await db.manyOrNone(
    `SELECT ri.*, i.name as ingredient_name, i.current_price
     FROM recipe_ingredients ri
     JOIN ingredients i ON i.id = ri.ingredient_id
     WHERE ri.recipe_id=$1`,
    [req.params.id]
  );

  res.json({ ...recipe, ingredients });
});


// ============================
// CREATE (ALLOW STAFF)
// ============================
router.post('/', async (req, res) => {

  const data = RecipeSchema.parse(req.body);

  const recipeId = await db.transaction(async (client) => {

    const r = await client.query(
      `INSERT INTO recipes
       (company_id, name, description, category, cuisine, servings, markup_percent, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [
        req.companyId,
        data.name,
        data.description,
        data.category,
        data.cuisine,
        data.servings,
        data.markup_percent || 150,
        req.user.id
      ]
    );

    const id = r.rows[0].id;

    for (const ing of data.ingredients) {

      const i = await client.query(
        'SELECT current_price FROM ingredients WHERE id=$1',
        [ing.ingredient_id]
      );

      const price = i.rows[0]?.current_price || 0;

      await client.query(
        `INSERT INTO recipe_ingredients
         (recipe_id, ingredient_id, quantity, unit, unit_cost_snapshot, line_cost)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, ing.ingredient_id, ing.quantity, ing.unit, price, ing.quantity * price]
      );
    }

    await client.query('SELECT recalculate_recipe_cost($1)', [id]);

    return id;
  });

  const recipe = await db.one('SELECT * FROM recipes WHERE id=$1', [recipeId]);
  res.status(201).json(recipe);
});


// ============================
// UPDATE
// ============================
router.put('/:id', async (req, res) => {

  const recipe = await db.oneOrNone(
    'SELECT * FROM recipes WHERE id=$1 AND company_id=$2',
    [req.params.id, req.companyId]
  );

  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

  if (!canEdit(req.user, recipe)) {
    return res.status(403).json({ error: 'Not allowed to edit this recipe' });
  }

  const { name, description, category, cuisine, markup_percent, ingredients } = req.body;

  await db.transaction(async (client) => {

    await client.query(
      `UPDATE recipes SET
       name=COALESCE($1,name),
       description=COALESCE($2,description),
       category=COALESCE($3,category),
       cuisine=COALESCE($4,cuisine),
       markup_percent=COALESCE($5,markup_percent)
       WHERE id=$6`,
      [name, description, category, cuisine, markup_percent, req.params.id]
    );

    if (ingredients) {

      await client.query('DELETE FROM recipe_ingredients WHERE recipe_id=$1', [req.params.id]);

      for (const ing of ingredients) {

        const i = await client.query(
          'SELECT current_price FROM ingredients WHERE id=$1',
          [ing.ingredient_id]
        );

        const price = i.rows[0]?.current_price || 0;

        await client.query(
          `INSERT INTO recipe_ingredients
           (recipe_id, ingredient_id, quantity, unit, unit_cost_snapshot, line_cost)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [req.params.id, ing.ingredient_id, ing.quantity, ing.unit, price, ing.quantity * price]
        );
      }
    }

    await client.query('SELECT recalculate_recipe_cost($1)', [req.params.id]);
  });

  const updated = await db.one('SELECT * FROM recipes WHERE id=$1', [req.params.id]);
  res.json(updated);
});


// ============================
// DELETE
// ============================
router.delete('/:id', async (req, res) => {

  const recipe = await db.oneOrNone(
    'SELECT * FROM recipes WHERE id=$1 AND company_id=$2',
    [req.params.id, req.companyId]
  );

  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

  if (!canDelete(req.user, recipe)) {
    return res.status(403).json({ error: 'Not allowed to delete this recipe' });
  }

  await db.query(
    'UPDATE recipes SET is_active=false WHERE id=$1',
    [req.params.id]
  );

  res.json({ message: 'Recipe deleted' });
});


// ============================
// OCR EXTRACT
// ============================
router.post('/extract', upload.single('file'), async (req, res) => {

  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const extracted = await extractRecipeFromFile(
    req.file.buffer,
    req.file.mimetype,
    req.file.originalname
  );

  res.json(extracted);
});


module.exports = router;