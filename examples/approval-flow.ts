/**
 * Example: Content Approval Workflow
 *
 * Demonstrates the full pause/resume pattern:
 * 1. Workflow creates a wait point with approval options
 * 2. Callback URLs are generated for each option
 * 3. (In production, URLs are sent via notification — Slack, email, etc.)
 * 4. When the reviewer clicks a button, the webhook fires
 * 5. Workflow resumes with the reviewer's decision
 */

import {
  createWait,
  resume,
  buildCallbackUrls,
  createInMemoryStore,
} from '../src/index';

async function main() {
  const store = createInMemoryStore();
  const BASE_URL = 'https://api.example.com';

  // --- Step 1: Workflow reaches a decision point ---
  console.log('=== Content Approval Workflow ===\n');
  console.log('Draft blog post ready for review...\n');

  const wait = await createWait(store, {
    workflowId: 'blog-post-42',
    options: ['approve', 'reject', 'request_edits'],
    timeoutMs: 24 * 60 * 60 * 1000, // 24 hours
    metadata: {
      title: 'Getting Started with Webhook Patterns',
      author: 'engineering',
      draftUrl: 'https://cms.example.com/drafts/42',
    },
  });

  console.log(`Wait created: ${wait.waitId}`);
  console.log(`Webhook path: ${wait.webhookPath}`);
  console.log(`Expires at: ${wait.expiresAt}\n`);

  // --- Step 2: Build callback URLs for notification buttons ---
  const urls = buildCallbackUrls(
    BASE_URL,
    wait.waitId,
    ['approve', 'reject', 'request_edits'],
  );

  console.log('Callback URLs for notification buttons:');
  console.log(`  Approve:       ${urls.approve}`);
  console.log(`  Reject:        ${urls.reject}`);
  console.log(`  Request Edits: ${urls.request_edits}`);
  console.log();

  // --- Step 3: Simulate webhook callback (reviewer clicks "approve") ---
  console.log('--- Reviewer clicks "Approve" ---\n');

  const result = await resume(store, wait.waitId, 'approve');

  if (result.ok) {
    console.log(`Decision: ${result.option}`);
    console.log(`Resolved at: ${result.record?.resolvedAt}`);
    console.log('\nWorkflow continues: publishing post...');
  } else {
    console.log(`Error: ${result.error}`);
  }

  // --- Step 4: Show that double-resolve is prevented ---
  console.log('\n--- Attempting duplicate callback ---\n');

  const duplicate = await resume(store, wait.waitId, 'reject');
  console.log(`Duplicate blocked: ${duplicate.error}`);

  // --- Step 5: Show expired wait handling ---
  console.log('\n=== Expired Wait Demo ===\n');

  const expiring = await createWait(store, {
    workflowId: 'urgent-deploy-7',
    options: ['approve', 'reject'],
    timeoutMs: 1, // expires immediately
  });

  // Wait for expiry
  await new Promise(r => setTimeout(r, 10));

  const expired = await resume(store, expiring.waitId, 'approve');
  console.log(`Expired wait result: ${expired.error}`);
}

main().catch(console.error);
