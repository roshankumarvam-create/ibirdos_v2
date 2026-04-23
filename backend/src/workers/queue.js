const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const db = require('../db');
const { parseInvoiceWithAI, matchIngredientsToDatabase } = require('../services/ocr');
const { logger } = require('../utils/logger');

// ============================================================
// REDIS CONNECTION (PRODUCTION SAFE)
// ============================================================

if (!process.env.REDIS_URL) {
  throw new Error('❌ REDIS_URL missing in .env');
}

const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  tls: {}
});

connection.on('connect', () => {
  console.log('✅ Redis connected');
});

connection.on('error', (err) => {
  console.error('❌ Redis error:', err.message);
});

// ============================================================
// QUEUES
// ============================================================

const invoiceQueue = new Queue('invoice-parse', { connection });
const recipeQueue = new Queue('recipe-recalculate', { connection });
const alertQueue = new Queue('alert-dispatch', { connection });
const analyticsQueue = new Queue('analytics-snapshot', { connection });

// ============================================================
// INVOICE PARSE WORKER
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
              item.total_price
            ]
          );
        }

        await client.query(
          `UPDATE invoices SET parse_status='done', parse_confidence=$1 WHERE id=$2`,
          [confidence, invoice_id]
        );
      });

      logger.info(`Invoice ${invoice_id} parsed`);
    } catch (err) {
      logger.error(`Invoice parse failed`, err);
      throw err;
    }
  },
  { connection }
);

// ============================================================
// SIMPLE WORKERS
// ============================================================

const recipeWorker = new Worker(
  'recipe-recalculate',
  async () => {},
  { connection }
);

const alertWorker = new Worker(
  'alert-dispatch',
  async () => {},
  { connection }
);

const analyticsWorker = new Worker(
  'analytics-snapshot',
  async () => {},
  { connection }
);

// ============================================================
// EXPORT HELPERS
// ============================================================

async function addInvoiceParseJob(data) {
  return await invoiceQueue.add('parse', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 }
  });
}

module.exports = {
  addInvoiceParseJob,
  invoiceQueue
};