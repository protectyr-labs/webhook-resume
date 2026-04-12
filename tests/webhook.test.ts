import { describe, it, expect } from 'vitest';
import { createWait, resume, buildCallbackUrls, createInMemoryStore } from '../src/index';

describe('createWait', () => {
  it('creates a pending wait with options', async () => {
    const store = createInMemoryStore();
    const result = await createWait(store, {
      workflowId: 'wf-1',
      options: ['approve', 'reject'],
    });
    expect(result.waitId).toBeTruthy();
    expect(result.webhookPath).toContain(result.waitId);
    const record = await store.get(result.waitId);
    expect(record?.status).toBe('pending');
    expect(record?.options).toEqual(['approve', 'reject']);
  });

  it('supports timeout', async () => {
    const store = createInMemoryStore();
    const result = await createWait(store, {
      workflowId: 'wf-1',
      options: ['approve'],
      timeoutMs: 60000,
    });
    expect(result.expiresAt).not.toBeNull();
  });
});

describe('resume', () => {
  it('resolves a pending wait with valid option', async () => {
    const store = createInMemoryStore();
    const { waitId } = await createWait(store, {
      workflowId: 'wf-1',
      options: ['approve', 'reject'],
    });
    const result = await resume(store, waitId, 'approve');
    expect(result.ok).toBe(true);
    expect(result.option).toBe('approve');
    expect(result.record?.status).toBe('completed');
  });

  it('rejects invalid option', async () => {
    const store = createInMemoryStore();
    const { waitId } = await createWait(store, {
      workflowId: 'wf-1',
      options: ['approve', 'reject'],
    });
    const result = await resume(store, waitId, 'maybe');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Invalid option');
  });

  it('rejects already resolved wait', async () => {
    const store = createInMemoryStore();
    const { waitId } = await createWait(store, {
      workflowId: 'wf-1',
      options: ['approve'],
    });
    await resume(store, waitId, 'approve');
    const second = await resume(store, waitId, 'approve');
    expect(second.ok).toBe(false);
    expect(second.error).toContain('completed');
  });

  it('rejects expired wait', async () => {
    const store = createInMemoryStore();
    const { waitId } = await createWait(store, {
      workflowId: 'wf-1',
      options: ['approve'],
      timeoutMs: 1, // expires immediately
    });
    // Small delay to ensure expiry
    await new Promise(r => setTimeout(r, 10));
    const result = await resume(store, waitId, 'approve');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('expired');
  });

  it('rejects nonexistent wait', async () => {
    const store = createInMemoryStore();
    const result = await resume(store, 'fake-id', 'approve');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not found');
  });
});

describe('buildCallbackUrls', () => {
  it('generates URLs for each option', () => {
    const urls = buildCallbackUrls('https://api.example.com', 'wait-123', ['approve', 'reject', 'edit']);
    expect(urls.approve).toBe('https://api.example.com/webhook/resume/wait-123?option=approve');
    expect(urls.reject).toContain('option=reject');
    expect(urls.edit).toContain('option=edit');
    expect(Object.keys(urls)).toHaveLength(3);
  });

  it('encodes special characters in options', () => {
    const urls = buildCallbackUrls('https://api.example.com', 'w-1', ['approve & send']);
    expect(urls['approve & send']).toContain('approve%20%26%20send');
  });
});
