const { logger } = require('../utils/logger');
const { ZodError } = require('zod');

function errorHandler(err, req, res, next) {
  // Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
    });
  }

  // Known business errors
  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  // Postgres unique violation
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Record already exists' });
  }

  // Postgres foreign key violation
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced record not found' });
  }

  // Log unexpected errors
  logger.error('Unhandled error', { error: err.message, stack: err.stack, url: req.url, method: req.method });

  res.status(500).json({ error: 'Internal server error' });
}

module.exports = { errorHandler };
