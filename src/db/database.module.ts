import {
  Module,
  Global,
  Logger,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';

export const DRIZZLE = Symbol('DRIZZLE');
export type DrizzleDB = NodePgDatabase<typeof schema>;

const PG_POOL = Symbol('PG_POOL');

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: (config: ConfigService): Pool => {
        const url = config.get<string>('DATABASE_URL');
        if (!url) {
          throw new Error('DATABASE_URL is required');
        }
        return new Pool({ connectionString: url });
      },
      inject: [ConfigService],
    },
    {
      provide: DRIZZLE,
      useFactory: (pool: Pool): DrizzleDB => {
        return drizzle(pool, { schema });
      },
      inject: [PG_POOL],
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Closing database pool');
    await this.pool.end();
  }
}
