const express = require('express');
const db = require('../db');
const { authenticate, requireStaff, requireOwner } = require('../middleware/auth');
const { uploadToS3 } = require('../services/storage');
const multer = require('multer');
const router = express.Router();
router.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ============================================================
// POST /api/yield — Log a yield measurement
// ============================================================
router.post('/', requireStaff, upload.array('photos', 5), async (req, res) => {
  const { ingredient_id, event_id, recipe_id, starting_weight_oz, trim_loss_oz,
          final_yield_oz, cooking_method, notes } = req.body;

  if (!ingredient_id || !starting_weight_oz) {
    return res.status(400).json({ error: 'ingredient_id and starting_weight_oz required' });
  }

  // Upload photos if attached
  const photoUrls = [];
  if (req.files?.length) {
    for (const file of req.files) {
      const key = `yield/${req.companyId}/${Date.now()}-${file.originalname}`;
      const url = await uploadToS3(file.buffer, key, file.mimetype);
      photoUrls.push(url);
    }
  }

  const log = await db.one(
    `INSERT INTO yield_logs
     (company_id, location_id, ingredient_id, event_id, recipe_id,
      starting_weight_oz, trim_loss_oz, final_yield_oz, cooking_method, notes, photo_urls, logged_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [req.companyId, req.user.location_id, ingredient_id,
     event_id || null, recipe_id || null,
     parseFloat(starting_weight_oz),
     parseFloat(trim_loss_oz || 0),
     final_yield_oz ? parseFloat(final_yield_oz) : null,
     cooking_method || null, notes || null,
     photoUrls.length ? `{${photoUrls.join(',')}}` : '{}',
     req.user.id]
  );

  // Update prediction after each new log
  await updateYieldPrediction(req.companyId, ingredient_id, recipe_id || null);

  // Get ingredient name for response
  const ingredient = await db.one('SELECT name FROM ingredients WHERE id=$1', [ingredient_id]);
  res.status(201).json({ ...log, ingredient_name: ingredient.name });
});

// ============================================================
// GET /api/yield — List yield logs
// ============================================================
router.get('/', async (req, res) => {
  const { ingredient_id, event_id, limit = 50 } = req.query;
  let query = `
    SELECT yl.*, i.name as ingredient_name, i.unit,
           u.full_name as logged_by_name,
           e.name as event_name
    FROM yield_logs yl
    JOIN ingredients i ON i.id = yl.ingredient_id
    LEFT JOIN users u ON u.id = yl.logged_by
    LEFT JOIN events e ON e.id = yl.event_id
    WHERE yl.company_id = $1
  `;
  const params = [req.companyId];
  if (ingredient_id) { params.push(ingredient_id); query += ` AND yl.ingredient_id = $${params.length}`; }
  if (event_id) { params.push(event_id); query += ` AND yl.event_id = $${params.length}`; }
  query += ` ORDER BY yl.logged_at DESC LIMIT $${params.length + 1}`;
  params.push(parseInt(limit));

  const logs = await db.many(query, params);
  res.json(logs);
});

// ============================================================
// GET /api/yield/predictions — Get yield predictions per ingredient
// ============================================================
router.get('/predictions', async (req, res) => {
  const { ingredient_id } = req.query;
  let query = `
    SELECT yp.*, i.name as ingredient_name, i.unit
    FROM yield_predictions yp
    JOIN ingredients i ON i.id = yp.ingredient_id
    WHERE yp.company_id = $1
  `;
  const params = [req.companyId];
  if (ingredient_id) { params.push(ingredient_id); query += ` AND yp.ingredient_id = $${params.length}`; }
  query += ' ORDER BY i.name';
  const predictions = await db.many(query, params);
  res.json(predictions);
});

// ============================================================
// GET /api/yield/summary — Chef dashboard summary
// ============================================================
router.get('/summary', async (req, res) => {
  const { days = 30 } = req.query;

  // Per-ingredient avg yield
  const byIngredient = await db.many(
    `SELECT
       i.id, i.name, i.unit,
       COUNT(yl.id) as log_count,
       AVG(yl.yield_pct) as avg_yield_pct,
       AVG(yl.waste_pct) as avg_waste_pct,
       SUM(yl.trim_loss_oz) as total_trim_loss_oz,
       SUM(yl.trim_loss_oz * i.current_price / 16) as waste_cost_usd
     FROM yield_logs yl
     JOIN ingredients i ON i.id = yl.ingredient_id
     WHERE yl.company_id = $1 AND yl.logged_at >= NOW() - ($2 || ' days')::interval
     GROUP BY i.id, i.name, i.unit, i.current_price
     ORDER BY waste_cost_usd DESC`,
    [req.companyId, days]
  );

  // Total waste cost
  const totals = await db.one(
    `SELECT
       COALESCE(SUM(yl.trim_loss_oz * i.current_price / 16), 0) as total_waste_cost,
       COALESCE(AVG(yl.yield_pct), 0) as overall_avg_yield_pct,
       COUNT(yl.id) as total_logs
     FROM yield_logs yl JOIN ingredients i ON i.id = yl.ingredient_id
     WHERE yl.company_id = $1 AND yl.logged_at >= NOW() - ($2 || ' days')::interval`,
    [req.companyId, days]
  );

  res.json({ by_ingredient: byIngredient, totals, period_days: days });
});

// ============================================================
// POST /api/yield/predict/:ingredientId — Refresh prediction
// ============================================================
router.post('/predict/:ingredientId', requireStaff, async (req, res) => {
  const prediction = await updateYieldPrediction(req.companyId, req.params.ingredientId, null);
  res.json(prediction);
});

// ============================================================
// Helper: Calculate rolling avg yield prediction
// ============================================================
async function updateYieldPrediction(companyId, ingredientId, recipeId) {
  // Use last 20 logs for prediction
  const logs = await db.many(
    `SELECT yield_pct, waste_pct, starting_weight_oz, final_yield_oz
     FROM yield_logs
     WHERE company_id=$1 AND ingredient_id=$2
       ${recipeId ? 'AND recipe_id=$3' : ''}
     ORDER BY logged_at DESC LIMIT 20`,
    recipeId ? [companyId, ingredientId, recipeId] : [companyId, ingredientId]
  );

  if (logs.length === 0) return null;

  const count = logs.length;
  // Weighted average (more recent logs count more)
  let weightedYield = 0, weightedWaste = 0, totalWeight = 0;
  logs.forEach((log, idx) => {
    const weight = count - idx; // most recent = highest weight
    weightedYield += parseFloat(log.yield_pct || 0) * weight;
    weightedWaste += parseFloat(log.waste_pct || 0) * weight;
    totalWeight += weight;
  });

  const predictedYield = weightedYield / totalWeight;
  const predictedWaste = weightedWaste / totalWeight;
  const avgStarting = logs.reduce((s, l) => s + parseFloat(l.starting_weight_oz), 0) / count;
  const avgFinal = logs.reduce((s, l) => s + parseFloat(l.final_yield_oz || 0), 0) / count;

  // Confidence: higher with more samples, capped at 95%
  const confidence = Math.min(95, 50 + count * 2.5);

  const prediction = await db.one(
    `INSERT INTO yield_predictions
     (company_id, ingredient_id, recipe_id, predicted_yield_pct, predicted_waste_pct,
      confidence_score, sample_count, avg_starting_oz, avg_final_oz)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (company_id, ingredient_id, recipe_id)
     DO UPDATE SET
       predicted_yield_pct=EXCLUDED.predicted_yield_pct,
       predicted_waste_pct=EXCLUDED.predicted_waste_pct,
       confidence_score=EXCLUDED.confidence_score,
       sample_count=EXCLUDED.sample_count,
       avg_starting_oz=EXCLUDED.avg_starting_oz,
       avg_final_oz=EXCLUDED.avg_final_oz,
       computed_at=NOW()
     RETURNING *`,
    [companyId, ingredientId, recipeId,
     predictedYield.toFixed(2), predictedWaste.toFixed(2),
     confidence.toFixed(1), count,
     avgStarting.toFixed(4), avgFinal.toFixed(4)]
  );

  return prediction;
}

module.exports = router;
