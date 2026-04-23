require('dotenv').config();
require('express-async-errors');

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { logger } = require('./utils/logger');

// 🔥 START WORKERS (IMPORTANT - THIS WAS MISSING)
require('./workers/queue');

// Routes
const authRoutes = require('./routes/auth');
const companyRoutes = require('./routes/companies');
const ingredientRoutes = require('./routes/ingredients');
const recipeRoutes = require('./routes/recipes');
const inventoryRoutes = require('./routes/inventory');
const invoiceRoutes = require('./routes/invoices');
const orderRoutes = require('./routes/orders');
const eventRoutes = require('./routes/events');
const kitchenRoutes = require('./routes/kitchen');
const { analyticsRouter, alertsRouter } = require('./routes/analytics');
const menuRoutes = require('./routes/menu');
const yieldRoutes = require('./routes/yield');
const quotationRoutes = require('./routes/quotations');
const eventTemplateRoutes = require('./routes/eventTemplates');
const vendorRoutes = require('./routes/vendors');
const financeRoutes = require('./routes/finance');
const adminRoutes = require('./routes/admin');
const messageRoutes = require('./routes/messages');
const reminderRoutes = require('./routes/reminders');
const stripeRoutes = require('./routes/stripe');

const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// ── ENV VALIDATION (IMPORTANT) ───────────────────────────────
if (!process.env.JWT_SECRET) {
  throw new Error('❌ JWT_SECRET missing in .env');
}
if (!process.env.DATABASE_URL) {
  throw new Error('❌ DATABASE_URL missing in .env');
}
if (!process.env.REDIS_URL) {
  console.warn('⚠️ REDIS not configured properly');
}

// ── SECURITY ────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ],
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

// ── RATE LIMIT ──────────────────────────────────────────────
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

app.use('/api/auth', authLimiter);
app.use(limiter);

// ── STRIPE WEBHOOK ──────────────────────────────────────────
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

// ── BODY PARSER ─────────────────────────────────────────────
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

app.use(morgan('combined', {
  stream: { write: msg => logger.info(msg.trim()) }
}));

// ── HEALTH CHECK ────────────────────────────────────────────
app.get('/health', (req, res) => res.json({
  status: 'ok',
  version: '2.0.0',
  timestamp: new Date().toISOString(),
  port: process.env.PORT || 3001
}));

// ── API ROUTES ──────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/ingredients', ingredientRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/kitchen', kitchenRoutes);
app.use('/api/analytics', analyticsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/menu', menuRoutes);
app.use('/api/yield', yieldRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/event-templates', eventTemplateRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/stripe', stripeRoutes);

// ── 404 ─────────────────────────────────────────────────────
app.use((req, res) =>
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` })
);

// ── ERROR HANDLER ───────────────────────────────────────────
app.use(errorHandler);

// ── SERVER START ────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001', 10);

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 iBirdOS backend running on port ${PORT}`);
  logger.info(`Health: http://localhost:${PORT}/health`);
});

// ── GRACEFUL SHUTDOWN ───────────────────────────────────────
process.on('SIGTERM', () => {
  logger.info('Shutting down');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err);
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection', err);
});

module.exports = app;