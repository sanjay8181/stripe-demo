import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  integer,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';

export const webhookEventStatusEnum = pgEnum('webhook_event_status', [
  'pending',
  'processed',
  'skipped',
]);

export const paymentOutcomeStatusEnum = pgEnum('payment_outcome_status', [
  'SUCCEEDED',
  'FAILED',
]);

export const stripeWebhookEvents = pgTable(
  'stripe_webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stripeEventId: varchar('stripe_event_id', { length: 255 })
      .notNull()
      .unique(),
    eventType: varchar('event_type', { length: 255 }).notNull(),
    payload: jsonb('payload').notNull(),
    eventCreatedAt: timestamp('event_created_at', {
      withTimezone: true,
    }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    status: webhookEventStatusEnum('status').notNull().default('pending'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_stripe_webhook_events_stripe_event_id').on(table.stripeEventId),
    index('idx_stripe_webhook_events_event_type').on(table.eventType),
  ],
);

export const paymentOutcomes = pgTable(
  'payment_outcomes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentIntentId: varchar('payment_intent_id', { length: 255 })
      .notNull()
      .unique(),
    status: paymentOutcomeStatusEnum('status').notNull(),
    amount: integer('amount').notNull(),
    currency: varchar('currency', { length: 10 }).notNull(),
    failureCode: varchar('failure_code', { length: 255 }),
    failureMessage: varchar('failure_message', { length: 1024 }),
    sourceEventId: varchar('source_event_id', { length: 255 }).notNull(),
    lastEventCreatedAt: timestamp('last_event_created_at', {
      withTimezone: true,
    }).notNull(),
    lastEventId: varchar('last_event_id', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_payment_outcomes_payment_intent_id').on(table.paymentIntentId),
    index('idx_payment_outcomes_status').on(table.status),
  ],
);
