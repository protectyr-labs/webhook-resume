# webhook-resume

> Pause workflows, wait for human decisions, resume via webhook.

[![CI](https://github.com/protectyr-labs/webhook-resume/actions/workflows/ci.yml/badge.svg)](https://github.com/protectyr-labs/webhook-resume/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)](https://www.typescriptlang.org/)

## Quick Start

```bash
npm install @protectyr-labs/webhook-resume
```

```typescript
import { createWait, resume, buildCallbackUrls, createInMemoryStore } from '@protectyr-labs/webhook-resume';

const store = createInMemoryStore();

// Create a decision point with timeout
const wait = await createWait(store, {
  workflowId: 'deploy-prod-v2.1',
  options: ['approve', 'reject'],
  timeoutMs: 60 * 60 * 1000,
});

// Build button URLs for Slack/email/Telegram
const urls = buildCallbackUrls('https://api.yourapp.com', wait.waitId, ['approve', 'reject']);
// => { approve: "https://api.yourapp.com/webhook/resume/<id>?option=approve", ... }

// When the human clicks, resume the workflow
const result = await resume(store, wait.waitId, 'approve');
// => { ok: true, option: 'approve', record: { ... } }
```

## Why This?

- **Storage-agnostic** -- implement `WaitStore` for Redis, Postgres, DynamoDB, or use the built-in in-memory store
- **Option validation** -- resume rejects choices not in the original options list
- **Timeout built in** -- expired waits return a clear error, no silent failures
- **Idempotent resume** -- double-clicks don't create duplicate actions
- **Zero runtime dependencies** -- pure TypeScript, no framework lock-in

## Use Cases

**Content approval workflows** -- AI drafts a blog post. Send it to the editor via Slack/Telegram with Approve/Reject/Edit buttons. Workflow pauses until they decide.

**Deployment gates** -- CI pipeline reaches the production deploy step. Sends a notification to the team lead. Workflow waits for approval before proceeding.

**Expense approval** -- Employee submits an expense. Manager gets an email with Approve/Deny links. Click resolves the workflow.

**Multi-reviewer chains** -- Document needs sign-off from legal, then compliance, then management. Create sequential wait points for each reviewer.

## API

| Function | Purpose |
|----------|---------|
| `createWait(store, opts)` | Create a wait point with options, timeout, and metadata |
| `resume(store, waitId, option)` | Resume with the human's decision (validates option + expiry) |
| `buildCallbackUrls(base, waitId, options)` | Generate full callback URLs for notification buttons |
| `createInMemoryStore()` | In-memory `WaitStore` for dev/testing |

### WaitStore Interface

```typescript
interface WaitStore {
  create(record: WaitRecord): Promise<void>;
  get(id: string): Promise<WaitRecord | null>;
  resolve(id: string, option: string): Promise<WaitRecord>;
  expire(id: string): Promise<void>;
}
```

## Patterns

### Content Approval (3 options)

```typescript
const wait = await createWait(store, {
  workflowId: 'blog-post-42',
  options: ['approve', 'reject', 'request_edits'],
  timeoutMs: 24 * 60 * 60 * 1000,
  metadata: { title: 'New Blog Post' },
});
```

### Express Webhook Handler

```typescript
app.get('/webhook/resume/:waitId', async (req, res) => {
  const result = await resume(store, req.params.waitId, req.query.option);
  result.ok ? res.send('Decision recorded.') : res.status(400).send(result.error);
});
```

## Limitations

- **Single resolver** -- one person resolves each wait point; no quorum/voting
- **No partial approval** -- all-or-nothing decision, no "approve with conditions"
- **No built-in retry** -- if the webhook delivery fails, the caller must retry
- **In-memory store is ephemeral** -- implement `WaitStore` for persistence in production

## See Also

- [funnel-state](https://github.com/protectyr-labs/funnel-state) -- validated customer lifecycle state machine
- [sse-lock](https://github.com/protectyr-labs/sse-lock) -- SSE streaming with concurrency control

## License

MIT
