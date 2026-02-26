import {
  createSmithers,
  Sequence,
  Parallel,
  Worktree,
  Ralph,
  ClaudeCodeAgent,
  runWorkflow,
} from 'smithers';
import { Octokit } from '@octokit/rest';
import { z } from 'zod';
import { triageAgent } from '../agents/triage';
import { frontendAgent } from '../agents/frontend';
import { backendAgent } from '../agents/backend';
import { testingAgent } from '../agents/testing';
import { reviewAgent as reviewAgentFactory } from '../agents/review';
import { securityAgent } from '../agents/security';

// ── Env ─────────────────────────────────────────────────────────────────────

const OWNER = process.env.SMITHERS_OWNER ?? process.env.OWNER ?? 'ZetisLabs';
const REPO = process.env.SMITHERS_REPO ?? process.env.REPO ?? '';
const GITHUB_TOKEN = process.env.SMITHERS_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? '';
const MAX_CONCURRENCY = Number(process.env.SMITHERS_MAX_CONCURRENCY ?? '3');
const BASE_BRANCH = process.env.SMITHERS_BRANCH ?? process.env.BRANCH ?? 'main';

if (!REPO) {
  console.error('Usage: SMITHERS_OWNER=<owner> SMITHERS_REPO=<repo> bun run workflows/dispatch.tsx');
  process.exit(1);
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });

// ── Schemas ─────────────────────────────────────────────────────────────────

const triageSchema = z.object({
  issues: z.array(z.object({
    number: z.number(),
    title: z.string(),
    body: z.string().nullable(),
    labels: z.array(z.string()),
    feasible: z.boolean(),
    rejectReason: z.string().optional(),
    agent: z.enum(['frontend', 'backend', 'testing', 'review', 'security']),
    model: z.enum(['claude-sonnet-4-6', 'claude-opus-4-6']),
    dependencies: z.array(z.number()),
    reasoning: z.string(),
  })),
  executionPlan: z.array(z.object({
    wave: z.number(),
    issues: z.array(z.number()),
    parallel: z.boolean(),
  })),
});

const agentResultSchema = z.object({
  issueNumber: z.number(),
  branch: z.string(),
  prNumber: z.number().optional(),
  status: z.enum(['success', 'error', 'skipped']),
  summary: z.string(),
});

const reviewResultSchema = z.object({
  prNumber: z.number(),
  issueNumber: z.number(),
  approved: z.boolean(),
  category: z.enum(['approved', 'rejected', 'merge-conflict', 'skipped', 'error']),
  feedback: z.string(),
});

const rejectionSchema = z.object({
  rejected: z.array(z.number()),
});

const reportSchema = z.object({
  resolved: z.array(z.number()),
  rejected: z.array(z.number()),
  errored: z.array(z.number()),
  needsFix: z.array(z.number()),
  mergeConflict: z.array(z.number()),
  summary: z.string(),
});

// ── createSmithers ──────────────────────────────────────────────────────────

const { Workflow, Task, smithers, outputs } = createSmithers({
  triage: triageSchema,
  agentResult: agentResultSchema,
  reviewResult: reviewResultSchema,
  rejection: rejectionSchema,
  report: reportSchema,
});

// ── Model resolver ──────────────────────────────────────────────────────────

function resolveModel(model: string): string {
  const override = process.env.SMITHERS_MODEL;
  if (override === 'opus') return 'claude-opus-4-6';
  if (override === 'sonnet') return 'claude-sonnet-4-6';
  return model;
}

// ── Agent factories ─────────────────────────────────────────────────────────

const agentFactories: Record<string, (model: string) => ClaudeCodeAgent> = {
  frontend: frontendAgent,
  backend: backendAgent,
  testing: testingAgent,
  review: reviewAgentFactory,
  security: securityAgent,
};

// ── Review agent ────────────────────────────────────────────────────────────

const MAX_FIX_ITERATIONS = Number(process.env.SMITHERS_MAX_FIX_ITERATIONS ?? '3');

const prReviewAgent = new ClaudeCodeAgent({
  model: resolveModel('claude-sonnet-4-6'),
  systemPrompt: `You are a code reviewer. Review the PR diff and determine if it should be approved or needs changes.

IMPORTANT — Approval criteria:
Only set approved=false (REQUEST_CHANGES) for BLOCKER issues:
- Security vulnerabilities (injection, XSS, auth bypass, secrets exposed)
- Data loss or corruption risks
- Breaking changes without migration path
- Critical bugs that would crash or corrupt data in production
- Missing error handling on critical paths (payments, auth, data writes)

For everything else (code style, naming, minor refactoring, non-critical performance, suggestions):
- Set approved=true
- Include these as suggestions in the feedback field

In your feedback, clearly list each BLOCKER with a short description and the file/line if possible.
Keep feedback actionable — the agent will use it to fix the code automatically.

Respond with structured JSON matching the provided schema.
Be concise but thorough.`,
});

// ── GitHub helpers ──────────────────────────────────────────────────────────

async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw new Error('unreachable');
}

async function fetchOpenIssues(): Promise<Array<{ number: number; title: string; body: string | null; labels: string[] }>> {
  const formatIssue = (i: any) => ({
    number: i.number,
    title: i.title,
    body: i.body,
    labels: i.labels.map((l: any) => typeof l === 'string' ? l : l.name ?? ''),
  });

  // Mode 1: explicit issue numbers
  const explicit = process.env.SMITHERS_ISSUES;
  if (explicit) {
    const nums = explicit.split(',').map(n => n.trim()).filter(Boolean);
    const results = await Promise.all(
      nums.map(n => retryWithBackoff(() => octokit.issues.get({ owner: OWNER, repo: REPO, issue_number: Number(n) })).then(r => r.data))
    );
    return results.filter(i => i.state === 'open' && !i.pull_request).map(formatIssue);
  }

  // Mode 2: filter by label
  const label = process.env.SMITHERS_LABEL;
  if (label) {
    const { data } = await retryWithBackoff(() =>
      octokit.issues.listForRepo({ owner: OWNER, repo: REPO, state: 'open', labels: label, per_page: 30, sort: 'created', direction: 'desc' })
    );
    return data.filter(i => !i.pull_request).map(formatIssue);
  }

  // Mode 3: all open issues (existing behavior)
  const { data } = await retryWithBackoff(() =>
    octokit.issues.listForRepo({ owner: OWNER, repo: REPO, state: 'open', per_page: 30, sort: 'created', direction: 'desc' })
  );
  return data.filter(i => !i.pull_request).map(formatIssue);
}

async function setLabels(issueNumber: number, add: string[], remove?: string[]): Promise<void> {
  await retryWithBackoff(async () => {
    if (remove?.length) {
      for (const label of remove) {
        await octokit.issues.removeLabel({ owner: OWNER, repo: REPO, issue_number: issueNumber, name: label }).catch(() => {});
      }
    }
    if (add.length) {
      await octokit.issues.addLabels({ owner: OWNER, repo: REPO, issue_number: issueNumber, labels: add });
    }
  });
}

async function commentOnIssue(issueNumber: number, body: string): Promise<void> {
  await retryWithBackoff(() =>
    octokit.issues.createComment({ owner: OWNER, repo: REPO, issue_number: issueNumber, body })
  );
}

async function gitPushBranch(branch: string): Promise<void> {
  const proc = Bun.spawn(['git', 'push', '-u', 'origin', branch, '--force-with-lease'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`git push failed (exit ${exitCode}): ${stderr}`);
  }
}

async function createPR(branch: string, issueNumber: number, title: string): Promise<number> {
  const { data } = await retryWithBackoff(() =>
    octokit.pulls.create({
      owner: OWNER,
      repo: REPO,
      title: `fix: ${title} (closes #${issueNumber})`,
      head: branch,
      base: BASE_BRANCH,
      body: `Automated fix for #${issueNumber}\n\nGenerated by smithers-workflows dispatch.`,
    })
  );
  return data.number;
}

async function mergePR(prNumber: number): Promise<boolean> {
  try {
    await retryWithBackoff(() =>
      octokit.pulls.merge({ owner: OWNER, repo: REPO, pull_number: prNumber, merge_method: 'squash' })
    );
    return true;
  } catch {
    return false;
  }
}

// ── Build issues summary for triage prompt ──────────────────────────────────

function buildIssuesSummary(issues: Array<{ number: number; title: string; body: string | null; labels: string[] }>): string {
  return issues.map(i => [
    `### Issue #${i.number}: ${i.title}`,
    `Labels: ${i.labels.length ? i.labels.join(', ') : 'none'}`,
    `Body:\n${(i.body ?? 'No description.').slice(0, 2000)}`,
  ].join('\n')).join('\n\n---\n\n');
}

// ── Workflow ─────────────────────────────────────────────────────────────────

console.log(`Config: owner=${OWNER} repo=${REPO} base_branch=${BASE_BRANCH} max_concurrency=${MAX_CONCURRENCY}`);

const issues = await fetchOpenIssues();
const issuesSummary = buildIssuesSummary(issues);

if (issues.length === 0) {
  console.log('No open issues found. Nothing to dispatch.');
  process.exit(0);
}

const workflow = smithers((ctx) => {
  const triage = ctx.outputMaybe("triage", { nodeId: "triage" });

  const issueDataMap = new Map(
    (triage?.issues ?? []).map(i => [i.number, i])
  );

  return (
    <Workflow name="issue-dispatch-v3">
      <Sequence>
        {/* ── Phase 1 : Triage ── */}
        <Task
          id="triage"
          output={outputs.triage}
          agent={triageAgent(resolveModel('claude-sonnet-4-6'))}
        >
          {`Analyze these GitHub issues from ${OWNER}/${REPO} and produce a triage plan.

Available agents: frontend, backend, testing, review, security.
Available models: claude-sonnet-4-6 (simple tasks), claude-opus-4-6 (complex tasks).

${issuesSummary}`}
        </Task>

        {/* ── Phase 1.5 : Handle rejections ── */}
        {triage && (
          <Task id="handle-rejections" output={outputs.rejection}>
            {async () => {
              const rejected = triage.issues.filter(i => !i.feasible);
              for (const issue of rejected) {
                await commentOnIssue(
                  issue.number,
                  `🤖 **Triage result**: This issue has been marked as not feasible for automated resolution.\n\n**Reason**: ${issue.rejectReason ?? 'Not actionable by an AI agent.'}`
                );
                await setLabels(issue.number, ['rejected']);
              }
              return { rejected: rejected.map(i => i.number) };
            }}
          </Task>
        )}

        {/* ── Phase 2 : Waves d'exécution ── */}
        {triage?.executionPlan.map((wave) => (
          <Sequence key={`wave-${wave.wave}`}>
            <Parallel maxConcurrency={MAX_CONCURRENCY}>
              {wave.issues.map((num) => {
                const info = issueDataMap.get(num);
                if (!info?.feasible) return null;

                const branch = `agent/issue-${num}`;

                return (
                  <Worktree
                    key={`wt-${num}`}
                    path={`./worktrees/issue-${num}`}
                    branch={branch}
                  >
                    <Sequence>
                      {/* ── Ralph loop: impl → push → review, retry on blockers ── */}
                      <Ralph
                        until={!!ctx.outputMaybe("reviewResult", { nodeId: `review-${num}` })?.approved}
                        maxIterations={MAX_FIX_ITERATIONS}
                      >
                        <Sequence>
                          {/* Agent implements the fix (or fixes blockers on retry) */}
                          <Task
                            id={`impl-${num}`}
                            output={outputs.agentResult}
                            agent={agentFactories[info.agent](resolveModel(info.model))}
                            retries={1}
                            continueOnFail
                          >
                            {(() => {
                              const prevReview = ctx.outputMaybe("reviewResult", { nodeId: `review-${num}` });
                              const prevPush = ctx.outputMaybe("agentResult", { nodeId: `push-${num}` });

                              // Retry: fix blockers from previous review
                              if (prevReview && !prevReview.approved) {
                                return `Fix the BLOCKER issues found during code review of PR #${prevPush?.prNumber ?? '?'} for issue #${num} in ${OWNER}/${REPO}.

Issue title: ${info.title}

REVIEW FEEDBACK (fix ONLY the blockers listed below):
${prevReview.feedback}

Instructions:
- Read the review feedback carefully.
- Fix ONLY the BLOCKER issues mentioned above.
- Do NOT refactor or change anything else.
- Run existing tests if available to verify the fix.
- Keep changes minimal and focused.`;
                              }

                              // First iteration: original prompt
                              return `Fix issue #${num} in repo ${OWNER}/${REPO}.

Title: ${info.title}
Labels: ${info.labels.join(', ')}

Description:
${(info.body ?? 'No description.').slice(0, 4000)}

Instructions:
- Read the relevant code and understand the issue fully before making changes.
- Make minimal, focused changes to fix the issue.
- Run existing tests if available to verify the fix.
- Do NOT modify unrelated code.`;
                            })()}
                          </Task>

                          {/* Push + PR (compute) — creates PR on first pass, pushes fixes on retry */}
                          <Task id={`push-${num}`} output={outputs.agentResult} continueOnFail>
                            {async () => {
                              const implResult = ctx.outputMaybe("agentResult", { nodeId: `impl-${num}` });
                              if (!implResult || implResult.status === 'error') {
                                await setLabels(num, ['error'], ['in-progress']);
                                return {
                                  issueNumber: num,
                                  branch: '',
                                  status: 'error' as const,
                                  summary: 'Implementation failed',
                                };
                              }

                              const prevPush = ctx.outputMaybe("agentResult", { nodeId: `push-${num}` });
                              const existingPR = prevPush?.prNumber;

                              try {
                                await gitPushBranch(branch);

                                if (existingPR) {
                                  // PR already exists from previous iteration — just pushed new commits
                                  return {
                                    issueNumber: num,
                                    branch,
                                    prNumber: existingPR,
                                    status: 'success' as const,
                                    summary: `Pushed fixes to existing PR #${existingPR}`,
                                  };
                                }

                                const prNumber = await createPR(branch, num, info.title);
                                await setLabels(num, ['triaged'], ['in-progress']);
                                return {
                                  issueNumber: num,
                                  branch,
                                  prNumber,
                                  status: 'success' as const,
                                  summary: `PR #${prNumber} created`,
                                };
                              } catch (err) {
                                await setLabels(num, ['error'], ['in-progress']);
                                return {
                                  issueNumber: num,
                                  branch,
                                  prNumber: existingPR,
                                  status: 'error' as const,
                                  summary: `Push failed: ${err instanceof Error ? err.message : String(err)}`,
                                };
                              }
                            }}
                          </Task>

                          {/* Review the PR — only blocks on BLOCKER/CRITICAL */}
                          <Task
                            id={`review-${num}`}
                            output={outputs.reviewResult}
                            agent={prReviewAgent}
                            continueOnFail
                            skipIf={!ctx.outputMaybe("agentResult", { nodeId: `push-${num}` })?.prNumber}
                          >
                            {(() => {
                              const pushResult = ctx.outputMaybe("agentResult", { nodeId: `push-${num}` });
                              const prNum = pushResult?.prNumber ?? 0;
                              const iteration = ctx.iterationCount("reviewResult", `review-${num}`) + 1;
                              return `Review PR #${prNum} for issue #${num} in ${OWNER}/${REPO} (review round ${iteration}).
Fetch the diff and evaluate the changes for correctness, security, and quality.
Issue title: ${info.title}

Remember: only set approved=false for BLOCKER issues (security, data loss, crashes).
Approve if only minor/style issues remain.`;
                            })()}
                          </Task>
                        </Sequence>
                      </Ralph>

                      {/* ── Merge after Ralph exits (approved or max iterations) ── */}
                      <Task id={`merge-${num}`} output={outputs.reviewResult} continueOnFail>
                        {async () => {
                          const pushResult = ctx.outputMaybe("agentResult", { nodeId: `push-${num}` });
                          const review = ctx.outputMaybe("reviewResult", { nodeId: `review-${num}` });
                          const prNum = pushResult?.prNumber ?? review?.prNumber ?? 0;

                          if (!review || !prNum) {
                            return {
                              prNumber: prNum,
                              issueNumber: num,
                              approved: false,
                              category: 'skipped' as const,
                              feedback: 'No review available or no PR to merge',
                            };
                          }

                          if (review.approved) {
                            const merged = await mergePR(prNum);
                            if (merged) {
                              await setLabels(num, ['resolved'], ['triaged']);
                              return {
                                prNumber: prNum,
                                issueNumber: num,
                                approved: true,
                                category: 'approved' as const,
                                feedback: review.feedback,
                              };
                            }
                            await setLabels(num, ['merge-conflict'], ['triaged']);
                            return {
                              prNumber: prNum,
                              issueNumber: num,
                              approved: true,
                              category: 'merge-conflict' as const,
                              feedback: 'Approved but merge failed (conflict)',
                            };
                          }

                          // Ralph exited at maxIterations without approval
                          await setLabels(num, ['needs-fix'], ['triaged']);
                          return {
                            prNumber: prNum,
                            issueNumber: num,
                            approved: false,
                            category: 'rejected' as const,
                            feedback: `Still has blockers after ${MAX_FIX_ITERATIONS} attempts. ${review.feedback}`,
                          };
                        }}
                      </Task>
                    </Sequence>
                  </Worktree>
                );
              })}
            </Parallel>
          </Sequence>
        ))}

        {/* ── Phase 3 : Rapport final ── */}
        {triage && (
          <Task id="report" output={outputs.report}>
            {() => {
              const allResults = ctx.outputs.agentResult ?? [];
              const allReviews = ctx.outputs.reviewResult ?? [];

              const resolved = allReviews
                .filter(r => r.category === 'approved')
                .map(r => r.issueNumber);
              const rejected = (triage?.issues ?? [])
                .filter(i => !i.feasible)
                .map(i => i.number);
              const errored = allResults
                .filter(r => r.status === 'error')
                .map(r => r.issueNumber);
              const needsFix = allReviews
                .filter(r => r.category === 'rejected')
                .map(r => r.issueNumber);
              const mergeConflict = allReviews
                .filter(r => r.category === 'merge-conflict')
                .map(r => r.issueNumber);

              const total = triage?.issues.length ?? 0;
              const summary = [
                `Dispatch complete for ${OWNER}/${REPO}.`,
                `Total issues triaged: ${total}`,
                `Resolved: ${resolved.length}`,
                `Rejected (not feasible): ${rejected.length}`,
                `Errored: ${errored.length}`,
                `Needs fix: ${needsFix.length}`,
                `Merge conflicts: ${mergeConflict.length}`,
              ].join('\n');

              return { resolved, rejected, errored, needsFix, mergeConflict, summary };
            }}
          </Task>
        )}
      </Sequence>
    </Workflow>
  );
});

// ── Run ─────────────────────────────────────────────────────────────────────

const result = await runWorkflow(workflow, {
  input: {
    owner: OWNER,
    repo: REPO,
    issueCount: issues.length,
  },
  onProgress: (event) => {
    const verbose = process.env.SMITHERS_VERBOSE === 'true';
    const ts = new Date(event.timestampMs).toLocaleTimeString();

    switch (event.type) {
      case 'RunStarted':
        console.log(`\n[${ts}] ▶ Run started (${event.runId})`);
        break;
      case 'RunFinished':
        console.log(`[${ts}] ■ Run finished (${event.runId})`);
        break;
      case 'RunFailed':
        console.error(`[${ts}] ■ Run FAILED: ${event.error}`);
        break;
      case 'NodeStarted':
        console.log(`[${ts}] → ${event.nodeId} started (attempt ${event.attempt})`);
        if (event.nodeId.startsWith('impl-')) {
          const issueNum = Number(event.nodeId.replace('impl-', ''));
          setLabels(issueNum, ['in-progress']).catch(() => {});
        }
        break;
      case 'NodeFinished':
        console.log(`[${ts}] ✓ ${event.nodeId} completed`);
        break;
      case 'NodeFailed':
        console.error(`[${ts}] ✗ ${event.nodeId} FAILED (attempt ${event.attempt}): ${event.error}`);
        break;
      case 'NodeSkipped':
        console.log(`[${ts}] ⊘ ${event.nodeId} skipped`);
        break;
      case 'NodeRetrying':
        console.log(`[${ts}] ↻ ${event.nodeId} retrying (attempt ${event.attempt})`);
        break;
      case 'ToolCallStarted':
        if (verbose) console.log(`[${ts}]   🔧 ${event.nodeId} → ${event.toolName}`);
        break;
      case 'ToolCallFinished':
        if (verbose) console.log(`[${ts}]   🔧 ${event.nodeId} → ${event.toolName} [${event.status}]`);
        break;
      case 'NodeOutput':
        if (verbose) {
          const prefix = event.stream === 'stderr' ? '⚠' : '│';
          process.stdout.write(`[${ts}]   ${prefix} ${event.nodeId}: ${event.text}\n`);
        }
        break;
      case 'FrameCommitted':
        if (verbose) console.log(`[${ts}] 📸 Frame #${event.frameNo} committed`);
        break;
    }
  },
});

console.log(`\nWorkflow ${result.status}. Run ID: ${result.runId}`);
