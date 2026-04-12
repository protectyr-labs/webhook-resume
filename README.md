# @protectyr-labs/webhook-resume

Webhook-based pause/resume primitives for async workflows. Build human-in-the-loop approval gates with timeout and multi-option routing.

## Why This Exists

Async workflows often need a human to make a decision before continuing. The typical approach is polling a database, but that wastes resources and adds latency. This library provides a clean pause/resume primitive built around webhooks:

1. Workflow reaches a decision point and **pauses**
2. A unique webhook URL is generated for each option (approve, reject, etc.)
3. URLs are sent to the human via any channel (Slack, email, chat bot)
4. Human clicks a button, webhook fires, workflow **resumes** with the decision

Zero runtime dependencies. Storage-agnostic. Works with any notification channel.

## Quick Start

```bash
npm install @protectyr-labs/webhook-resume
```

```typescript
import { createWait, resume, buildCallbackUrls, createInMemoryStore } from '@protectyr-labs/webhook-resume';

const store = createInMemoryStore();

// 1. Create a wait point
const wait = await createWait(store, {
  workflowId: 'deploy-prod-v2.1',
  options: ['approve', 'reject'],
  timeoutMs: 60 * 60 * 1000, // 1 hour
});

// 2. Build callback URLs for notification buttons
const urls = buildCallbackUrls('https://api.yourapp.com', wait.waitId, ['approve', 'reject']);
// urls.approve => "https://api.yourapp.com/webhook/resume/<id>?option=approve"
// urls.reject  => "https://api.yourapp.com/webhook/resume/<id>?option=reject"

// 3. Send URLs to reviewer (via Slack, email, etc.)
// ...

// 4. When webhook fires, resume the workflow
const result = await resume(store, wait.waitId, 'approve');
if (result.ok) {
  console.log(`Approved! Deploying...`);
}
```

## Pattern: Content Approval

```typescript
const wait = await createWait(store, {
  workflowId: 'blog-post-42',
  options: ['approve', 'reject', 'request_edits'],
  timeoutMs: 24 * 60 * 60 * 1000, // 24h deadline
  metadata: { title: 'New Blog Post', author: 'team' },
});

const urls = buildCallbackUrls(BASE_URL, wait.waitId, wait.options);

// Send notification with 3 buttons
await sendSlackMessage({
  text: 'New blog post ready for review',
  actions: [
    { text: 'Approve', url: urls.approve },
    { text: 'Reject', url: urls.reject },
    { text: 'Request Edits', url: urls.request_edits },
  ],
});

// Webhook handler (Express, Fastify, etc.)
app.get('/webhook/resume/:waitId', async (req, res) => {
  const result = await resume(store, req.params.waitId, req.query.option);
  if (result.ok) {
    res.send('Decision recorded. Thank you!');
    // Trigger next workflow step based on result.option
  } else {
    res.status(400).send(result.error);
  }
});
```

## Pattern: Multi-Reviewer (Sequential)

```typescript
// First reviewer: technical check
const techReview = await createWait(store, {
  workflowId: 'release-v3',
  options: ['pass', 'fail'],
  timeoutMs: 4 * 60 * 60 * 1000,
});
// Send to tech lead...

// After tech approval, create second wait
const mgmtReview = await createWait(store, {
  workflowId: 'release-v3',
  options: ['approve', 'hold'],
  timeoutMs: 8 * 60 * 60 * 1000,
});
// Send to manager...
```

## API Reference

### `createWait(store, options): Promise<WaitResult>`

Create a wait point in a workflow.

| Parameter | Type | Description |
|-----------|------|-------------|
| `store` | `WaitStore` | Storage backend |
| `options.workflowId` | `string` | Identifier for the parent workflow |
| `options.options` | `string[]` | Valid callback values (e.g., `["approve", "reject"]`) |
| `options.timeoutMs` | `number?` | Optional timeout in milliseconds |
| `options.metadata` | `Record<string, unknown>?` | Optional metadata attached to the wait |

Returns `{ waitId, webhookPath, expiresAt }`.

### `resume(store, waitId, option): Promise<ResumeResult>`

Resume a paused workflow with the human's decision.

Validates that the wait exists, is still pending, the option is valid, and the timeout has not passed.

Returns `{ ok: true, option, record }` on success, or `{ ok: false, error }` on failure.

### `buildCallbackUrls(baseUrl, waitId, options): Record<string, string>`

Generate full callback URLs for each option. Use these as button hrefs in notifications.

### `createInMemoryStore(): WaitStore`

In-memory store for development and testing. For production, implement the `WaitStore` interface with your database.

### `WaitStore` Interface

```typescript
interface WaitStore {
  create(record: WaitRecord): Promise<void>;
  get(id: string): Promise<WaitRecord | null>;
  resolve(id: string, option: string): Promise<WaitRecord>;
  expire(id: string): Promise<void>;
}
```

Implement this for your backend: Redis, PostgreSQL, SQLite, DynamoDB, etc.

## Use Cases

- **Content review** -- approve, reject, or request edits on drafts
- **Deployment gates** -- require human sign-off before production deploys
- **Expense approval** -- route purchase requests through approval chains
- **Incident response** -- escalation decisions during on-call
- **Onboarding workflows** -- step-by-step approval for new accounts
- **Any human decision point** in an automated pipeline

## License

MIT
