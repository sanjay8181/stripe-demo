import {
  Controller,
  Post,
  Headers,
  RawBody,
  HttpCode,
  HttpStatus,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import Stripe from 'stripe';
import { StripeService } from '../stripe/stripe.service.js';
import { WebhookService } from './webhook.service.js';

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly webhookService: WebhookService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @RawBody() rawBody: Buffer | undefined,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: boolean }> {
    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException('Missing request body');
    }

    if (!signature) {
      throw new BadRequestException('Missing Stripe-Signature header');
    }

    let event: Stripe.Event;
    try {
      event = this.stripeService.verifyWebhookSignature(rawBody, signature);
    } catch (err) {
      if (err instanceof Stripe.errors.StripeSignatureVerificationError) {
        this.logger.warn(
          `Webhook signature verification failed: ${err.message}`,
        );
        throw new BadRequestException('Invalid webhook signature');
      }
      throw err;
    }

    try {
      const result = await this.webhookService.processEvent(event);
      this.logger.log(
        `Webhook result: eventId=${result.eventId} status=${result.status}`,
      );
      return { received: true };
    } catch (err) {
      this.logger.error(
        `Failed to process webhook event ${event.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new InternalServerErrorException('Failed to process webhook event');
    }
  }
}
