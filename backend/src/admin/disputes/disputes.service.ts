import { Injectable, Inject } from '@nestjs/common';
import { DB_CONNECTION } from '../../db/db.module';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, or, and, isNotNull, isNull, count, sql, SQL } from 'drizzle-orm';
import { agreements, jobCompletions, jobs, users } from '../../db/schema';
import { ListDisputesDto } from './dto/list-disputes.dto';
import { alias } from 'drizzle-orm/pg-core';

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class DisputesService {
  constructor(@Inject(DB_CONNECTION) private readonly db: PostgresJsDatabase<typeof import('../../db/schema')>) {}

  async list(query: ListDisputesDto): Promise<PageResult<unknown>> {
    const conditions: SQL[] = [];

    // Base condition for a dispute:
    conditions.push(
      or(
        eq(agreements.status, 'disputed') as SQL,
        isNotNull(jobCompletions.customerDisputedAt) as SQL
      ) as SQL
    );

    // Filter condition for open/resolved
    if (query.status === 'open') {
      conditions.push(isNull(jobCompletions.disputeResolvedAt) as SQL);
    } else if (query.status === 'resolved') {
      conditions.push(isNotNull(jobCompletions.disputeResolvedAt) as SQL);
    }

    const where = conditions.length ? and(...conditions) : undefined;

    const homeowner = alias(users, 'homeowner');
    const contractor = alias(users, 'contractor');

    const orderByTimestamp = sql`coalesce(${jobCompletions.customerDisputedAt}, ${jobCompletions.createdAt})`;

    const buildBaseQuery = () => this.db
      .select({
        id: agreements.id,
        jobTitle: jobs.title,
        homeownerName: sql<string | null>`coalesce(${homeowner.firstName} || ' ' || ${homeowner.lastName}, ${homeowner.email})`,
        contractorName: sql<string | null>`coalesce(${contractor.firstName} || ' ' || ${contractor.lastName}, ${contractor.email})`,
        disputeReason: jobCompletions.disputeReason,
        agreedPriceCents: agreements.agreedPrice,
        disputedAt: orderByTimestamp,
        resolvedAt: jobCompletions.disputeResolvedAt,
      })
      .from(agreements)
      .leftJoin(jobCompletions, eq(agreements.id, jobCompletions.agreementId))
      .innerJoin(jobs, eq(agreements.jobId, jobs.id))
      .leftJoin(homeowner, eq(agreements.customerUserId, homeowner.id))
      .leftJoin(contractor, eq(agreements.contractorId, contractor.id))
      .where(where);

    const [rows, totals] = await Promise.all([
      buildBaseQuery()
        .orderBy(sql`${orderByTimestamp} ASC, ${agreements.id} ASC`)
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db.select({ n: count() }).from(agreements).leftJoin(jobCompletions, eq(agreements.id, jobCompletions.agreementId)).where(where)
    ]);

    return {
      items: rows,
      total: totals[0]?.n ?? 0,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string): Promise<unknown | null> {
    const homeowner = alias(users, 'homeowner');
    const contractor = alias(users, 'contractor');
    const orderByTimestamp = sql`coalesce(${jobCompletions.customerDisputedAt}, ${jobCompletions.createdAt})`;

    const rows = await this.db
      .select({
        id: agreements.id,
        jobTitle: jobs.title,
        homeownerName: sql<string | null>`coalesce(${homeowner.firstName} || ' ' || ${homeowner.lastName}, ${homeowner.email})`,
        contractorName: sql<string | null>`coalesce(${contractor.firstName} || ' ' || ${contractor.lastName}, ${contractor.email})`,
        disputeReason: jobCompletions.disputeReason,
        agreedPriceCents: agreements.agreedPrice,
        disputedAt: orderByTimestamp,
        resolvedAt: jobCompletions.disputeResolvedAt,
      })
      .from(agreements)
      .leftJoin(jobCompletions, eq(agreements.id, jobCompletions.agreementId))
      .innerJoin(jobs, eq(agreements.jobId, jobs.id))
      .leftJoin(homeowner, eq(agreements.customerUserId, homeowner.id))
      .leftJoin(contractor, eq(agreements.contractorId, contractor.id))
      .where(and(
        eq(agreements.id, id),
        or(
          eq(agreements.status, 'disputed') as SQL,
          isNotNull(jobCompletions.customerDisputedAt) as SQL
        )
      ));
      
    return rows[0] ?? null;
  }
}
