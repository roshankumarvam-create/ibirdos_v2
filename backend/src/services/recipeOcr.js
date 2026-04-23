const OpenAI = require('openai');
const { logger } = require('../utils/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const RECIPE_EXTRACT_PROMPT = `You are a professional chef's recipe parser. Extract structured recipe data from this document.

Return ONLY valid JSON with this exact structure:
{
  "name": "Recipe name",
  "description": "Brief description",
  "category": "Main Course|Starter|Dessert|Beverage|Side|Other",
  "servings": 4,
  "ingredients": [
    {
      "name": "Ingredient name (normalized, lowercase)",
      "quantity": 0.5,
      "unit": "kg|g|lb|oz|l|ml|each|case|dozen|bunch",
      "notes": "optional prep note"
    }
  ],
  "instructions": ["Step 1...", "Step 2..."],
  "prep_time_minutes": 15,
  "cook_time_minutes": 30
}

Rules:
- Normalize all ingredient names (e.g. "Chicken Breast" not "boneless skinless chicken")
- Convert all units to standard: kg, g, lb, oz, l, ml, each, case, dozen, bunch
- If quantity is a range (1-2 cups) use the average
- Return ONLY the JSON object, no explanation, no markdown`;

// ============================================================
// Extract recipe from PDF/image/DOCX using AI
// ============================================================
async function extractRecipeFromFile(fileBuffer, mimeType, fileName) {
  // Check if mock mode
  if (process.env.USE_MOCK_OCR === 'true' || !process.env.OPENAI_API_KEY) {
    return getMockRecipeExtraction(fileName);
  }

  try {
    const base64 = fileBuffer.toString('base64');

    if (mimeType === 'application/pdf' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      // For PDFs and DOCX: extract text first, then parse
      return await extractFromText(fileBuffer, mimeType);
    } else {
      // For images: use vision
      return await extractFromImage(base64, mimeType);
    }
  } catch (err) {
    logger.error('Recipe extraction failed', err);
    if (process.env.USE_MOCK_OCR !== 'false') {
      return getMockRecipeExtraction(fileName);
    }
    throw err;
  }
}

async function extractFromImage(base64, mimeType) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: RECIPE_EXTRACT_PROMPT },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' } }
      ]
    }]
  });
  return parseAIResponse(response.choices[0].message.content);
}

async function extractFromText(fileBuffer, mimeType) {
  let text = '';

  if (mimeType === 'application/pdf') {
    try {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(fileBuffer);
      text = data.text;
    } catch (err) {
      // Fall back to treating buffer as text
      text = fileBuffer.toString('utf8').substring(0, 8000);
    }
  } else {
    // DOCX - extract raw text (simplified)
    text = fileBuffer.toString('utf8').replace(/<[^>]+>/g, ' ').substring(0, 8000);
  }

  if (!text.trim()) throw new Error('No text could be extracted from file');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `${RECIPE_EXTRACT_PROMPT}\n\nDocument text:\n${text.substring(0, 6000)}`
    }]
  });
  return parseAIResponse(response.choices[0].message.content);
}

function parseAIResponse(content) {
  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  let data;
  try {
    data = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI returned invalid JSON');
    data = JSON.parse(match[0]);
  }

  // Validate and sanitize
  if (!data.name) throw new Error('No recipe name found in document');

  return {
    name: String(data.name || '').trim().substring(0, 255),
    description: String(data.description || '').trim().substring(0, 1000),
    category: String(data.category || 'Main Course').trim(),
    servings: parseInt(data.servings) || 1,
    ingredients: (data.ingredients || []).map(ing => ({
      name: String(ing.name || '').trim().toLowerCase(),
      quantity: parseFloat(ing.quantity) || 1,
      unit: normalizeUnit(ing.unit),
      notes: ing.notes || null
    })).filter(i => i.name),
    instructions: Array.isArray(data.instructions) ? data.instructions : [],
    prep_time_minutes: parseInt(data.prep_time_minutes) || null,
    cook_time_minutes: parseInt(data.cook_time_minutes) || null
  };
}

function normalizeUnit(unit) {
  if (!unit) return 'each';
  const u = String(unit).toLowerCase().trim();
  const map = {
    'kilogram': 'kg', 'kilograms': 'kg', 'kilo': 'kg', 'kilos': 'kg',
    'gram': 'g', 'grams': 'g', 'gm': 'g', 'gms': 'g',
    'pound': 'lb', 'pounds': 'lb', 'lbs': 'lb',
    'ounce': 'oz', 'ounces': 'oz',
    'liter': 'l', 'liters': 'l', 'litre': 'l', 'litres': 'l',
    'milliliter': 'ml', 'milliliters': 'ml', 'millilitre': 'ml',
    'cup': 'ml', 'cups': 'ml', // approximate
    'tablespoon': 'ml', 'tbsp': 'ml',
    'teaspoon': 'ml', 'tsp': 'ml',
    'piece': 'each', 'pieces': 'each', 'pc': 'each', 'pcs': 'each',
    'unit': 'each', 'units': 'each', 'item': 'each', 'items': 'each',
    'bunch': 'bunch', 'bunches': 'bunch',
    'dozen': 'dozen', 'doz': 'dozen',
    'case': 'case', 'cases': 'case', 'ctn': 'case', 'carton': 'case'
  };
  return map[u] || (Object.values({ kg: 'kg', g: 'g', lb: 'lb', oz: 'oz', l: 'l', ml: 'ml', each: 'each', case: 'case', dozen: 'dozen', bunch: 'bunch' }).includes(u) ? u : 'each');
}

function getMockRecipeExtraction(fileName) {
  return {
    name: fileName ? fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') : 'Extracted Recipe',
    description: 'Recipe extracted from uploaded document (mock mode)',
    category: 'Main Course',
    servings: 4,
    ingredients: [
      { name: 'chicken breast', quantity: 0.5, unit: 'kg', notes: 'boneless' },
      { name: 'olive oil', quantity: 0.03, unit: 'l', notes: null },
      { name: 'yellow onion', quantity: 0.25, unit: 'kg', notes: 'diced' },
      { name: 'tomatoes', quantity: 0.3, unit: 'kg', notes: null }
    ],
    instructions: [
      'Heat oil in pan over medium heat',
      'Add onion and cook until softened',
      'Add chicken and cook through',
      'Add tomatoes and simmer 10 minutes'
    ],
    prep_time_minutes: 15,
    cook_time_minutes: 25,
    _mock: true
  };
}

module.exports = { extractRecipeFromFile };
