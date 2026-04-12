# Architecture

Design decisions and rationale for `@protectyr-labs/webhook-resume`.

## Why Webhook Over Polling

The alternative to webhooks is polling: the workflow periodically checks a database for a decision. Webhooks are better for this use case:

- **Latency.** Webhook fires instantly when the human clicks. Polling adds up to one poll interval of delay.
- **Resource efficiency.** No background timers, no database queries on a loop. The workflow is truly paused until the callback arrives.
- **Simplicity.** One HTTP endpoint handles all callbacks. No scheduler, no cron, no worker process.

## Why the WaitStore Interface

The library is storage-agnostic. The `WaitStore` interface has four methods: `create`, `get`, `resolve`, `expire`. This keeps the core logic testable and portable:

- **Testing:** Use `createInMemoryStore()` with zero setup.
- **Development:** Same in-memory store, no database required.
- **Production:** Implement `WaitStore` with your existing database (PostgreSQL, Redis, DynamoDB, SQLite). The library does not force a dependency.

The interface is deliberately minimal. It does not include `list`, `search`, or `delete` because those are application concerns, not library concerns.

## Why Option Validation

When creating a wait, you declare the valid options upfront (e.g., `["approve", "reject"]`). The `resume` function rejects any option not in that list.

This prevents:
- **Typos** in webhook query parameters silently succeeding
- **Malicious callbacks** injecting unexpected values
- **Stale buttons** from old notification versions sending options that no longer exist

The validation is cheap (array `.includes()`) and catches real bugs.

## Why Timeout Support

Approval requests should not live forever. A deployment gate from two weeks ago should not suddenly fire when someone finds an old email. Timeouts prevent this:

- **Abandoned approvals.** If nobody responds in 24 hours, the wait expires and the workflow can take a default action (or alert).
- **Security.** Old webhook URLs become inert after expiry. No risk of accidental late approvals.
- **Cleanup.** Expired waits can be garbage-collected by the store implementation.

Timeouts are optional. Omit `timeoutMs` for waits that should live indefinitely.

## Why Immutable State Transitions

A wait record moves through exactly one path:

```
pending -> completed   (human responded)
pending -> expired     (timeout passed)
```

There is no way to:
- Reopen a completed wait
- Change the selected option after resolution
- Move from expired back to pending

This prevents race conditions (two people clicking different buttons) and makes the audit trail reliable. The first valid response wins; subsequent attempts get a clear error.

## Known Limitations

These are intentional scope boundaries, not bugs:

- **No retry for failed callbacks.** If your webhook handler crashes after `resume()` succeeds, the wait is marked complete. Your application should handle idempotency at the handler level.
- **No partial approval.** A wait resolves with exactly one option. For multi-party approval (3 of 5 must approve), compose multiple sequential waits.
- **Single resolver.** The first valid callback wins. There is no built-in support for collecting responses from multiple reviewers on the same wait. Use separate waits per reviewer instead.
- **No built-in notification.** The library generates URLs but does not send messages. Notification is your application's responsibility -- this keeps the library channel-agnostic.
- **No persistence guarantees.** The `WaitStore` interface does not specify transaction semantics. If your store needs atomic resolve-or-fail behavior, implement it in your store's `resolve` method.
