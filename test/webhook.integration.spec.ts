import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import Stripe from 'stripe';
import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { ConfigModule } from '@nestjs/config';
import * as schema from '../src/db/schema.js';
import { stripeWebhookEvents, paymentOutcomes } from '../src/db/schema.js';
import { DRIZZLE, type DrizzleDB } from '../src/db/database.module.js';
import { WebhookService } from '../src/webhook/webhook.service.js';
import { WebhookController } from '../src/webhook/webhook.controller.js';
import { StripeService } from '../src/stripe/stripe.service.js';
import { eq } from 'drizzle-orm';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://stripe_webhook_app:postgresh@localhost:5432/stripe_webhook';

const TEST_WEBHOOK_SECRET = 'whsec_test_secret_for_unit_tests';
const TEST_STRIPE_SECRET_KEY = 'sk_test_fake_key_for_tests';

const stripe = new Stripe(TEST_STRIPE_SECRET_KEY);

function makePaymentIntentPayload(overrides: {
  id?: string;
  eventId?: string;
  eventType?: string;
  amount?: number;
  currency?: string;
  created?: number;
  failureCode?: string | null;
  failureMessage?: string | null;
}): { payload: string; event: Record<string, unknown> } {
  const eventId = overrides.eventId ?? `evt_test_${Date.now()}`;
  const eventType = overrides.eventType ?? 'payment_intent.succeeded';
  const created = overrides.created ?? Math.floor(Date.now() / 1000);

  const lastPaymentError =
    overrides.failureCode || overrides.failureMessage
      ? {
          code: overrides.failureCode ?? null,
          message: overrides.failureMessage ?? null,
        }
      : null;

  const event = {
    id: eventId,
    object: 'event',
    type: eventType,
    created,
    data: {
      object: {
        id: overrides.id ?? `pi_test_${Date.now()}`,
        object: 'payment_intent',
        amount: overrides.amount ?? 2000,
        currency: overrides.currency ?? 'usd',
        status:
          eventType === 'payment_intent.succeeded'
            ? 'succeeded'
            : 'requires_payment_method',
        last_payment_error: lastPaymentError,
      },
    },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    api_version: '2024-12-18.acacia',
  };

  const payload = JSON.stringify(event);
  return { payload, event };
}

function generateSignatureHeader(payload: string, secret: string): string {
  return stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
  });
}

let pool: Pool;
let db: DrizzleDB;

beforeAll(async () => {
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
  db = drizzle(pool, { schema }) as DrizzleDB;
});

afterAll(async () => {
  await pool.end();
});

async function cleanTables(): Promise<void> {
  await db.delete(paymentOutcomes);
  await db.delete(stripeWebhookEvents);
}

describe('Webhook Integration Tests', () => {
  let app: INestApplication;
  let testDb: DrizzleDB;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              DATABASE_URL: TEST_DATABASE_URL,
              STRIPE_SECRET_KEY: TEST_STRIPE_SECRET_KEY,
              STRIPE_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
            }),
          ],
          ignoreEnvFile: true,
        }),
      ],
      controllers: [WebhookController],
      providers: [
        WebhookService,
        StripeService,
        {
          provide: DRIZZLE,
          useValue: db,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication({
      rawBody: true,
    });
    await app.init();

    testDb = moduleFixture.get<DrizzleDB>(DRIZZLE);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanTables();
  });

  describe('Valid signature', () => {
    it('should accept a correctly signed webhook and process the event', async () => {
      const { payload } = makePaymentIntentPayload({
        eventId: 'evt_valid_sig',
        id: 'pi_valid_sig',
      });
      const signature = generateSignatureHeader(payload, TEST_WEBHOOK_SECRET);

      const response = await request(app.getHttpServer())
        .post('/webhook')
        .set('stripe-signature', signature)
        .set('content-type', 'application/json')
        .send(payload);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.received).toBe(true);

      const events = await testDb
        .select()
        .from(stripeWebhookEvents)
        .where(eq(stripeWebhookEvents.stripeEventId, 'evt_valid_sig'));
      expect(events).toHaveLength(1);
      expect(events[0].status).toBe('processed');

      const outcomes = await testDb
        .select()
        .from(paymentOutcomes)
        .where(eq(paymentOutcomes.paymentIntentId, 'pi_valid_sig'));
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].status).toBe('SUCCEEDED');
    });
  });

  describe('Invalid signature', () => {
    it('should reject a webhook with an invalid signature', async () => {
      const { payload } = makePaymentIntentPayload({
        eventId: 'evt_invalid_sig',
        id: 'pi_invalid_sig',
      });

      const wrongSignature = generateSignatureHeader(
        payload,
        'whsec_wrong_secret',
      );

      const response = await request(app.getHttpServer())
        .post('/webhook')
        .set('stripe-signature', wrongSignature)
        .set('content-type', 'application/json')
        .send(payload);

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);

      const events = await testDb
        .select()
        .from(stripeWebhookEvents)
        .where(eq(stripeWebhookEvents.stripeEventId, 'evt_invalid_sig'));
      expect(events).toHaveLength(0);

      const outcomes = await testDb
        .select()
        .from(paymentOutcomes)
        .where(eq(paymentOutcomes.paymentIntentId, 'pi_invalid_sig'));
      expect(outcomes).toHaveLength(0);
    });
  });

  describe('Missing signature', () => {
    it('should reject a webhook with no Stripe-Signature header', async () => {
      const { payload } = makePaymentIntentPayload({
        eventId: 'evt_missing_sig',
        id: 'pi_missing_sig',
      });

      const response = await request(app.getHttpServer())
        .post('/webhook')
        .set('content-type', 'application/json')

        .send(payload);

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);

      const events = await testDb.select().from(stripeWebhookEvents);
      expect(events).toHaveLength(0);
    });
  });

  describe('Tampered payload', () => {
    it('should reject when signature was created for a different payload', async () => {
      const { payload: payloadA } = makePaymentIntentPayload({
        eventId: 'evt_original',
        id: 'pi_original',
        amount: 1000,
      });

      const signatureForA = generateSignatureHeader(
        payloadA,
        TEST_WEBHOOK_SECRET,
      );

      const { payload: payloadB } = makePaymentIntentPayload({
        eventId: 'evt_tampered',
        id: 'pi_tampered',
        amount: 99999,
      });

      const response = await request(app.getHttpServer())
        .post('/webhook')
        .set('stripe-signature', signatureForA)
        .set('content-type', 'application/json')
        .send(payloadB);

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);

      const events = await testDb.select().from(stripeWebhookEvents);
      expect(events).toHaveLength(0);
    });
  });

  describe('Signature mutation test (security)', () => {
    it('MUST fail if signature verification is removed — invalid signature must be rejected', async () => {
      const { payload } = makePaymentIntentPayload({
        eventId: 'evt_mutation_test',
        id: 'pi_mutation_test',
      });

      const validSignature = generateSignatureHeader(
        payload,
        TEST_WEBHOOK_SECRET,
      );
      const corruptedSignature = validSignature.replace(
        /v1=([a-f0-9]{10})/,
        'v1=0000000000',
      );

      const response = await request(app.getHttpServer())
        .post('/webhook')
        .set('stripe-signature', corruptedSignature)
        .set('content-type', 'application/json')
        .send(payload);

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);

      const events = await testDb
        .select()
        .from(stripeWebhookEvents)
        .where(eq(stripeWebhookEvents.stripeEventId, 'evt_mutation_test'));
      expect(events).toHaveLength(0);

      const outcomes = await testDb
        .select()
        .from(paymentOutcomes)
        .where(eq(paymentOutcomes.paymentIntentId, 'pi_mutation_test'));
      expect(outcomes).toHaveLength(0);
    });

    it('MUST fail if signature verification is removed — completely fabricated signature must be rejected', async () => {
      const { payload } = makePaymentIntentPayload({
        eventId: 'evt_fabricated_sig',
        id: 'pi_fabricated_sig',
      });

      const response = await request(app.getHttpServer())
        .post('/webhook')
        .set('stripe-signature', 't=1234567890,v1=fake_signature_value')
        .set('content-type', 'application/json')
        .send(payload);

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);

      const events = await testDb.select().from(stripeWebhookEvents);
      expect(events).toHaveLength(0);
    });
  });

  describe('payment_intent.succeeded', () => {
    it('should create correct payment outcome for a succeeded event', async () => {
      const created = 1700000000;
      const { payload } = makePaymentIntentPayload({
        eventId: 'evt_succeeded',
        id: 'pi_succeeded',
        eventType: 'payment_intent.succeeded',
        amount: 5000,
        currency: 'eur',
        created,
      });
      const signature = generateSignatureHeader(payload, TEST_WEBHOOK_SECRET);

      await request(app.getHttpServer())
        .post('/webhook')
        .set('stripe-signature', signature)
        .set('content-type', 'application/json')
        .send(payload);

      const outcomes = await testDb
        .select()
        .from(paymentOutcomes)
        .where(eq(paymentOutcomes.paymentIntentId, 'pi_succeeded'));

      expect(outcomes).toHaveLength(1);
      const outcome = outcomes[0];
      expect(outcome.paymentIntentId).toBe('pi_succeeded');
      expect(outcome.status).toBe('SUCCEEDED');
      expect(outcome.amount).toBe(5000);
      expect(outcome.currency).toBe('eur');
      expect(outcome.sourceEventId).toBe('evt_succeeded');
      expect(outcome.lastEventCreatedAt.getTime()).toBe(created * 1000);
      expect(outcome.failureCode).toBeNull();
      expect(outcome.failureMessage).toBeNull();
    });
  });

  describe('payment_intent.payment_failed', () => {
    it('should create correct FAILED payment outcome with failure details', async () => {
      const created = 1700000000;
      const { payload } = makePaymentIntentPayload({
        eventId: 'evt_failed',
        id: 'pi_failed',
        eventType: 'payment_intent.payment_failed',
        amount: 3000,
        currency: 'gbp',
        created,
        failureCode: 'card_declined',
        failureMessage: 'Your card was declined.',
      });
      const signature = generateSignatureHeader(payload, TEST_WEBHOOK_SECRET);

      await request(app.getHttpServer())
        .post('/webhook')
        .set('stripe-signature', signature)
        .set('content-type', 'application/json')
        .send(payload);

      const outcomes = await testDb
        .select()
        .from(paymentOutcomes)
        .where(eq(paymentOutcomes.paymentIntentId, 'pi_failed'));

      expect(outcomes).toHaveLength(1);
      const outcome = outcomes[0];
      expect(outcome.paymentIntentId).toBe('pi_failed');
      expect(outcome.status).toBe('FAILED');
      expect(outcome.amount).toBe(3000);
      expect(outcome.currency).toBe('gbp');
      expect(outcome.failureCode).toBe('card_declined');
      expect(outcome.failureMessage).toBe('Your card was declined.');
      expect(outcome.sourceEventId).toBe('evt_failed');
      expect(outcome.lastEventCreatedAt.getTime()).toBe(created * 1000);
    });
  });

  describe('Idempotency', () => {
    it('should handle duplicate event delivery without creating duplicates', async () => {
      const { payload } = makePaymentIntentPayload({
        eventId: 'evt_idempotent',
        id: 'pi_idempotent',
      });
      const signature = generateSignatureHeader(payload, TEST_WEBHOOK_SECRET);

      const response1 = await request(app.getHttpServer())
        .post('/webhook')
        .set('stripe-signature', signature)
        .set('content-type', 'application/json')
        .send(payload);

      const response2 = await request(app.getHttpServer())
        .post('/webhook')
        .set('stripe-signature', signature)
        .set('content-type', 'application/json')
        .send(payload);

      expect(response1.status).toBe(HttpStatus.OK);
      expect(response2.status).toBe(HttpStatus.OK);

      const events = await testDb
        .select()
        .from(stripeWebhookEvents)
        .where(eq(stripeWebhookEvents.stripeEventId, 'evt_idempotent'));
      expect(events).toHaveLength(1);

      const outcomes = await testDb
        .select()
        .from(paymentOutcomes)
        .where(eq(paymentOutcomes.paymentIntentId, 'pi_idempotent'));
      expect(outcomes).toHaveLength(1);
    });
  });

  describe('Concurrent idempotency', () => {
    it('should handle concurrent delivery of the same event safely', async () => {
      const { payload } = makePaymentIntentPayload({
        eventId: 'evt_concurrent',
        id: 'pi_concurrent',
      });
      const signature = generateSignatureHeader(payload, TEST_WEBHOOK_SECRET);

      const responses = await Promise.all(
        Array.from({ length: 4 }, () =>
          request(app.getHttpServer())
            .post('/webhook')
            .set('stripe-signature', signature)
            .set('content-type', 'application/json')
            .send(payload),
        ),
      );

      for (const response of responses) {
        expect(response.status).toBe(HttpStatus.OK);
      }

      const events = await testDb
        .select()
        .from(stripeWebhookEvents)
        .where(eq(stripeWebhookEvents.stripeEventId, 'evt_concurrent'));
      expect(events).toHaveLength(1);

      const outcomes = await testDb
        .select()
        .from(paymentOutcomes)
        .where(eq(paymentOutcomes.paymentIntentId, 'pi_concurrent'));
      expect(outcomes).toHaveLength(1);
    });
  });

  describe('Out-of-order delivery', () => {
    it('should maintain SUCCEEDED state when older FAILED arrives after newer SUCCEEDED', async () => {
      const piId = 'pi_out_of_order_1';

      const { payload: succeededPayload } = makePaymentIntentPayload({
        eventId: 'evt_newer_succeeded',
        id: piId,
        eventType: 'payment_intent.succeeded',
        created: 1000,
        amount: 2000,
        currency: 'usd',
      });

      const { payload: failedPayload } = makePaymentIntentPayload({
        eventId: 'evt_older_failed',
        id: piId,
        eventType: 'payment_intent.payment_failed',
        created: 500,
        amount: 2000,
        currency: 'usd',
        failureCode: 'card_declined',
        failureMessage: 'Declined',
      });

      const sigSucceeded = generateSignatureHeader(
        succeededPayload,
        TEST_WEBHOOK_SECRET,
      );
      await request(app.getHttpServer())
        .post('/webhook')
        .set('stripe-signature', sigSucceeded)
        .set('content-type', 'application/json')
        .send(succeededPayload);

      const sigFailed = generateSignatureHeader(
        failedPayload,
        TEST_WEBHOOK_SECRET,
      );
      await request(app.getHttpServer())
        .post('/webhook')
        .set('stripe-signature', sigFailed)
        .set('content-type', 'application/json')
        .send(failedPayload);

      const outcomes = await testDb
        .select()
        .from(paymentOutcomes)
        .where(eq(paymentOutcomes.paymentIntentId, piId));
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].status).toBe('SUCCEEDED');
      expect(outcomes[0].sourceEventId).toBe('evt_newer_succeeded');
    });

    it('should update to SUCCEEDED when newer SUCCEEDED arrives after older FAILED', async () => {
      const piId = 'pi_out_of_order_2';

      const { payload: failedPayload } = makePaymentIntentPayload({
        eventId: 'evt_older_failed_2',
        id: piId,
        eventType: 'payment_intent.payment_failed',
        created: 500,
        amount: 2000,
        currency: 'usd',
        failureCode: 'insufficient_funds',
        failureMessage: 'Insufficient funds',
      });

      const { payload: succeededPayload } = makePaymentIntentPayload({
        eventId: 'evt_newer_succeeded_2',
        id: piId,
        eventType: 'payment_intent.succeeded',
        created: 1000,
        amount: 2000,
        currency: 'usd',
      });

      const sigFailed = generateSignatureHeader(
        failedPayload,
        TEST_WEBHOOK_SECRET,
      );
      await request(app.getHttpServer())
        .post('/webhook')
        .set('stripe-signature', sigFailed)
        .set('content-type', 'application/json')
        .send(failedPayload);

      let outcomes = await testDb
        .select()
        .from(paymentOutcomes)
        .where(eq(paymentOutcomes.paymentIntentId, piId));
      expect(outcomes[0].status).toBe('FAILED');

      const sigSucceeded = generateSignatureHeader(
        succeededPayload,
        TEST_WEBHOOK_SECRET,
      );
      await request(app.getHttpServer())
        .post('/webhook')
        .set('stripe-signature', sigSucceeded)
        .set('content-type', 'application/json')
        .send(succeededPayload);

      outcomes = await testDb
        .select()
        .from(paymentOutcomes)
        .where(eq(paymentOutcomes.paymentIntentId, piId));
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].status).toBe('SUCCEEDED');
      expect(outcomes[0].sourceEventId).toBe('evt_newer_succeeded_2');
    });

    it('should use event ID as tie-breaker when timestamps are equal', async () => {
      const piId = 'pi_tiebreaker';
      const sameTimestamp = 1000;

      const { payload: payloadA } = makePaymentIntentPayload({
        eventId: 'evt_aaa',
        id: piId,
        eventType: 'payment_intent.payment_failed',
        created: sameTimestamp,
        failureCode: 'card_declined',
        failureMessage: 'Declined',
      });

      const { payload: payloadB } = makePaymentIntentPayload({
        eventId: 'evt_zzz',
        id: piId,
        eventType: 'payment_intent.succeeded',
        created: sameTimestamp,
      });

      const sigB = generateSignatureHeader(payloadB, TEST_WEBHOOK_SECRET);
      await request(app.getHttpServer())
        .post('/webhook')
        .set('stripe-signature', sigB)
        .set('content-type', 'application/json')
        .send(payloadB);

      const sigA = generateSignatureHeader(payloadA, TEST_WEBHOOK_SECRET);
      await request(app.getHttpServer())
        .post('/webhook')
        .set('stripe-signature', sigA)
        .set('content-type', 'application/json')
        .send(payloadA);

      const outcomes = await testDb
        .select()
        .from(paymentOutcomes)
        .where(eq(paymentOutcomes.paymentIntentId, piId));
      expect(outcomes).toHaveLength(1);

      expect(outcomes[0].status).toBe('SUCCEEDED');
      expect(outcomes[0].sourceEventId).toBe('evt_zzz');
    });
  });

  describe('FAILED -> SUCCEEDED transition', () => {
    it('a newer SUCCEEDED must update a previous FAILED projection', async () => {
      const piId = 'pi_transition';

      const { payload: failedPayload } = makePaymentIntentPayload({
        eventId: 'evt_transition_failed',
        id: piId,
        eventType: 'payment_intent.payment_failed',
        created: 100,
        amount: 5000,
        currency: 'usd',
        failureCode: 'card_declined',
        failureMessage: 'Your card was declined.',
      });

      const sigFailed = generateSignatureHeader(
        failedPayload,
        TEST_WEBHOOK_SECRET,
      );
      await request(app.getHttpServer())
        .post('/webhook')
        .set('stripe-signature', sigFailed)
        .set('content-type', 'application/json')
        .send(failedPayload);

      let outcomes = await testDb
        .select()
        .from(paymentOutcomes)
        .where(eq(paymentOutcomes.paymentIntentId, piId));
      expect(outcomes[0].status).toBe('FAILED');

      const { payload: succeededPayload } = makePaymentIntentPayload({
        eventId: 'evt_transition_succeeded',
        id: piId,
        eventType: 'payment_intent.succeeded',
        created: 200,
        amount: 5000,
        currency: 'usd',
      });

      const sigSucceeded = generateSignatureHeader(
        succeededPayload,
        TEST_WEBHOOK_SECRET,
      );
      await request(app.getHttpServer())
        .post('/webhook')
        .set('stripe-signature', sigSucceeded)
        .set('content-type', 'application/json')
        .send(succeededPayload);

      outcomes = await testDb
        .select()
        .from(paymentOutcomes)
        .where(eq(paymentOutcomes.paymentIntentId, piId));
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].status).toBe('SUCCEEDED');
      expect(outcomes[0].sourceEventId).toBe('evt_transition_succeeded');
      expect(outcomes[0].failureCode).toBeNull();
      expect(outcomes[0].failureMessage).toBeNull();
    });
  });

  describe('Transaction rollback', () => {
    it('should not leave a processed webhook record without its payment outcome on DB failure', async () => {
      const webhookService = new WebhookService(db);

      await db.execute(
        sql`ALTER TABLE payment_outcomes RENAME TO payment_outcomes_backup`,
      );

      try {
        const event: Stripe.Event = {
          id: 'evt_rollback_test',
          object: 'event',
          type: 'payment_intent.succeeded',
          created: 1700000000,
          data: {
            object: {
              id: 'pi_rollback_test',
              object: 'payment_intent',
              amount: 1000,
              currency: 'usd',
              status: 'succeeded',
              last_payment_error: null,
            } as unknown as Stripe.PaymentIntent,
          },
          livemode: false,
          pending_webhooks: 0,
          request: { id: null, idempotency_key: null },
          api_version: '2024-12-18.acacia',
        } as unknown as Stripe.Event;

        await expect(webhookService.processEvent(event)).rejects.toThrow();

        await db.execute(
          sql`ALTER TABLE payment_outcomes_backup RENAME TO payment_outcomes`,
        );

        const events = await testDb
          .select()
          .from(stripeWebhookEvents)
          .where(eq(stripeWebhookEvents.stripeEventId, 'evt_rollback_test'));
        expect(events).toHaveLength(0);
      } catch (e) {
        try {
          await db.execute(
            sql`ALTER TABLE payment_outcomes_backup RENAME TO payment_outcomes`,
          );
        } catch {}
        throw e;
      }
    });
  });

  describe('Unsupported event', () => {
    it('should accept and record an unsupported event without creating a payment outcome', async () => {
      const eventPayload = {
        id: 'evt_unsupported',
        object: 'event',
        type: 'customer.created',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'cus_test',
            object: 'customer',
            email: 'test@example.com',
          },
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
        api_version: '2024-12-18.acacia',
      };

      const payload = JSON.stringify(eventPayload);
      const signature = generateSignatureHeader(payload, TEST_WEBHOOK_SECRET);

      const response = await request(app.getHttpServer())
        .post('/webhook')
        .set('stripe-signature', signature)
        .set('content-type', 'application/json')
        .send(payload);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.received).toBe(true);

      const events = await testDb
        .select()
        .from(stripeWebhookEvents)
        .where(eq(stripeWebhookEvents.stripeEventId, 'evt_unsupported'));
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('customer.created');
      expect(events[0].status).toBe('skipped');

      const outcomes = await testDb.select().from(paymentOutcomes);
      expect(outcomes).toHaveLength(0);
    });
  });
});
