import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller.js';
import { WebhookService } from './webhook.service.js';
import { StripeModule } from '../stripe/stripe.module.js';

@Module({
  imports: [StripeModule],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
