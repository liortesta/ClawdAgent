import { pgTable, text, timestamp, integer, boolean, jsonb, uuid, varchar, index, serial, real, doublePrecision } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  platformId: varchar('platform_id', { length: 100 }).notNull(),
  platform: varchar('platform', { length: 20 }).notNull(),
  name: varchar('name', { length: 200 }),
  role: varchar('role', { length: 20 }).default('user').notNull(),
  preferences: jsonb('preferences').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_users_platform').on(table.platform, table.platformId),
]);

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  platform: varchar('platform', { length: 20 }).notNull(),
  title: varchar('title', { length: 200 }),
  isActive: boolean('is_active').default(true).notNull(),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_conversations_user').on(table.userId),
]);

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => conversations.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  role: varchar('role', { length: 20 }).notNull(),
  content: text('content').notNull(),
  agentId: varchar('agent_id', { length: 50 }),
  intent: varchar('intent', { length: 50 }),
  tokensUsed: jsonb('tokens_used'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_messages_conversation').on(table.conversationId),
  index('idx_messages_user').on(table.userId),
]);

export const knowledge = pgTable('knowledge', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  key: varchar('key', { length: 200 }).notNull(),
  value: text('value').notNull(),
  category: varchar('category', { length: 50 }).default('general'),
  confidence: integer('confidence').default(80),
  source: varchar('source', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_knowledge_user').on(table.userId),
]);

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  priority: varchar('priority', { length: 5 }).default('p2').notNull(),
  dueDate: timestamp('due_date'),
  completedAt: timestamp('completed_at'),
  tags: jsonb('tags').default([]),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_tasks_user').on(table.userId),
  index('idx_tasks_status').on(table.status),
]);

export const servers = pgTable('servers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  host: varchar('host', { length: 200 }).notNull(),
  port: integer('port').default(22).notNull(),
  username: varchar('username', { length: 100 }).notNull(),
  authMethod: varchar('auth_method', { length: 20 }).default('key').notNull(),
  encryptedCredential: text('encrypted_credential'),
  status: varchar('status', { length: 20 }).default('unknown'),
  lastChecked: timestamp('last_checked'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_servers_user').on(table.userId),
]);

export const cronTasks = pgTable('cron_tasks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  expression: text('expression').notNull(),
  action: text('action').notNull(),
  actionData: text('action_data').default('{}'),
  platform: text('platform').default('telegram'),
  enabled: boolean('enabled').default(true),
  lastRun: timestamp('last_run'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const documentChunks = pgTable('document_chunks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  text: text('text').notNull(),
  source: text('source').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  embedding: text('embedding').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const usageLogs = pgTable('usage_logs', {
  id: serial('id').primaryKey(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  cost: real('cost').default(0),
  userId: text('user_id').notNull(),
  action: text('action').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// ---------------------------------------------------------------------------
// Crypto Trading tables
// ---------------------------------------------------------------------------

export const exchangeConfigs = pgTable('exchange_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  exchange: varchar('exchange', { length: 50 }).notNull(),      // binance, okx
  encryptedApiKey: text('encrypted_api_key').notNull(),
  encryptedApiSecret: text('encrypted_api_secret').notNull(),
  encryptedPassphrase: text('encrypted_passphrase'),             // OKX only
  isActive: boolean('is_active').default(true).notNull(),
  label: varchar('label', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_exchange_configs_user').on(table.userId),
]);

export const trades = pgTable('trades', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  exchange: varchar('exchange', { length: 50 }).notNull(),
  symbol: varchar('symbol', { length: 30 }).notNull(),           // BTC/USDT
  side: varchar('side', { length: 10 }).notNull(),               // buy, sell
  type: varchar('type', { length: 20 }).default('market'),       // market, limit
  price: doublePrecision('price').notNull(),
  amount: doublePrecision('amount').notNull(),
  cost: doublePrecision('cost').notNull(),                       // price * amount
  fee: doublePrecision('fee').default(0),
  stopLoss: doublePrecision('stop_loss'),
  takeProfit: doublePrecision('take_profit'),
  pnl: doublePrecision('pnl'),                                  // realized P&L
  pnlPercent: doublePrecision('pnl_percent'),
  strategy: varchar('strategy', { length: 50 }),                 // scalping, day-trading, swing, dca
  status: varchar('status', { length: 20 }).default('open').notNull(), // open, closed, cancelled
  isPaper: boolean('is_paper').default(true).notNull(),
  closedAt: timestamp('closed_at'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_trades_user').on(table.userId),
  index('idx_trades_symbol').on(table.symbol),
  index('idx_trades_status').on(table.status),
]);

export const portfolios = pgTable('portfolios', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  exchange: varchar('exchange', { length: 50 }).notNull(),
  asset: varchar('asset', { length: 20 }).notNull(),             // BTC, ETH, USDT
  amount: doublePrecision('amount').default(0).notNull(),
  avgEntryPrice: doublePrecision('avg_entry_price'),
  currentPrice: doublePrecision('current_price'),
  unrealizedPnl: doublePrecision('unrealized_pnl'),
  isPaper: boolean('is_paper').default(true).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_portfolios_user').on(table.userId),
]);

export const tradingSignals = pgTable('trading_signals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  symbol: varchar('symbol', { length: 30 }).notNull(),
  timeframe: varchar('timeframe', { length: 10 }).notNull(),     // 1m, 5m, 15m, 1h, 4h, 1d
  direction: varchar('direction', { length: 10 }).notNull(),     // long, short, neutral
  confidence: doublePrecision('confidence').notNull(),            // 0-100
  strategy: varchar('strategy', { length: 50 }).notNull(),
  entryPrice: doublePrecision('entry_price'),
  stopLoss: doublePrecision('stop_loss'),
  takeProfit: doublePrecision('take_profit'),
  indicators: jsonb('indicators').default({}),                   // RSI, MACD values etc
  outcome: varchar('outcome', { length: 20 }),                   // win, loss, expired, null
  isActive: boolean('is_active').default(true).notNull(),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_signals_symbol').on(table.symbol),
  index('idx_signals_active').on(table.isActive),
]);

export const tradingRiskConfig = pgTable('trading_risk_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  paperMode: boolean('paper_mode').default(true).notNull(),
  maxPositionPercent: doublePrecision('max_position_percent').default(5),
  maxOpenPositions: integer('max_open_positions').default(3),
  maxDailyLossPercent: doublePrecision('max_daily_loss_percent').default(3),
  maxDailyLossUsd: doublePrecision('max_daily_loss_usd').default(100),
  defaultSlPercent: doublePrecision('default_sl_percent').default(2),
  defaultTpPercent: doublePrecision('default_tp_percent').default(4),
  cooldownMinutes: integer('cooldown_minutes').default(5),
  maxLeverage: doublePrecision('max_leverage').default(2),
  allowedPairs: jsonb('allowed_pairs').default([]),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_risk_config_user').on(table.userId),
]);

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
  action: varchar('action', { length: 100 }).notNull(),
  resource: varchar('resource', { length: 100 }),
  details: jsonb('details').default({}),
  ip: varchar('ip', { length: 50 }),
  platform: varchar('platform', { length: 20 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_audit_user').on(table.userId),
  index('idx_audit_action').on(table.action),
]);
