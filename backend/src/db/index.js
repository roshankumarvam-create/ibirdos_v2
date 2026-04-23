const { Pool } = require('pg');
const { logger } = require('../utils/logger');

// ============================================================
// ENV VALIDATION
// ============================================================
if (!process.env.DATABASE_URL) {
  throw new Error('❌ DATABASE_URL missing in .env');
}

// ============================================================
// POOL CONFIG (NEON SAFE)
// ============================================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // ✅ REQUIRED FOR NEON
  ssl: {
    rejectUnauthorized: false,
  },

  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// ============================================================
// ERROR HANDLING
// ============================================================
pool.on('error', (err) => {
  logger.error('Unexpected database error', err);
});

// ============================================================
// DB METHODS
// ============================================================
const db = {
  // basic query
  query: (text, params) => pool.query(text, params),

  // return ONE row (or null)
  one: async (text, params) => {
    const res = await pool.query(text, params);
    return res.rows[0] || null;
  },

  // 🔥 FIXED: oneOrNone (needed by auth)
  oneOrNone: async (text, params) => {
    const res = await pool.query(text, params);
    return res.rows[0] || null;
  },

  // return MANY rows
  many: async (text, params) => {
    const res = await pool.query(text, params);
    return res.rows;
  },

  // same as many but safe (never throws empty)
  manyOrNone: async (text, params) => {
    const res = await pool.query(text, params);
    return res.rows || [];
  },

  // transaction support
  transaction: async (fn) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
};

// ============================================================
// TEST CONNECTION (STARTUP)
// ============================================================
(async () => {
  try {
    await pool.query('SELECT NOW()');
    logger.info('✅ Database connected');
  } catch (err) {
    logger.error('❌ Database connection failed', err);
  }
})();

// ============================================================
module.exports = db;