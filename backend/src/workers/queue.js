const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const db = require('../db');
const { parseInvoiceWithAI, matchIngredientsToDatabase } = require('../services/ocr');
const { logger } = require('../utils/logger');

// ============================================================
// REDIS CONNECTION
// ============================================================

if (!process.env.REDIS_URL) {
  throw new Error('❌ REDIS_URL missing in .env');
}

const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  ...(process.env.REDIS_URL.includes('rediss') && { tls: {} }),
});

connection.on('connect', () => console.log('✅ Redis connected'));
connection.on('error', (err) => console.error('❌ Redis error:', err.message));

// ============================================================
// QUEUES
// ============================================================

const invoiceQueue = new Queue('invoice-parse', { connection });
const recipeQueue = new Queue('recipe-recalculate', { connection });
const alertQueue = new Queue('alert-dispatch', { connection });
const analyticsQueue = new Queue('analytics-snapshot', { connection });

// ============================================================
// INVOICE WORKER (ON-DEMAND)
// ============================================================

const invoiceWorker = new Worker(
  'invoice-parse',
  async (job) => {
    const { invoice_id, company_id, file_buffer, file_type } = job.data;

    logger.info(`Processing invoice ${invoice_id}`);

    await db.query(
      `UPDATE invoices SET parse_status='processing' WHERE id=$1`,
      [invoice_id]
    );

    try {
      const buffer = Buffer.from(file_buffer, 'base64');

      const { items, confidence } = await parseInvoiceWithAI(buffer, file_type);

      if (!items.length) {
        await db.query(
          `UPDATE invoices SET parse_status='failed' WHERE id=$1`,
          [invoice_id]
        );
        return;
      }

      const matchedItems = await matchIngredientsToDatabase(items, company_id, db);

      await db.transaction(async (client) => {
        for (const item of matchedItems) {
          await client.query(
            `INSERT INTO invoice_items
            (invoice_id, ingredient_id, raw_name, quantity, unit, unit_price, total_price)
            VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [
              invoice_id,
              item.ingredient_id,
              item.raw_name,
              item.quantity,
              item.unit,
              item.unit_price,
              item.total_price,
            ]
          );
        }

        await client.query(
          `UPDATE invoices SET parse_status='done', parse_confidence=$1 WHERE id=$2`,
          [confidence, invoice_id]
        );
      });

      // 🔥 ALERT LOGIC (event-based, no always-running worker needed)
      // Example: detect price change
      for (const item of matchedItems) {
        if (item.old_price && item.unit_price > item.old_price) {
          await db.query(
            `INSERT INTO alerts (company_id, message)
             VALUES ($1, $2)`,
            [company_id, `${item.raw_name} price increased`]
          );
        }
      }

      logger.info(`Invoice ${invoice_id} parsed`);
    } catch (err) {
      logger.error(`Invoice parse failed`, err);
      throw err;
    }
  },
  { connection }
);

// ============================================================
// SHARED WORKER (runs ONLY when jobs exist)
// ============================================================

const sharedWorker = new Worker(
  'shared-jobs',
  async (job) => {
    if (job.name === 'recipe-recalculate') {
      await db.query('SELECT recalculate_recipe_cost($1)', [job.data.recipe_id]);
      logger.info(`Recipe recalculated: ${job.data.recipe_id}`);
    }

    if (job.name === 'daily-analytics') {
      // example placeholder
      logger.info('Running daily analytics snapshot');
    }

    if (job.name === 'daily-alert-check') {
      // example placeholder
      logger.info('Running daily alert check');
    }
  },
  { connection }
);

// ============================================================
// JOB HELPERS
// ============================================================

// run when invoice uploaded
async function addInvoiceParseJob(data) {
  return invoiceQueue.add('parse', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  });
}

// run when recipe created (ON DEMAND)
async function addRecipeRecalculateJob(recipe_id) {
  return recipeQueue.add('recipe-recalculate', { recipe_id });
}

// run ONCE per day (scheduled, not continuous)
async function scheduleDailyJobs() {
  await analyticsQueue.add(
    'daily-analytics',
    {},
    { repeat: { cron: '0 2 * * *' } } // 2 AM daily
  );

  await alertQueue.add(
    'daily-alert-check',
    {},
    { repeat: { cron: '0 9 * * *' } } // 9 AM daily
  );
}

module.exports = {
  addInvoiceParseJob,
  addRecipeRecalculateJob,
  scheduleDailyJobs,
  invoiceQueue,
};