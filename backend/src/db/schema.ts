import { pgTable, uuid, text, timestamp, integer, pgEnum, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const accountTypeEnum = pgEnum('account_type', ['homeowner', 'contractor', 'property_owner', 'admin']);
export const agreementStatusEnum = pgEnum('agreement_status', ['draft', 'sent', 'signed', 'active', 'completed', 'disputed', 'cancelled']);
export const jobStatusEnum = pgEnum('job_status', ['draft', 'posted', 'bidding', 'awarded', 'in_progress', 'completed', 'cancelled']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountType: accountTypeEnum('account_type').notNull(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  email: text('email').unique(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const jobs = pgTable('jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  homeownerId: uuid('homeowner_id').references(() => users.id).notNull(),
  title: text('title').notNull(),
  categorySlug: text('category_slug').notNull(),
  status: jobStatusEnum('status').notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const agreements = pgTable('agreements', {
  id: uuid('id').defaultRandom().primaryKey(),
  jobId: uuid('job_id').references(() => jobs.id).notNull(),
  customerUserId: uuid('customer_user_id').references(() => users.id).notNull(),
  contractorId: uuid('contractor_id').references(() => users.id).notNull(),
  status: agreementStatusEnum('status').notNull(),
  agreedPrice: integer('agreed_price'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  statusIdx: index('idx_agreements_status').on(table.status),
}));

export const jobCompletions = pgTable('job_completions', {
  id: uuid('id').defaultRandom().primaryKey(),
  agreementId: uuid('agreement_id').references(() => agreements.id).notNull().unique(),
  contractorNotes: text('contractor_notes'),
  customerNotes: text('customer_notes'),
  afterPhotos: text('after_photos').array().notNull().default([]),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  customerConfirmedAt: timestamp('customer_confirmed_at', { withTimezone: true }),
  customerDisputedAt: timestamp('customer_disputed_at', { withTimezone: true }),
  disputeReason: text('dispute_reason'),
  disputeResolvedAt: timestamp('dispute_resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  disputedIdx: index('idx_job_completions_disputed')
    .on(table.customerDisputedAt)
    .where(sql`${table.customerDisputedAt} IS NOT NULL`),
}));
