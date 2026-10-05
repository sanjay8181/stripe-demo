# Stripe Webhook Module (NestJS)

This is a standalone NestJS application/module designed to receive Stripe webhook events, verify their signatures, and record payment outcomes in PostgreSQL using Drizzle ORM.

## Project Purpose

The primary goal of this project is to provide a robust, secure, and idempotent system for processing Stripe webhooks. It specifically handles `payment_intent.succeeded` and `payment_intent.payment_failed` events. The system ensures that:
- Every webhook signature is cryptographically verified against the exact raw HTTP request body.
- Webhook events are processed idempotently (duplicate deliveries are safely ignored).
- Database mutations are atomic (ACID compliant).
- Out-of-order event deliveries are handled gracefully without overwriting newer state with older state.

## Architecture

The application is structured into the following key modules:

1.  **StripeModule (`src/stripe/stripe.service.ts`)**: Encapsulates Stripe SDK initialization and signature verification logic.
2.  **DatabaseModule (`src/db/database.module.ts`)**: Provides the Drizzle ORM database connection and schema access globally.
3.  **WebhookModule (`src/webhook/webhook.controller.ts`, `src/webhook/webhook.service.ts`)**:
    -   **Controller**: A thin layer responsible for obtaining the raw request body, the `Stripe-Signature` header, delegating verification to the StripeService, and delegating business logic to the WebhookService.
    -   **Service**: Contains the core business logic. It handles the database transaction, idempotency checks, and updating the payment outcome projections.

## Why Raw Body is Required

Stripe webhook signatures are computed over the exact bytes sent in the HTTP request body. Any modification to this body—even parsing it to a JSON object and re-stringifying it—can alter the byte sequence (e.g., changing whitespace or key ordering), which will cause signature verification to fail.

Therefore, the controller must have access to the original, unparsed raw `Buffer` of the request body. We enable this in NestJS by passing `rawBody: true` to `NestFactory.create()` and using the `@RawBody()` decorator in the controller.

## How Stripe Signature Verification Works

1.  The Stripe CLI or Stripe production servers sign the webhook payload using a secret key (the webhook signing secret).
2.  They send this signature in the `Stripe-Signature` HTTP header.
3.  Our application reads the raw request `Buffer` and the `Stripe-Signature` header.
4.  We use the official Stripe Node SDK's `stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)` method.
5.  This method internally computes the expected signature from the `rawBody` and compares it to the provided `signature`. If they match, the event is authentic. If not, it throws a `StripeSignatureVerificationError`, which our controller catches and translates into a `400 Bad Request`.

## Database Schema

We use two logical tables, managed via Drizzle ORM:

1.  **`stripe_webhook_events`**: A durable webhook event/inbox and audit record. The Stripe event identity and payload are preserved, while the processing status may change.
    -   `stripe_event_id` (UNIQUE): Ensures idempotency.
    -   `payload`: Stores the raw JSONB event data.
    -   `status`: Tracks processing state (`pending`, `processed`, `skipped`).
2.  **`payment_outcomes`**: A projection representing the current known outcome of a `PaymentIntent`.
    -   `payment_intent_id` (UNIQUE).
    -   `status`: `SUCCEEDED` or `FAILED`.
    -   `last_event_created_at` & `last_event_id`: Used for out-of-order protection.

## Drizzle Migration Commands

Migrations are managed with `drizzle-kit`.

-   **Generate a new migration:** `npm run db:generate`
-   **Apply migrations to the database:** `npm run db:migrate`
-   **Check schema integrity:** `npm run db:check`

## Idempotency Strategy

Stripe guarantees at-least-once delivery, meaning we might receive the same event multiple times.

Our idempotency strategy relies on the database as the final authority. We use PostgreSQL's `UNIQUE` constraint on the `stripe_event_id` column in the `stripe_webhook_events` table.

When processing an event, we attempt an `INSERT ... ON CONFLICT DO NOTHING`.
-   If the insert succeeds, we proceed with processing.
-   If the insert returns no rows, we know the event is a duplicate and was already handled (or is currently being handled). We safely return a `200 OK` without performing further actions.

## PostgreSQL Unique Constraints

-   `stripe_webhook_events.stripe_event_id`: Prevents the same Stripe event from being inserted (and processed) twice.
-   `payment_outcomes.payment_intent_id`: Ensures we have exactly one outcome projection per PaymentIntent.

## ACID Transaction Boundary

The entire processing of a valid event is wrapped in a single Drizzle database transaction (`db.transaction(...)`).

This ensures atomicity:
1.  The webhook event is inserted.
2.  The payment outcome is updated (or created).
3.  The webhook event status is marked as `processed`.

If any step fails (e.g., a database connection issue or constraint violation), the entire transaction rolls back. This prevents inconsistent states, such as a webhook being marked `processed` without the corresponding `payment_outcomes` record being updated.

## Concurrent Duplicate Handling

Because our idempotency check relies on `INSERT ... ON CONFLICT DO NOTHING` within an ACID transaction, it is perfectly safe against concurrent deliveries of the same event. Even if four requests for the same event arrive simultaneously, PostgreSQL's row-level locking and unique constraint checks will ensure that exactly one transaction succeeds in inserting the `stripe_webhook_events` record, while the others will hit the conflict and gracefully exit. No application-level locking (like an in-memory `Map`) is needed.

## Out-of-Order Event Strategy

Stripe events are not guaranteed to arrive in the order they were created. We might receive a newer `payment_intent.succeeded` before an older `payment_intent.payment_failed`.

We handle this when upserting into the `payment_outcomes` table using an `INSERT ... ON CONFLICT DO UPDATE` query with a specific `WHERE` clause (`setWhere` in Drizzle).

We compare the incoming event's `created` timestamp against the stored `last_event_created_at`:
-   **Newer timestamp:** The update is applied.
-   **Older timestamp:** The update is ignored (preventing regression).
-   **Same timestamp:** We use a deterministic tie-breaker by comparing the `stripe_event_id` lexicographically.

This ensures a `FAILED` event arriving late will never overwrite a newer `SUCCEEDED` state.

## HTTP Response Behavior

-   **Valid signature + Successfully processed:** `200 OK`
-   **Valid signature + Duplicate event:** `200 OK` (Desired state already exists).
-   **Valid signature + Unsupported event type:** `200 OK` (Recorded in audit log, safely ignored for business logic).
-   **Invalid or Missing signature:** `400 Bad Request` (No DB mutations).
-   **Database/Server Error:** `500 Internal Server Error` (Forces Stripe to retry later).

## How to Run Tests

The test suite requires a running PostgreSQL database.

1.  Ensure your `DATABASE_URL` is set in the `.env` file.
2.  Run the tests:
    ```bash
    npm run test
    ```
    *(Note: Tests are run sequentially with `--maxWorkers=1` and clear the relevant tables between runs to prevent DB state contamination).*

## Stripe CLI Setup

To test locally with real Stripe events, use the Stripe CLI:

1.  Install the Stripe CLI.
2.  Log in:
    ```bash
    stripe login
    ```
3.  Forward webhooks to your local server. (Note: Based on the current configuration, the NestJS application listens on port 4040):
    ```bash
    stripe listen --events payment_intent.succeeded,payment_intent.payment_failed --forward-to localhost:4040/webhook
    ```
4.  **Important:** The output of the `listen` command will display a webhook signing secret (e.g., `whsec_...`). Copy this value and set it as `STRIPE_WEBHOOK_SECRET` in your `.env` file.

## How to trigger `payment_intent.succeeded`

With the `stripe listen` command running in one terminal, open another terminal and run:

```bash
stripe trigger payment_intent.succeeded
```

## How to trigger `payment_intent.payment_failed`

Similarly, to trigger a failure:

```bash
stripe trigger payment_intent.payment_failed
```

## Security Test / Mutation Intent

The test suite includes a critical security test named `"MUST fail if signature verification is removed — invalid signature must be rejected"`.

**Intent:** This test intentionally sends a valid-looking webhook payload but with a deliberately corrupted signature. It asserts that the server responds with a `400 Bad Request` and that *no database mutations occur*.

If a developer were to accidentally remove or bypass the `stripe.webhooks.constructEvent()` call in the controller (e.g., for debugging) and commit that change, this test would immediately fail, catching the security vulnerability before it reaches production. We do not mock `constructEvent` in this test; we execute the real security boundary.

## Known Trade-offs

-   **Shared Database for Tests:** The integration tests currently run against the main `DATABASE_URL` (truncating tables between tests) rather than spinning up a completely isolated ephemeral database (like Testcontainers). This was done for simplicity in this specific evaluation environment but could be risky if run against a non-local database.
-   **Synchronous Processing:** The webhook processing happens synchronously within the HTTP request lifecycle. If the database transaction is slow, it ties up an HTTP connection and delays the response to Stripe.

## What Would Be Improved With More Time

-   **Testcontainers:** Implement Testcontainers for integration tests to automatically spin up and tear down an isolated PostgreSQL instance for testing, ensuring zero risk to developer databases.
-   **Asynchronous Processing Pattern:** While strict transactional processing is safe, for a very high-throughput system, I might move to an asynchronous pattern: the controller only performs signature verification and inserts the raw event into `stripe_webhook_events` (returning 200 OK immediately). A separate background worker would then poll `stripe_webhook_events` for `pending` records and process the `payment_outcomes` updates.
-   **Dead Letter Queue (DLQ):** Add a mechanism to handle events that repeatedly fail processing (e.g., due to unexpected payload structures) by moving them to a DLQ state for manual review.

## Explicit Uncertainties

-   **Stripe SDK Node Version Compatibility:** The scaffolding included NestJS v12 and `stripe` v23, which are modern ES Modules. There was some friction running the Jest test suite in a Node v18 environment due to ESM/CJS transpilation issues. The tests now pass using `@swc/jest` to properly handle the ESM modules natively, but running `nest build` directly fails on Node 18 because it uses the `import ... with { type: 'json' }` syntax which requires Node 20+. The build script was swapped to use `tsc` directly, which successfully compiles the project.
