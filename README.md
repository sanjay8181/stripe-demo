# FastHands Dispute Queue

## Overview

This project implements the standalone Admin Dispute Queue requested in the provided FastHands Dispute Queue brief. 

The admin dashboard previously exposed a dispute count but not a usable queue/list. This project provides the paginated dispute queue required for administrative triage.

This is a complete standalone implementation ready for your integration.

## Reference 

The implementation was based on the following files provided in the assignment brief:
- `fasthands-dispute-queue-brief/README.md`
- `fasthands-dispute-queue-brief/api-pattern/list-endpoint-pattern.ts`
- `fasthands-dispute-queue-brief/web-pattern/queue-page-pattern.tsx`
- `fasthands-dispute-queue-brief/schema/schema.sql`

These were treated as authoritative task/reference material. They are reference patterns and schemas, not the actual production application files.

## Technology Stack

### Backend
- NestJS
- TypeScript
- Drizzle ORM
- class-validator
- class-transformer
- Swagger / @nestjs/swagger

### Frontend
- Next.js App Router
- React
- TypeScript
- TanStack Query
- TanStack Table
- Tailwind CSS
- shadcn-style UI primitives

## Project Structure

```text
backend/
  src/
    admin/
      disputes/
        dto/
          list-disputes.dto.ts
        disputes.controller.ts
        disputes.module.ts
        disputes.service.ts
      admin-auth.guard.ts
    db/
      db.module.ts
      schema.ts
    app.module.ts
    main.ts

frontend/
  app/
    disputes/
      [id]/
        page.tsx
      page.tsx
    globals.css
    layout.tsx
    page.tsx
  components/
    data-table.tsx
    page-header.tsx
    providers.tsx
  lib/
    api/
      disputes.ts
```

## Backend API

**Endpoint**: `GET /admin/disputes/queue`

**Query Parameters:**
- `page` (default: 1)
- `pageSize` (default: 25, max: 100)
- `status` (`open` | `resolved` | `all`, default: `open`)

**Response Shape:**
```json
{
  "items": [
    {
      "id": "uuid",
      "jobTitle": "string",
      "homeownerName": "string | null",
      "contractorName": "string | null",
      "disputeReason": "string | null",
      "agreedPriceCents": 5000,
      "disputedAt": "2026-10-06T12:00:00.000Z",
      "resolvedAt": "2026-10-07T12:00:00.000Z | null"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 25
}
```

Monetary values are returned as integer cents. Timestamps are returned as UTC ISO strings.

## Dispute Detection

A dispute is identified when:
`agreements.status = 'disputed'`
OR
`job_completions.customer_disputed_at IS NOT NULL`

**Filter Rules:**
- **Open**: disputed AND `dispute_resolved_at IS NULL`
- **Resolved**: disputed AND `dispute_resolved_at IS NOT NULL`
- **All**: all disputes regardless of resolution state

## Sorting / Triage Priority

The queue prioritizes the oldest dispute first. 

The actual timestamp logic implemented by the backend uses:
`COALESCE(job_completions.customer_disputed_at, job_completions.created_at)`

A deterministic secondary ordering is applied sorting `ASC` by `agreements.id` to prevent pagination jitter for identical timestamps.

## Database / Query Design

- **ORM**: Drizzle ORM
- **Tables**: `agreements`, `job_completions`, `jobs`, `users`
- Lookups for homeowner and contractor users are efficiently handled via alias `LEFT JOIN` operations securely preventing crashes if users are missing.
- **No N+1 queries** exist.
- Rows and the total count are executed in parallel (`Promise.all`).
- Identical `where` filters are applied to both the row fetch and count queries.

## Frontend

**Route**: `/disputes`

The page provides:
- Open / Resolved / All filter
- pagination
- job title
- homeowner
- contractor
- dispute reason
- contract value
- relative dispute age
- loading state (pulsing skeleton)
- empty state
- error state
- retry behavior via Tanstack Query

Money (`agreed_price`) is integer cents and is formatted only at the frontend edge. API timestamps are UTC and displayed appropriately by the frontend.

## Accessibility

The following accessibility requirements are implemented:
- The Job navigation uses a real keyboard-accessible Link inside the table rather than relying exclusively on a row-level onClick.
- keyboard focus
- Enter activation
- visible focus state
- the table row itself is not the only activation mechanism
- long user-supplied text remains accessible and doesn't break the layout horizontally
- loading/empty/error states are intentional and semantic

## Read-only Dispute Detail

**Route**: `/disputes/[id]`

A read-only dispute detail page included in the standalone implementation so that Job links from the queue lead to a usable review page rather than a 404.

It fetches a single dispute using `GET /admin/disputes/:id` and displays the available dispute information based on the actual implementation:
- Job Title
- Homeowner / Contractor names
- Contract value formatted from cents
- Dispute Reason (rendered cleanly)
- Disputed Date / Open For duration
- Resolution status badge
- A back link to the queue

The dispute resolution workflow is NOT implemented in this standalone project.

The following endpoint remains an integration dependency:
`POST /admin/agreements/:id/resolve-dispute`

The project does NOT implement:
- No refund functionality
- No payout functionality
- No automatic money movement

## Integration Notes

The following are expected to be integrated with the existing system:
- production authentication/authorization
- existing admin permission model
- production API/base URL
- production database/environment configuration
- existing admin navigation/layout
- existing dispute-resolution workflow

## Environment Variables

The project uses the following environment variables:

**Backend**:
- `DATABASE_URL`

**Frontend**:
- `NEXT_PUBLIC_API_BASE_URL`

- `DATABASE_URL` provides the PostgreSQL connection string.
- `NEXT_PUBLIC_API_BASE_URL` configures the frontend API base URL.
- Real credentials/secrets must not be committed.
- `.env` files are ignored.
- `.env.example` contains placeholders.

## Local Development

### Backend
Navigate to the `backend/` directory:
```bash
npm install
cp .env.example .env
npm run start:dev
```

### Frontend
Navigate to the `frontend/` directory:
```bash
npm install
npm run dev
```

## Database Setup

The backend connects to PostgreSQL using the connection string provided through the `DATABASE_URL` environment variable.

The database schema follows the tables and relationships defined in the provided `schema.sql` specification.

The required database objects include:
- users
- jobs
- agreements
- job_completions

## Validation / Verification

The following checks were verified:
- frontend TypeScript check passed
- backend TypeScript check passed
- frontend production build passed
- API response verification
- queue rendering verification
- filter verification
- pagination verification
- accessibility verification
- detail route verification

**Production build**: PASS
The production build was successfully executed using Node.js 22.x.

## Known Limitations / Assumptions

### Dispute timestamp fallback

The supplied requirements define a dispute using either the agreement status or the customer dispute timestamp. They do not define a definitive dispute-open timestamp for every possible data state.

For records with a job completion row, the current implementation uses `COALESCE(job_completions.customer_disputed_at, job_completions.created_at)` for queue ordering.

If an agreement is marked as disputed but has no corresponding `job_completions` row, there is no dispute timestamp available from the provided schema. The resulting timestamp remains `NULL`.

The exact business rule for aging such records is therefore treated as an integration-level assumption rather than an invented business rule.

### Detail/resolution integration

The standalone project includes a read-only `/disputes/[id]` page, but the existing resolution workflow is not recreated. The actual resolution endpoint remains `POST /admin/agreements/:id/resolve-dispute` and belongs to the existing application.

## Security / Secrets

- no production credentials are included
- `.env` files are ignored
- `.env.example` contains placeholders only
- production authentication must be supplied during integration

## A6. Third-Party Materials / Licenses

| Package | Version | Purpose | License |
|---|---:|---|---|
| `postgres` | `^3.4.9` | PostgreSQL client used by the backend database layer | MIT |
| `swagger-ui-express` | `^5.0.1` | Serves Swagger/OpenAPI documentation UI | MIT |
| `date-fns` | `^4.4.0` | Date formatting and relative dispute-age display in the frontend | MIT |

These are standard open-source npm dependencies used by the implementation. No third-party proprietary code, commercial assets, or licensed UI assets were added.

## Final Implementation Status

The standalone FastHands Dispute Queue implementation is complete for the provided requirements and reference materials.

The implementation includes the backend paginated dispute queue API, frontend administrative queue, filtering, pagination, accessibility requirements, loading/empty/error states, and a read-only dispute detail view.

The project is ready for integration with the existing application environment, authentication/authorization, navigation, and dispute resolution workflow.

Known assumptions and integration dependencies are documented above.
