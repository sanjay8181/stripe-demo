import { Injectable, Inject, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { eq, and, or, gt, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../db/database.module.js';
import { stripeWebhookEvents, paymentOutcomes } from '../db/schema.js';

const SUPPORTED_PAYMENT_EVENTS = [
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
] as const;

type SupportedPaymentEvent = (typeof SUPPORTED_PAYMENT_EVENTS)[number];

function isSupportedPaymentEvent(type: string): type is SupportedPaymentEvent {
  return (SUPPORTED_PAYMENT_EVENTS as readonly string[]).includes(type);
}

function mapEventTypeToStatus(
  eventType: SupportedPaymentEvent,
): 'SUCCEEDED' | 'FAILED' {
  switch (eventType) {
    case 'payment_intent.succeeded':
      return 'SUCCEEDED';
    case 'payment_intent.payment_failed':
      return 'FAILED';
  }
}

function isPaymentIntent(obj: unknown): obj is Stripe.PaymentIntent {
  if (typeof obj !== 'object' || obj === null) return false;
  const record = obj as Record<string, unknown>;
  return (
    record['object'] === 'payment_intent' &&
    typeof record['id'] === 'string' &&
    typeof record['amount'] === 'number' &&
    typeof record['currency'] === 'string'
  );
}

function isNewerEvent(
  incomingCreatedAt: Date,
  incomingEventId: string,
  existingCreatedAt: Date,
  existingEventId: string,
): boolean {
  const incomingTs = incomingCreatedAt.getTime();
  const existingTs = existingCreatedAt.getTime();

  if (incomingTs > existingTs) return true;
  if (incomingTs < existingTs) return false;
  return incomingEventId > existingEventId;
}

export interface WebhookProcessingResult {
  status: 'processed' | 'duplicate' | 'skipped';
  eventId: string;
  eventType: string;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async processEvent(event: Stripe.Event): Promise<WebhookProcessingResult> {
    const eventCreatedAt = new Date(event.created * 1000);
    const now = new Date();

    return this.db.transaction(async (tx) => {
      const insertResult = await tx
        .insert(stripeWebhookEvents)
        .values({
          stripeEventId: event.id,
          eventType: event.type,
          payload: event as unknown as Record<string, unknown>,
          eventCreatedAt,
          receivedAt: now,
          status: 'pending',
        })
        .onConflictDoNothing({ target: stripeWebhookEvents.stripeEventId })
        .returning({ id: stripeWebhookEvents.id });

      if (insertResult.length === 0) {
        this.logger.log(
          `Duplicate event ignored: id=${event.id} type=${event.type}`,
        );
        return {
          status: 'duplicate' as const,
          eventId: event.id,
          eventType: event.type,
        };
      }

      const webhookRecordId = insertResult[0].id;

      if (!isSupportedPaymentEvent(event.type)) {
        this.logger.log(
          `Unsupported event type recorded: id=${event.id} type=${event.type}`,
        );

        await tx
          .update(stripeWebhookEvents)
          .set({
            status: 'skipped',
            processedAt: now,
            updatedAt: now,
          })
          .where(eq(stripeWebhookEvents.id, webhookRecordId));

        return {
          status: 'skipped' as const,
          eventId: event.id,
          eventType: event.type,
        };
      }

      const paymentIntent = event.data.object;
      if (!isPaymentIntent(paymentIntent)) {
        this.logger.warn(
          `Event ${event.id} has type ${event.type} but data.object is not a valid PaymentIntent`,
        );

        await tx
          .update(stripeWebhookEvents)
          .set({
            status: 'skipped',
            processedAt: now,
            updatedAt: now,
          })
          .where(eq(stripeWebhookEvents.id, webhookRecordId));

        return {
          status: 'skipped' as const,
          eventId: event.id,
          eventType: event.type,
        };
      }

      const outcomeStatus = mapEventTypeToStatus(event.type);
      const failureCode =
        outcomeStatus === 'FAILED'
          ? (paymentIntent.last_payment_error?.code ?? null)
          : null;
      const failureMessage =
        outcomeStatus === 'FAILED'
          ? (paymentIntent.last_payment_error?.message ?? null)
          : null;

      await tx
        .insert(paymentOutcomes)
        .values({
          paymentIntentId: paymentIntent.id,
          status: outcomeStatus,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          failureCode,
          failureMessage,
          sourceEventId: event.id,
          lastEventCreatedAt: eventCreatedAt,
          lastEventId: event.id,
        })
        .onConflictDoUpdate({
          target: paymentOutcomes.paymentIntentId,
          set: {
            status: outcomeStatus,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            failureCode,
            failureMessage,
            sourceEventId: event.id,
            lastEventCreatedAt: eventCreatedAt,
            lastEventId: event.id,
            updatedAt: now,
          },
          setWhere: or(
            gt(
              sql`excluded.last_event_created_at`,
              paymentOutcomes.lastEventCreatedAt,
            ),
            and(
              eq(
                sql`excluded.last_event_created_at`,
                paymentOutcomes.lastEventCreatedAt,
              ),
              gt(sql`excluded.last_event_id`, paymentOutcomes.lastEventId),
            ),
          ),
        });

      await tx
        .update(stripeWebhookEvents)
        .set({
          status: 'processed',
          processedAt: now,
          updatedAt: now,
        })
        .where(eq(stripeWebhookEvents.id, webhookRecordId));

      this.logger.log(
        `Processed event: id=${event.id} type=${event.type} paymentIntent=${paymentIntent.id}`,
      );

      return {
        status: 'processed' as const,
        eventId: event.id,
        eventType: event.type,
      };
    });
  }
}
