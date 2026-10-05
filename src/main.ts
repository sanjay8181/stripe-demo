import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  const config = app.get(ConfigService);

  const required = [
    'DATABASE_URL',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ];
  for (const key of required) {
    if (!config.get<string>(key)) {
      logger.error(`Missing required environment variable: ${key}`);
      process.exit(1);
    }
  }

  const port = config.get<number>('PORT') ?? 4040;
  await app.listen(port);
  logger.log(`Application listening on port ${port}`);
}

void bootstrap();
