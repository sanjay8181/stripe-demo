import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;
  private readonly logger = new Logger(StripeService.name);

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is required');
    }

    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is required');
    }

    this.webhookSecret = webhookSecret;
    this.stripe = new Stripe(secretKey);
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string): Stripe.Event {
    this.logger.debug('Verifying Stripe webhook signature');

    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret,
    );

    this.logger.log(`Verified Stripe event: id=${event.id} type=${event.type}`);

    return event;
  }
}
