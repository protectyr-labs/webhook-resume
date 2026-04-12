/**
 * Webhook Resume — pause/resume primitives for async workflows.
 *
 * Enables human-in-the-loop patterns:
 * 1. Workflow reaches a decision point
 * 2. Sends notification (Slack, email, chat) with action buttons
 * 3. Pauses execution, generating a unique webhook URL
 * 4. Human clicks a button → webhook fires → workflow resumes with decision
 *
 * Storage-agnostic: implement WaitStore for your backend.
 */

import { randomUUID } from 'crypto';

export type WaitStatus = 'pending' | 'completed' | 'expired';

export interface WaitRecord {
  id: string;
  workflowId: string;
  status: WaitStatus;
  options: string[]; // valid callback values (e.g., ["approve", "reject", "edit"])
  createdAt: string;
  expiresAt: string | null;
  resolvedAt: string | null;
  resolvedWith: string | null; // the option that was selected
  metadata?: Record<string, unknown>;
}

export interface WaitStore {
  create(record: WaitRecord): Promise<void>;
  get(id: string): Promise<WaitRecord | null>;
  resolve(id: string, option: string): Promise<WaitRecord>;
  expire(id: string): Promise<void>;
}

export interface CreateWaitOptions {
  workflowId: string;
  options: string[];
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
}

export interface WaitResult {
  waitId: string;
  webhookPath: string;
  expiresAt: string | null;
}

export interface ResumeResult {
  ok: boolean;
  option?: string;
  error?: string;
  record?: WaitRecord;
}

/**
 * Create a wait point in a workflow.
 *
 * Returns a waitId and webhookPath. Send the webhookPath to the human
 * (via Slack button, email link, chat action). When they click,
 * call `resume()` with the waitId and their chosen option.
 */
export async function createWait(
  store: WaitStore,
  options: CreateWaitOptions,
): Promise<WaitResult> {
  const id = randomUUID();
  const now = new Date();
  const expiresAt = options.timeoutMs
    ? new Date(now.getTime() + options.timeoutMs).toISOString()
    : null;

  const record: WaitRecord = {
    id,
    workflowId: options.workflowId,
    status: 'pending',
    options: options.options,
    createdAt: now.toISOString(),
    expiresAt,
    resolvedAt: null,
    resolvedWith: null,
    metadata: options.metadata,
  };

  await store.create(record);

  return {
    waitId: id,
    webhookPath: `/webhook/resume/${id}`,
    expiresAt,
  };
}

/**
 * Resume a paused workflow with the human's decision.
 *
 * Validates:
 * - Wait exists
 * - Wait is still pending (not already resolved or expired)
 * - Selected option is in the allowed list
 * - Wait has not timed out
 */
export async function resume(
  store: WaitStore,
  waitId: string,
  option: string,
): Promise<ResumeResult> {
  const record = await store.get(waitId);

  if (!record) {
    return { ok: false, error: 'Wait not found' };
  }

  if (record.status !== 'pending') {
    return { ok: false, error: `Wait is ${record.status}, not pending` };
  }

  // Check timeout
  if (record.expiresAt) {
    const now = new Date();
    const expiry = new Date(record.expiresAt);
    if (now > expiry) {
      await store.expire(record.id);
      return { ok: false, error: 'Wait has expired' };
    }
  }

  // Validate option
  if (!record.options.includes(option)) {
    return {
      ok: false,
      error: `Invalid option '${option}'. Valid: ${record.options.join(', ')}`,
    };
  }

  const resolved = await store.resolve(waitId, option);

  return { ok: true, option, record: resolved };
}

/**
 * Build callback URLs for each option.
 * Use these as button URLs in Slack, email, or any chat platform.
 */
export function buildCallbackUrls(
  baseUrl: string,
  waitId: string,
  options: string[],
): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const opt of options) {
    urls[opt] = `${baseUrl}/webhook/resume/${waitId}?option=${encodeURIComponent(opt)}`;
  }
  return urls;
}

/**
 * In-memory wait store for development and testing.
 */
export function createInMemoryStore(): WaitStore {
  const records = new Map<string, WaitRecord>();

  return {
    async create(record) {
      records.set(record.id, { ...record });
    },

    async get(id) {
      const r = records.get(id);
      return r ? { ...r } : null;
    },

    async resolve(id, option) {
      const r = records.get(id);
      if (!r) throw new Error(`Wait ${id} not found`);
      const resolved: WaitRecord = {
        ...r,
        status: 'completed',
        resolvedAt: new Date().toISOString(),
        resolvedWith: option,
      };
      records.set(id, resolved);
      return { ...resolved };
    },

    async expire(id) {
      const r = records.get(id);
      if (!r) return;
      records.set(id, { ...r, status: 'expired' });
    },
  };
}
