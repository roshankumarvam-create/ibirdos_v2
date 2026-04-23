const { logger } = require('../utils/logger');

// Lazy-load OpenAI only when key exists
function getOpenAI() {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('YOUR')) return null;
  const OpenAI = require('openai');
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const INVOICE_PARSE_PROMPT = `You are a food service invoice parser. Extract ALL line items from this supplier invoice.

For each item return a JSON object:
- raw_name: exact product name as written
- quantity: numeric quantity (number only)
- unit: unit of measure (kg, lb, oz, g, l, ml, each, case, dozen, bunch)
- unit_price: price per unit (number only, no currency symbols)
- total_price: line total (number only)

Rules:
- Normalize units: kilograms→kg, pounds→lb, ounces→oz, liters→l
- Extract ALL items even if partially readable
- If unclear, use null
- Return ONLY a valid JSON array, nothing else`;

const RECIPE_EXTRACT_PROMPT = `You are a culinary recipe parser. Extract recipe details from this document.

Return a JSON object with:
- name: recipe name
- description: brief description (1-2 sentences)
- category: one of (Starter, Main Course, Dessert, Beverage, Side, Sauce)
- servings: number of servings (integer)
- ingredients: array of objects with:
  - name: ingredient name (simple, common name)
  - quantity: numeric amount
  - unit: unit (kg, g, lb, oz, l, ml, cup, tbsp, tsp, each)
- instructions: array of step strings (brief)

Return ONLY valid JSON, nothing else.`;

// ── MOCK DATA for when OpenAI is not configured ───────────────

function mockInvoiceParse() {
  return {
    items: [
      { raw_name: 'Chicken Breast', quantity: 10, unit: 'lb', unit_price: 4.89, total_price: 48.90 },
      { raw_name: 'Basmati Rice 25lb', quantity: 2, unit: 'case', unit_price: 28.50, total_price: 57.00 },
      { raw_name: 'Yellow Onion', quantity: 25, unit: 'lb', unit_price: 0.45, total_price: 11.25 },
      { raw_name: 'Olive Oil Extra Virgin', quantity: 4, unit: 'l', unit_price: 8.50, total_price: 34.00 },
      { raw_name: 'Heavy Cream', quantity: 6, unit: 'l', unit_price: 4.20, total_price: 25.20 },
    ],
    confidence: 75,
    is_mock: true
  };
}

function mockRecipeExtract() {
  return {
    name: 'Classic Chicken Biryani',
    description: 'Aromatic basmati rice layered with spiced chicken, slow-cooked to perfection.',
    category: 'Main Course',
    servings: 4,
    ingredients: [
      { name: 'Chicken Breast', quantity: 2, unit: 'lb' },
      { name: 'Basmati Rice', quantity: 3, unit: 'cup' },
      { name: 'Yellow Onion', quantity: 2, unit: 'each' },
      { name: 'Garam Masala', quantity: 2, unit: 'tbsp' },
      { name: 'Heavy Cream', quantity: 0.5, unit: 'cup' },
      { name: 'Olive Oil', quantity: 3, unit: 'tbsp' },
    ],
    instructions: [
      'Marinate chicken with yogurt and spices for 1 hour',
      'Sauté onions until golden brown',
      'Cook chicken until done, then layer with parcooked rice',
      'Cover and cook on low heat for 20 minutes'
    ],
    is_mock: true
  };
}

// ── INVOICE PARSING ───────────────────────────────────────────

async function parseInvoiceWithAI(fileBuffer, mimeType) {
  const useMock = process.env.USE_MOCK_OCR === 'true';
  const openai = getOpenAI();

  if (useMock || !openai) {
    logger.info('Using mock invoice parser (set USE_MOCK_OCR=false and OPENAI_API_KEY for real parsing)');
    return mockInvoiceParse();
  }

  try {
    let content;

    if (mimeType === 'application/pdf') {
      const pdfParse = require('pdf-parse');
      const pdfData = await pdfParse(fileBuffer);
      const text = pdfData.text?.trim();
      if (text && text.length > 50) {
        const response = await openai.chat.completions.create({
          model: 'gpt-mini',
          max_tokens: 2000,
          messages: [{ role: 'user', content: `${INVOICE_PARSE_PROMPT}\n\nInvoice text:\n${text.substring(0, 8000)}` }]
        });
        content = response.choices[0].message.content;
      }
    }

    if (!content) {
      const base64 = fileBuffer.toString('base64');
      const response = await openai.chat.completions.create({
        model: 'gpt-mini',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: INVOICE_PARSE_PROMPT },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' } }
          ]
        }]
      });
      content = response.choices[0].message.content;
    }

    return parseAIResponse(content);
  } catch (err) {
    logger.error('OpenAI invoice parse error', err.message);
    logger.info('Falling back to mock parser');
    return mockInvoiceParse();
  }
}

// ── RECIPE EXTRACTION ─────────────────────────────────────────

async function extractRecipeFromFile(fileBuffer, mimeType, fileName) {
  const useMock = process.env.USE_MOCK_OCR === 'true';
  const openai = getOpenAI();

  if (useMock || !openai) {
    logger.info('Using mock recipe extractor');
    return mockRecipeExtract();
  }

  try {
    let textContent = null;

    if (mimeType === 'application/pdf') {
      const pdfParse = require('pdf-parse');
      const pdfData = await pdfParse(fileBuffer);
      textContent = pdfData.text;
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      // DOCX — extract text via mammoth
      try {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        textContent = result.value;
      } catch { /* fall through to vision */ }
    }

    let response;
    if (textContent && textContent.length > 30) {
      response = await openai.chat.completions.create({
        model: 'gpt-mini',
        max_tokens: 2000,
        messages: [{ role: 'user', content: `${RECIPE_EXTRACT_PROMPT}\n\nDocument content:\n${textContent.substring(0, 8000)}` }]
      });
    } else {
      const base64 = fileBuffer.toString('base64');
      response = await openai.chat.completions.create({
        model: 'gpt-mini',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: RECIPE_EXTRACT_PROMPT },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' } }
          ]
        }]
      });
    }

    const parsed = parseJsonResponse(response.choices[0].message.content);
    return parsed;
  } catch (err) {
    logger.error('Recipe extraction error', err.message);
    return mockRecipeExtract();
  }
}

// ── HELPERS ───────────────────────────────────────────────────

function parseAIResponse(content) {
  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  let items;
  try {
    items = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) items = JSON.parse(match[0]);
    else return { items: [], confidence: 0 };
  }
  if (!Array.isArray(items)) return { items: [], confidence: 0 };
  const validated = items.filter(i => i.raw_name).map(item => ({
    raw_name: String(item.raw_name).trim().substring(0, 255),
    quantity: parseFloat(item.quantity) || null,
    unit: normalizeUnit(item.unit),
    unit_price: parseFloat(item.unit_price) || null,
    total_price: parseFloat(item.total_price) || null
  })).filter(i => i.unit_price !== null);
  const confidence = validated.length > 0
    ? Math.round(validated.filter(i => i.quantity && i.unit && i.unit_price).length / validated.length * 100)
    : 0;
  return { items: validated, confidence };
}

function parseJsonResponse(content) {
  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try { return JSON.parse(cleaned); }
  catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Could not parse JSON from response');
  }
}

function normalizeUnit(unit) {
  if (!unit) return 'each';
  const u = String(unit).toLowerCase().trim();
  const map = {
    'kilogram':'kg','kilograms':'kg','kilo':'kg','kilos':'kg',
    'gram':'g','grams':'g','gm':'g','gms':'g',
    'pound':'lb','pounds':'lb','lbs':'lb',
    'ounce':'oz','ounces':'oz',
    'liter':'l','liters':'l','litre':'l','litres':'l',
    'milliliter':'ml','milliliters':'ml',
    'piece':'each','pieces':'each','pc':'each','pcs':'each','unit':'each','units':'each',
    'bunch':'bunch','bunches':'bunch',
    'dozen':'dozen','doz':'dozen',
    'case':'case','cases':'case','ctn':'case','carton':'case',
    'cup':'cup','cups':'cup','tablespoon':'tbsp','tablespoons':'tbsp',
    'teaspoon':'tsp','teaspoons':'tsp'
  };
  return map[u] || u.substring(0, 10);
}

async function matchIngredientsToDatabase(items, companyId, db) {
  const results = [];
  for (const item of items) {
    const match = await db.one(
      `SELECT id, name, current_price, unit FROM ingredients
       WHERE company_id=$1 AND LOWER(name) LIKE LOWER($2)
       ORDER BY LENGTH(name) ASC LIMIT 1`,
      [companyId, `%${item.raw_name.split(' ')[0]}%`]
    ).catch(() => null);

    const previousPrice = match?.current_price || null;
    const priceChangePct = previousPrice && item.unit_price
      ? ((item.unit_price - previousPrice) / previousPrice) * 100 : null;

    results.push({
      ...item,
      ingredient_id: match?.id || null,
      matched_name: match?.name || null,
      previous_unit_price: previousPrice,
      price_change_percent: priceChangePct ? parseFloat(priceChangePct.toFixed(2)) : null,
      alert_triggered: priceChangePct !== null && (Math.abs(priceChangePct) >= 5 || Math.abs(item.unit_price - (previousPrice || 0)) >= 0.15)
    });
  }
  return results;
}

module.exports = {
  parseInvoiceWithAI,
  extractRecipeFromFile,
  matchIngredientsToDatabase,
  normalizeUnit
};
