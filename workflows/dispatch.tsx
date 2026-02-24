import { createSmithers, Sequence, runWorkflow } from "smithers";
import { Octokit } from "@octokit/rest";
import { z } from "zod";
import { frontendAgent } from "../agents/frontend";
import { backendAgent } from "../agents/backend";
import { testingAgent } from "../agents/testing";
import { reviewAgent } from "../agents/review";
import { securityAgent } from "../agents/security";

type AgentInstance = ReturnType<typeof frontendAgent>;

// ---------------------------------------------------------------------------
// Env vars
// ---------------------------------------------------------------------------
const OWNER = process.env.SMITHERS_OWNER ?? "";
const REPO = process.env.SMITHERS_REPO ?? "";
const BRANCH = process.env.SMITHERS_BRANCH ?? "";
const ISSUE = process.env.SMITHERS_ISSUE; // single or comma-separated: "42" or "42,43,45"
const LABEL = process.env.SMITHERS_LABEL; // filter by label
const MODEL = process.env.SMITHERS_MODEL; // force model: "opus" | "sonnet"
const MAX_CONCURRENCY = Number(process.env.SMITHERS_MAX_CONCURRENCY ?? "3");
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "";

if (!OWNER || !REPO || !BRANCH || !GITHUB_TOKEN) {
  console.error(
    "Usage: SMITHERS_OWNER=<org> SMITHERS_REPO=<repo> SMITHERS_BRANCH=<target> GITHUB_TOKEN=<pat> bun run workflows/dispatch.tsx",
  );
  process.exit(1);
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });

// ---------------------------------------------------------------------------
// Rate-limit retry helper
// ---------------------------------------------------------------------------
async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status
        ?? (err as { response?: { status?: number } })?.response?.status;
      if ((status === 403 || status === 429) && attempt < retries - 1) {
        const delay = 1000 * 2 ** attempt;
        console.warn(`Rate limited (HTTP ${status}), retrying in ${delay}ms… (attempt ${attempt + 1}/${retries})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error("retryWithBackoff: exhausted retries");
}

// ---------------------------------------------------------------------------
// Concurrency pool
// ---------------------------------------------------------------------------
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let index = 0;
  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }
  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const triageSchema = z.object({
  issues: z.array(
    z.object({
      number: z.number(),
      title: z.string(),
      feasible: z.boolean(),
      rejectReason: z.string().optional(),
      agent: z.enum(["frontend", "backend", "testing", "review", "security"]),
      model: z.enum(["claude-sonnet-4-20250514", "claude-opus-4-20250514"]),
      dependencies: z.array(z.number()),
      reasoning: z.string(),
    }),
  ),
  executionPlan: z.array(
    z.object({
      wave: z.number(),
      issues: z.array(z.number()),
      parallel: z.boolean(),
    }),
  ),
});

const agentResultSchema = z.object({
  issueNumber: z.number(),
  branch: z.string(),
  prNumber: z.number().optional(),
  status: z.enum(["success", "error"]),
  summary: z.string(),
});

const reviewResultSchema = z.object({
  prNumber: z.number(),
  issueNumber: z.number(),
  approved: z.boolean(),
  feedback: z.string(),
});

const reportSchema = z.object({
  resolved: z.array(z.number()),
  rejected: z.array(z.number()),
  errored: z.array(z.number()),
  needsFix: z.array(z.number()),
  mergeConflict: z.array(z.number()),
  summary: z.string(),
});

type TriageOutput = z.infer<typeof triageSchema>;
type AgentResult = z.infer<typeof agentResultSchema>;
type ReviewResult = z.infer<typeof reviewResultSchema>;

// ---------------------------------------------------------------------------
// createSmithers
// ---------------------------------------------------------------------------
const { Workflow, Task, smithers, outputs } = createSmithers({
  triage: triageSchema,
  agentResult: agentResultSchema,
  reviewResult: reviewResultSchema,
  report: reportSchema,
});

// ---------------------------------------------------------------------------
// Agent registry
// ---------------------------------------------------------------------------
type AgentName = "frontend" | "backend" | "testing" | "review" | "security";

const agentFactories: Record<AgentName, (model: string) => AgentInstance> = {
  frontend: frontendAgent,
  backend: backendAgent,
  testing: testingAgent,
  review: reviewAgent,
  security: securityAgent,
};

function resolveModel(issueModel: string): string {
  if (MODEL === "opus") return "claude-opus-4-6";
  if (MODEL === "sonnet") return "claude-sonnet-4-6";
  return issueModel;
}

// ---------------------------------------------------------------------------
// GitHub helpers
// ---------------------------------------------------------------------------
interface GHIssue {
  number: number;
  title: string;
  body: string | null;
  labels: string[];
}

async function fetchIssues(): Promise<GHIssue[]> {
  if (ISSUE) {
    const numbers = ISSUE.split(",").map((n) => Number(n.trim()));
    const results = await Promise.all(
      numbers.map(async (num) => {
        const { data } = await retryWithBackoff(() => octokit.issues.get({
          owner: OWNER,
          repo: REPO,
          issue_number: num,
        }));
        return {
          number: data.number,
          title: data.title,
          body: data.body,
          labels: data.labels.map((l: unknown) =>
            typeof l === "string" ? l : (l as { name: string }).name,
          ),
        };
      }),
    );
    return results;
  }

  const params: Parameters<typeof octokit.issues.listForRepo>[0] = {
    owner: OWNER,
    repo: REPO,
    state: "open",
    per_page: 100,
  };
  if (LABEL) params.labels = LABEL;

  const { data } = await retryWithBackoff(() => octokit.issues.listForRepo(params));
  return data
    .filter((i) => !i.pull_request) // exclude PRs
    .map((i) => ({
      number: i.number,
      title: i.title,
      body: i.body,
      labels: i.labels.map((l: unknown) =>
        typeof l === "string" ? l : (l as { name: string }).name,
      ),
    }));
}

async function setLabels(
  issueNumber: number,
  add: string[],
  remove: string[] = [],
): Promise<void> {
  for (const label of remove) {
    try {
      await retryWithBackoff(() => octokit.issues.removeLabel({
        owner: OWNER,
        repo: REPO,
        issue_number: issueNumber,
        name: label,
      }));
    } catch {
      /* label may not exist */
    }
  }
  if (add.length > 0) {
    await retryWithBackoff(() => octokit.issues.addLabels({
      owner: OWNER,
      repo: REPO,
      issue_number: issueNumber,
      labels: add,
    }));
  }
}

async function commentOnIssue(
  issueNumber: number,
  body: string,
): Promise<void> {
  await retryWithBackoff(() => octokit.issues.createComment({
    owner: OWNER,
    repo: REPO,
    issue_number: issueNumber,
    body,
  }));
}

// ---------------------------------------------------------------------------
// Subprocess helpers (Bun.spawn)
// ---------------------------------------------------------------------------
async function run(
  cmd: string[],
  opts?: { cwd?: string; env?: Record<string, string> },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(cmd, {
    cwd: opts?.cwd,
    env: { ...process.env, ...opts?.env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

async function gitCreateBranch(
  branchName: string,
  baseBranch: string,
): Promise<void> {
  await run(["git", "fetch", "origin", baseBranch]);
  await run(["git", "checkout", "-b", branchName, `origin/${baseBranch}`]);
}

async function gitPushBranch(branchName: string): Promise<void> {
  await run(["git", "push", "origin", branchName]);
}

async function createPR(
  branchName: string,
  title: string,
  body: string,
): Promise<number> {
  const { data } = await retryWithBackoff(() => octokit.pulls.create({
    owner: OWNER,
    repo: REPO,
    head: branchName,
    base: BRANCH,
    title,
    body,
  }));
  return data.number;
}

async function mergePR(prNumber: number): Promise<boolean> {
  try {
    await retryWithBackoff(() => octokit.pulls.merge({
      owner: OWNER,
      repo: REPO,
      pull_number: prNumber,
      merge_method: "squash",
    }));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Core execution logic
// ---------------------------------------------------------------------------
async function triageIssues(issues: GHIssue[]): Promise<TriageOutput> {
  const triageAgent = reviewAgent(resolveModel("claude-sonnet-4-6"));

  for (const i of issues) {
    if (!i.body) {
      console.warn(`Warning: Issue #${i.number} has no body, triaging from title only`);
    }
  }

  const issuesSummary = issues
    .map(
      (i) =>
        `#${i.number} "${i.title}" [${i.labels.join(", ")}]\n${i.body || `[No description provided. Triage based on title: "${i.title}"]`}`,
    )
    .join("\n\n---\n\n");

  const response = await triageAgent.generate({
    prompt: `You are an intelligent issue triage system for ${OWNER}/${REPO}.
Analyze the provided GitHub issues and produce a structured execution plan.

For each issue determine:
- Is it feasible to resolve automatically?
- Which specialized agent should handle it? (frontend, backend, testing, review, security)
- Which model? Use opus for complex/security-critical, sonnet for straightforward.
- What are the dependency relationships between issues?

Group independent issues into parallel waves. Issues that depend on others go in later waves.

Respond with ONLY valid JSON matching the required schema. No markdown, no explanation.

Analyze these GitHub issues and produce a triage plan:\n\n${issuesSummary}`,
    outputSchema: triageSchema,
  });

  return triageSchema.parse(
    typeof response === "string" ? JSON.parse(response) : response,
  );
}

async function executeIssue(
  issue: GHIssue,
  triageInfo: TriageOutput["issues"][number],
): Promise<AgentResult> {
  const branchName = `agent/issue-${issue.number}`;
  const model = resolveModel(triageInfo.model);
  const agent = agentFactories[triageInfo.agent](model);

  try {
    await setLabels(issue.number, ["in-progress"]);

    // Create a working branch from BRANCH
    await gitCreateBranch(branchName, BRANCH);

    // Run the agent
    if (!issue.body) {
      console.warn(`Warning: Issue #${issue.number} has no body, triaging from title only`);
    }
    const issueBody = issue.body || `[No description provided. Triage based on title: "${issue.title}"]`;
    const prompt = `You are working on issue #${issue.number} for ${OWNER}/${REPO}.
Branch: ${branchName} (based on ${BRANCH})

Issue title: ${issue.title}
Issue body:
${issueBody}

Labels: ${issue.labels.join(", ")}

Instructions:
1. Analyze the issue carefully
2. Implement the fix/feature on the current branch
3. Make atomic commits with clear messages referencing #${issue.number}
4. When done, provide a summary of changes made

Do NOT push — the orchestrator handles git operations.`;

    await agent.generate({ prompt });

    // Push and create PR
    await gitPushBranch(branchName);
    const prNumber = await createPR(
      branchName,
      `fix: resolve #${issue.number} — ${issue.title}`,
      `Resolves #${issue.number}\n\nAutomated fix by \`${triageInfo.agent}\` agent.`,
    );

    await setLabels(issue.number, ["triaged"], ["in-progress"]);

    return {
      issueNumber: issue.number,
      branch: branchName,
      prNumber,
      status: "success",
      summary: `PR #${prNumber} created on branch ${branchName}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await commentOnIssue(
      issue.number,
      `Agent \`${triageInfo.agent}\` failed:\n\`\`\`\n${message}\n\`\`\``,
    );
    await setLabels(issue.number, ["error"], ["in-progress"]);
    return {
      issueNumber: issue.number,
      branch: branchName,
      status: "error",
      summary: message,
    };
  }
}

async function reviewPR(result: AgentResult): Promise<ReviewResult> {
  if (!result.prNumber || result.status === "error") {
    return {
      prNumber: result.prNumber ?? 0,
      issueNumber: result.issueNumber,
      approved: false,
      feedback: "Skipped — no PR or agent error.",
    };
  }

  const reviewer = reviewAgent(resolveModel("claude-sonnet-4-20250514"));

  try {
    const { data: diff } = await retryWithBackoff(() => octokit.pulls.get({
      owner: OWNER,
      repo: REPO,
      pull_number: result.prNumber,
      mediaType: { format: "diff" },
    }));

    const response = await reviewer.generate({
      prompt: `Review PR #${result.prNumber} for ${OWNER}/${REPO}.

Diff:
${diff as unknown as string}

Respond with JSON: { "prNumber": ${result.prNumber}, "issueNumber": ${result.issueNumber}, "approved": true/false, "feedback": "..." }
If approved, feedback should summarize what looks good.
If not approved, feedback should list what needs fixing.`,
      outputSchema: reviewResultSchema,
    });

    const review = reviewResultSchema.parse(
      typeof response === "string" ? JSON.parse(response) : response,
    );

    if (review.approved) {
      // Merge into BRANCH
      const merged = await mergePR(result.prNumber);
      if (!merged) {
        await commentOnIssue(
          result.issueNumber,
          `Merge conflict on PR #${result.prNumber}. Manual intervention needed.`,
        );
        await setLabels(result.issueNumber, ["merge-conflict"]);
        return { ...review, approved: false, feedback: "Merge conflict" };
      }
    } else {
      await commentOnIssue(result.issueNumber, `Review feedback:\n${review.feedback}`);
      await setLabels(result.issueNumber, ["needs-fix"]);
    }

    return review;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      prNumber: result.prNumber,
      issueNumber: result.issueNumber,
      approved: false,
      feedback: `Review error: ${message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Workflow definition
// ---------------------------------------------------------------------------
const workflow = smithers((ctx) => {
  return (
    <Workflow name="issue-dispatch-v3">
      <Sequence>
        {/* Step 1: Fetch + Triage — runs as a computed Task */}
        <Task id="triage" output={outputs.triage} agent={reviewAgent(resolveModel("claude-sonnet-4-6"))}>
          {async () => {
            console.log("[dispatch] Fetching issues…");
            const issues = await fetchIssues();
            if (issues.length === 0) {
              console.log("[dispatch] No issues found. Exiting.");
              process.exit(0);
            }
            console.log(`[dispatch] Found ${issues.length} issue(s). Triaging…`);
            const triage = await triageIssues(issues);

            // Mark rejected issues
            for (const t of triage.issues) {
              if (!t.feasible) {
                await commentOnIssue(t.number, `Issue rejected by triage: ${t.rejectReason ?? "not feasible"}`);
                await setLabels(t.number, ["rejected"]);
              }
            }

            console.log(`[dispatch] Triage complete. ${triage.executionPlan.length} wave(s).`);
            return triage;
          }}
        </Task>

        {/* Step 2-3: Execute waves + Review — dynamic computed Task */}
        <Task id="execute-and-review" output={outputs.report} agent={reviewAgent(resolveModel("claude-sonnet-4-6"))}>
          {async () => {
            const triage: TriageOutput = ctx.output("triage", { nodeId: "triage" });
            const issues = await fetchIssues();
            const issueMap = new Map(issues.map((i) => [i.number, i]));

            const resolved: number[] = [];
            const rejected: number[] = [];
            const errored: number[] = [];
            const needsFix: number[] = [];
            const mergeConflict: number[] = [];

            // Rejected issues
            for (const t of triage.issues) {
              if (!t.feasible) rejected.push(t.number);
            }

            // Execute waves sequentially
            for (const wave of triage.executionPlan) {
              console.log(`[dispatch] Wave ${wave.wave}: issues ${wave.issues.join(", ")}`);

              // Pull latest BRANCH before each wave (deps may have been merged)
              await run(["git", "fetch", "origin", BRANCH]);

              // Execute all issues in this wave in parallel
              const feasibleInWave = wave.issues.filter((num) => {
                const t = triage.issues.find((i) => i.number === num);
                return t?.feasible;
              });

              const agentResults: AgentResult[] = await runWithConcurrency(
                feasibleInWave.map((num) => async () => {
                  const issue = issueMap.get(num);
                  const triageInfo = triage.issues.find((i) => i.number === num)!;
                  if (!issue) {
                    return {
                      issueNumber: num,
                      branch: "",
                      status: "error" as const,
                      summary: "Issue not found",
                    };
                  }
                  return executeIssue(issue, triageInfo);
                }),
                MAX_CONCURRENCY,
              );

              // Review each PR from this wave
              console.log(`[dispatch] Reviewing wave ${wave.wave} PRs…`);
              const reviewResults: ReviewResult[] = await runWithConcurrency(
                agentResults.map((r) => () => reviewPR(r)),
                MAX_CONCURRENCY,
              );

              // Categorize results
              for (const r of reviewResults) {
                if (r.approved) {
                  resolved.push(r.issueNumber);
                } else if (r.feedback === "Merge conflict") {
                  mergeConflict.push(r.issueNumber);
                } else if (r.feedback.startsWith("Skipped")) {
                  const agentRes = agentResults.find(
                    (a) => a.issueNumber === r.issueNumber,
                  );
                  if (agentRes?.status === "error") errored.push(r.issueNumber);
                } else {
                  needsFix.push(r.issueNumber);
                }
              }
            }

            const summary = [
              `Dispatch complete for ${OWNER}/${REPO} → ${BRANCH}`,
              `Resolved: ${resolved.length} (${resolved.join(", ") || "none"})`,
              `Rejected: ${rejected.length} (${rejected.join(", ") || "none"})`,
              `Errored: ${errored.length} (${errored.join(", ") || "none"})`,
              `Needs fix: ${needsFix.length} (${needsFix.join(", ") || "none"})`,
              `Merge conflict: ${mergeConflict.length} (${mergeConflict.join(", ") || "none"})`,
            ].join("\n");

            console.log(`\n[dispatch] ${summary}`);

            return {
              resolved,
              rejected,
              errored,
              needsFix,
              mergeConflict,
              summary,
            };
          }}
        </Task>
      </Sequence>
    </Workflow>
  );
});

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
const result = await runWorkflow(workflow, {
  input: {
    owner: OWNER,
    repo: REPO,
    branch: BRANCH,
  },
  maxConcurrency: 5,
  onProgress: (event) => {
    if ("type" in event) {
      console.log(`[smithers] ${JSON.stringify(event)}`);
    }
  },
});

console.log(`\n[dispatch] Workflow finished: ${result.status}`);
if (result.status === "failed") {
  console.error("[dispatch] Workflow failed:", result.error);
  process.exit(1);
}
