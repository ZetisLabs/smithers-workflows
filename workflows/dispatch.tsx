import { createSmithers, Sequence, Parallel } from 'smithers-orchestrator'
import { ClaudeCodeAgent } from 'smithers'
import { Octokit } from '@octokit/rest'
import { z } from 'zod'

// ─── ENV VALIDATION ──────────────────────────────────────────────────────────

const OWNER = process.env.OWNER
const REPO = process.env.REPO
const BRANCH = process.env.BRANCH
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const ISSUE = process.env.ISSUE
const LABEL = process.env.LABEL
const MODEL = process.env.MODEL as 'opus' | 'sonnet' | undefined

if (!OWNER || !REPO || !BRANCH || !GITHUB_TOKEN || !ANTHROPIC_API_KEY) {
  console.error(`[dispatch] Missing required env vars.
  Required: OWNER, REPO, BRANCH, GITHUB_TOKEN, ANTHROPIC_API_KEY
  Optional: ISSUE (single or comma-separated), LABEL, MODEL (opus|sonnet)

  Usage:
    OWNER=ZetisLabs REPO=myrepo BRANCH=dev bun run workflows/dispatch.tsx
    ISSUE=42 OWNER=ZetisLabs REPO=myrepo BRANCH=dev bun run workflows/dispatch.tsx
    LABEL=bug OWNER=ZetisLabs REPO=myrepo BRANCH=dev bun run workflows/dispatch.tsx`)
  process.exit(1)
}

const MODEL_MAP = {
  opus: 'claude-opus-4-20250514',
  sonnet: 'claude-sonnet-4-20250514',
} as const

const DEFAULT_MODEL = 'claude-sonnet-4-20250514'

// ─── GITHUB CLIENT ───────────────────────────────────────────────────────────

const octokit = new Octokit({ auth: GITHUB_TOKEN })

// ─── AGENT IMPORTS ───────────────────────────────────────────────────────────

import { frontendAgent } from '../agents/frontend'
import { backendAgent } from '../agents/backend'
import { testingAgent } from '../agents/testing'
import { reviewAgent } from '../agents/review'
import { securityAgent } from '../agents/security'

type AgentName = 'frontend' | 'backend' | 'testing' | 'review' | 'security'

const agentFactories: Record<AgentName, (model: string) => InstanceType<typeof ClaudeCodeAgent>> = {
  frontend: frontendAgent,
  backend: backendAgent,
  testing: testingAgent,
  review: reviewAgent,
  security: securityAgent,
}

// ─── LABEL MANAGEMENT ────────────────────────────────────────────────────────

const LABELS = {
  IN_PROGRESS: 'in-progress',
  TRIAGED: 'triaged',
  NEEDS_FIX: 'needs-fix',
  REJECTED: 'rejected',
  ERROR: 'error',
  MERGE_CONFLICT: 'merge-conflict',
} as const

async function ensureLabelsExist(): Promise<void> {
  const labelColors: Record<string, string> = {
    'in-progress': '0052CC',
    'triaged': '0E8A16',
    'needs-fix': 'D93F0B',
    'rejected': 'B60205',
    'error': 'E11D48',
    'merge-conflict': 'FBCA04',
  }

  for (const [name, color] of Object.entries(labelColors)) {
    try {
      await octokit.issues.createLabel({ owner: OWNER, repo: REPO, name, color })
    } catch {
      // Label already exists — ignore
    }
  }
}

async function setLabel(issueNumber: number, label: string): Promise<void> {
  try {
    await octokit.issues.addLabels({ owner: OWNER, repo: REPO, issue_number: issueNumber, labels: [label] })
  } catch (err) {
    console.error(`[dispatch] Failed to add label "${label}" to #${issueNumber}:`, err)
  }
}

async function removeLabel(issueNumber: number, label: string): Promise<void> {
  try {
    await octokit.issues.removeLabel({ owner: OWNER, repo: REPO, issue_number: issueNumber, name: label })
  } catch {
    // Label not present — ignore
  }
}

async function commentOnIssue(issueNumber: number, body: string): Promise<void> {
  try {
    await octokit.issues.createComment({ owner: OWNER, repo: REPO, issue_number: issueNumber, body })
  } catch (err) {
    console.error(`[dispatch] Failed to comment on #${issueNumber}:`, err)
  }
}

// ─── SCHEMAS ─────────────────────────────────────────────────────────────────

const triageIssueSchema = z.object({
  number: z.number(),
  title: z.string(),
  feasible: z.boolean(),
  rejectReason: z.string().optional(),
  agent: z.enum(['frontend', 'backend', 'testing', 'review', 'security']),
  model: z.enum(['claude-sonnet-4-20250514', 'claude-opus-4-20250514']),
  dependencies: z.array(z.number()),
  reasoning: z.string(),
})

const triageSchema = z.object({
  issues: z.array(triageIssueSchema),
  executionPlan: z.array(z.object({
    wave: z.number(),
    issues: z.array(z.number()),
    parallel: z.boolean(),
  })),
})

type TriageResult = z.infer<typeof triageSchema>
type TriagedIssue = z.infer<typeof triageIssueSchema>

interface GitHubIssue {
  number: number
  title: string
  body: string | null
  labels: string[]
  state: string
}

interface WaveResult {
  issueNumber: number
  success: boolean
  prNumber?: number
  error?: string
}

// ─── STEP 1: FETCH ISSUES ───────────────────────────────────────────────────

async function fetchIssues(): Promise<GitHubIssue[]> {
  // Priority: ISSUE > LABEL > all open
  if (ISSUE) {
    const numbers = ISSUE.split(',').map(n => Number(n.trim())).filter(n => n > 0)
    console.log(`[dispatch] Fetching specific issues: ${numbers.join(', ')}`)

    const results = await Promise.all(
      numbers.map(async (num) => {
        try {
          const { data } = await octokit.issues.get({ owner: OWNER, repo: REPO, issue_number: num })
          return {
            number: data.number,
            title: data.title,
            body: data.body,
            labels: data.labels.map((l: any) => typeof l === 'string' ? l : l.name ?? ''),
            state: data.state,
          } satisfies GitHubIssue
        } catch (err) {
          console.error(`[dispatch] Issue #${num} not found, skipping.`)
          return null
        }
      })
    )
    return results.filter((r): r is GitHubIssue => r !== null)
  }

  const params: Parameters<typeof octokit.issues.listForRepo>[0] = {
    owner: OWNER,
    repo: REPO,
    state: 'open',
    per_page: 100,
  }

  if (LABEL) {
    params.labels = LABEL
    console.log(`[dispatch] Fetching open issues with label: ${LABEL}`)
  } else {
    console.log(`[dispatch] Fetching all open issues`)
  }

  const { data } = await octokit.issues.listForRepo(params)

  // Filter out pull requests (GitHub API returns PRs in issues endpoint)
  return data
    .filter((issue: any) => !issue.pull_request)
    .map((issue: any) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body,
      labels: issue.labels.map((l: any) => typeof l === 'string' ? l : l.name ?? ''),
      state: issue.state,
    }))
}

// ─── STEP 2: TRIAGE WITH AI ─────────────────────────────────────────────────

async function triageIssues(issues: GitHubIssue[]): Promise<TriageResult> {
  const triageModel = MODEL ? MODEL_MAP[MODEL] : DEFAULT_MODEL

  const issuesSummary = issues.map(i =>
    `### Issue #${i.number}: ${i.title}\nLabels: ${i.labels.join(', ') || 'none'}\nBody:\n${i.body ?? '(empty)'}`
  ).join('\n\n---\n\n')

  const triagePrompt = `You are an AI triage system for the GitHub repository ${OWNER}/${REPO}.

Analyze the following issues and produce a structured triage plan.

For each issue, determine:
1. **feasible**: Can an AI coding agent reasonably handle this? (false for vague requests, infra changes, access issues, etc.)
2. **agent**: Which specialized agent should handle it:
   - "frontend": React, TypeScript, UI/UX, CSS, components, accessibility
   - "backend": APIs, databases, authentication, server logic, DevOps
   - "testing": Writing tests, test coverage, test infrastructure
   - "review": Code review, refactoring, architecture improvements
   - "security": Vulnerabilities, OWASP, secrets, dependency audits
3. **model**: Which Claude model to use:
   - "claude-opus-4-20250514" for complex architectural tasks
   - "claude-sonnet-4-20250514" for standard implementation tasks
4. **dependencies**: List issue numbers this issue depends on (e.g., if #5 needs changes from #3 first)
5. **reasoning**: Brief explanation of your decision

Then build an execution plan with parallel waves:
- Wave 1: Issues with no dependencies (can run in parallel)
- Wave 2: Issues whose dependencies are all in wave 1
- Wave N: Issues whose dependencies are all in waves < N

ISSUES:
${issuesSummary}

Respond with valid JSON matching this exact schema:
{
  "issues": [
    {
      "number": <int>,
      "title": "<string>",
      "feasible": <bool>,
      "rejectReason": "<string, only if feasible=false>",
      "agent": "<frontend|backend|testing|review|security>",
      "model": "<claude-sonnet-4-20250514|claude-opus-4-20250514>",
      "dependencies": [<issue numbers>],
      "reasoning": "<string>"
    }
  ],
  "executionPlan": [
    { "wave": 1, "issues": [<issue numbers>], "parallel": true },
    { "wave": 2, "issues": [<issue numbers>], "parallel": true }
  ]
}

IMPORTANT: Only output the JSON, no markdown fences, no explanation.`

  const agent = new ClaudeCodeAgent({
    model: triageModel,
    systemPrompt: 'You are a precise JSON-outputting triage system. Output only valid JSON, nothing else.',
  })

  console.log(`[dispatch] Triaging ${issues.length} issues with ${triageModel}...`)

  const result = await agent.generate({ prompt: triagePrompt })
  const text = typeof result === 'string' ? result : result?.text ?? result?.stdout ?? ''

  // Extract JSON from response (handle possible markdown fences)
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error(`[dispatch] Triage failed: no JSON in response.\nRaw output:\n${text.slice(0, 500)}`)
  }

  const parsed = JSON.parse(jsonMatch[0])
  const validated = triageSchema.parse(parsed)

  console.log(`[dispatch] Triage complete:`)
  for (const issue of validated.issues) {
    const status = issue.feasible ? `→ ${issue.agent} (${issue.model.includes('opus') ? 'opus' : 'sonnet'})` : `✗ rejected: ${issue.rejectReason}`
    console.log(`  #${issue.number} ${issue.title}: ${status}`)
  }
  for (const wave of validated.executionPlan) {
    console.log(`  Wave ${wave.wave}: [${wave.issues.join(', ')}] (parallel: ${wave.parallel})`)
  }

  return validated
}

// ─── STEP 3: EXECUTE AGENT ON ISSUE ─────────────────────────────────────────

async function executeAgentOnIssue(triaged: TriagedIssue, issue: GitHubIssue): Promise<WaveResult> {
  const branchName = `agent/issue-${triaged.number}`
  const agentModel = MODEL ? MODEL_MAP[MODEL] : triaged.model

  console.log(`[dispatch] ▶ Starting ${triaged.agent} agent on #${triaged.number} (${agentModel})`)

  await setLabel(triaged.number, LABELS.IN_PROGRESS)
  await commentOnIssue(triaged.number, `🤖 **Smithers Dispatch** — Agent \`${triaged.agent}\` starting work on this issue.\n\nBranch: \`${branchName}\`\nModel: \`${agentModel}\``)

  try {
    // Create branch from target BRANCH
    const { data: ref } = await octokit.git.getRef({ owner: OWNER, repo: REPO, ref: `heads/${BRANCH}` })
    const baseSha = ref.object.sha

    try {
      await octokit.git.createRef({ owner: OWNER, repo: REPO, ref: `refs/heads/${branchName}`, sha: baseSha })
    } catch {
      // Branch might already exist — update it
      await octokit.git.updateRef({ owner: OWNER, repo: REPO, ref: `heads/${branchName}`, sha: baseSha, force: true })
    }

    // Build the agent prompt
    const agentPrompt = `You are working on issue #${triaged.number} for the repository ${OWNER}/${REPO}.

ISSUE TITLE: ${issue.title}

ISSUE BODY:
${issue.body ?? '(no description)'}

INSTRUCTIONS:
1. You are on branch \`${branchName}\` which is based on \`${BRANCH}\`.
2. Read the codebase to understand the context.
3. Implement the changes needed to resolve this issue.
4. Make sure your changes are complete and correct.
5. Commit your changes with a clear message referencing the issue: "fix: resolve #${triaged.number} — <summary>"
6. Do NOT push — the orchestrator handles git operations.

Focus on quality, correctness, and minimal scope. Only change what is needed.`

    // Spawn agent as subprocess using Bun.spawn
    const agentFactory = agentFactories[triaged.agent]
    const agent = agentFactory(agentModel)

    // Use ClaudeCodeAgent with cwd set to a clone, or run via Bun.spawn for isolation
    const proc = Bun.spawn([
      'claude',
      '--print',
      '--model', agentModel,
      '--allowedTools', 'Read,Write,Edit,Bash,Grep,Glob',
      '--dangerously-skip-permissions',
      '--output-format', 'text',
      '-p', agentPrompt,
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ANTHROPIC_API_KEY,
        GIT_BRANCH: branchName,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    if (exitCode !== 0) {
      throw new Error(`Agent exited with code ${exitCode}.\nSTDERR: ${stderr.slice(0, 1000)}`)
    }

    console.log(`[dispatch] ✓ Agent ${triaged.agent} completed #${triaged.number}`)

    // Create PR from agent branch to target branch
    let prNumber: number | undefined
    try {
      const { data: pr } = await octokit.pulls.create({
        owner: OWNER,
        repo: REPO,
        title: `fix: resolve #${triaged.number} — ${issue.title}`,
        body: `Automated PR from Smithers dispatch.\n\nCloses #${triaged.number}\n\nAgent: \`${triaged.agent}\`\nModel: \`${agentModel}\``,
        head: branchName,
        base: BRANCH,
      })
      prNumber = pr.number
      console.log(`[dispatch]   PR #${prNumber} created`)
    } catch (err: any) {
      // PR might already exist or no changes
      if (err.message?.includes('No commits between')) {
        console.log(`[dispatch]   No changes detected for #${triaged.number}, skipping PR`)
      } else {
        console.error(`[dispatch]   Failed to create PR for #${triaged.number}:`, err.message)
      }
    }

    await removeLabel(triaged.number, LABELS.IN_PROGRESS)
    await setLabel(triaged.number, LABELS.TRIAGED)

    return { issueNumber: triaged.number, success: true, prNumber }
  } catch (err: any) {
    console.error(`[dispatch] ✗ Agent failed on #${triaged.number}:`, err.message)

    await removeLabel(triaged.number, LABELS.IN_PROGRESS)
    await setLabel(triaged.number, LABELS.ERROR)
    await commentOnIssue(triaged.number, `❌ **Smithers Dispatch** — Agent \`${triaged.agent}\` failed.\n\nError: \`${err.message?.slice(0, 500)}\``)

    return { issueNumber: triaged.number, success: false, error: err.message }
  }
}

// ─── STEP 4: REVIEW A PR ────────────────────────────────────────────────────

async function reviewPR(prNumber: number, issueNumber: number): Promise<'approved' | 'rejected'> {
  console.log(`[dispatch] 🔍 Reviewing PR #${prNumber} for issue #${issueNumber}`)

  const reviewModel = MODEL ? MODEL_MAP[MODEL] : DEFAULT_MODEL

  try {
    // Fetch PR diff
    const { data: diff } = await octokit.pulls.get({
      owner: OWNER,
      repo: REPO,
      pull_number: prNumber,
      mediaType: { format: 'diff' },
    })

    const diffText = diff as unknown as string

    const reviewPrompt = `You are a senior code reviewer. Review this pull request diff and determine if it should be approved or needs changes.

PR #${prNumber} resolves issue #${issueNumber} on ${OWNER}/${REPO}.

DIFF:
${diffText.slice(0, 50000)}

REVIEW CRITERIA:
- Does the code correctly address the issue?
- Are there bugs, security issues, or obvious problems?
- Is the code quality acceptable?

RESPOND with EXACTLY one of:
- "APPROVE" if the code looks good
- "REQUEST_CHANGES: <reason>" if changes are needed

Only output your verdict, nothing else.`

    const proc = Bun.spawn([
      'claude',
      '--print',
      '--model', reviewModel,
      '--dangerously-skip-permissions',
      '--output-format', 'text',
      '-p', reviewPrompt,
    ], {
      cwd: process.cwd(),
      env: { ...process.env, ANTHROPIC_API_KEY },
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stdout = await new Response(proc.stdout).text()
    await proc.exited

    const verdict = stdout.trim()

    if (verdict.startsWith('APPROVE')) {
      console.log(`[dispatch]   ✓ PR #${prNumber} approved`)

      await octokit.pulls.createReview({
        owner: OWNER,
        repo: REPO,
        pull_number: prNumber,
        event: 'APPROVE',
        body: '✅ Smithers review: APPROVED',
      })

      return 'approved'
    }

    const reason = verdict.replace('REQUEST_CHANGES:', '').trim()
    console.log(`[dispatch]   ✗ PR #${prNumber} needs changes: ${reason.slice(0, 100)}`)

    await octokit.pulls.createReview({
      owner: OWNER,
      repo: REPO,
      pull_number: prNumber,
      event: 'REQUEST_CHANGES',
      body: `🔄 Smithers review: Changes requested.\n\n${reason}`,
    })

    return 'rejected'
  } catch (err: any) {
    console.error(`[dispatch]   Review failed for PR #${prNumber}:`, err.message)
    return 'rejected'
  }
}

// ─── STEP 5: MERGE A PR ─────────────────────────────────────────────────────

async function mergePR(prNumber: number, issueNumber: number): Promise<boolean> {
  console.log(`[dispatch] 🔀 Merging PR #${prNumber}`)

  try {
    await octokit.pulls.merge({
      owner: OWNER,
      repo: REPO,
      pull_number: prNumber,
      merge_method: 'squash',
      commit_title: `fix: resolve #${issueNumber} [smithers]`,
    })

    console.log(`[dispatch]   ✓ PR #${prNumber} merged`)
    return true
  } catch (err: any) {
    console.error(`[dispatch]   ✗ Merge failed for PR #${prNumber}:`, err.message)

    if (err.message?.includes('merge conflict') || err.status === 405) {
      await setLabel(issueNumber, LABELS.MERGE_CONFLICT)
      await commentOnIssue(issueNumber, `⚠️ **Smithers Dispatch** — Merge conflict on PR #${prNumber}. Manual resolution needed.`)
    }

    return false
  }
}

// ─── STEP 6: EXECUTE WAVES ──────────────────────────────────────────────────

async function executeWaves(triage: TriageResult, issues: GitHubIssue[]): Promise<Map<number, WaveResult>> {
  const allResults = new Map<number, WaveResult>()
  const issueMap = new Map(issues.map(i => [i.number, i]))
  const triagedMap = new Map(triage.issues.map(i => [i.number, i]))

  // Handle rejected issues first
  for (const triaged of triage.issues) {
    if (!triaged.feasible) {
      console.log(`[dispatch] ✗ Rejecting #${triaged.number}: ${triaged.rejectReason}`)
      await setLabel(triaged.number, LABELS.REJECTED)
      await commentOnIssue(triaged.number, `🚫 **Smithers Dispatch** — Issue rejected by triage.\n\nReason: ${triaged.rejectReason ?? 'Not feasible for AI agent'}`)
      allResults.set(triaged.number, { issueNumber: triaged.number, success: false, error: `Rejected: ${triaged.rejectReason}` })
    }
  }

  // Execute each wave
  for (const wave of triage.executionPlan) {
    const waveIssueNumbers = wave.issues.filter(n => {
      const t = triagedMap.get(n)
      return t?.feasible === true
    })

    if (waveIssueNumbers.length === 0) {
      console.log(`[dispatch] Wave ${wave.wave}: no feasible issues, skipping`)
      continue
    }

    console.log(`\n[dispatch] ═══════════════════════════════════════════`)
    console.log(`[dispatch] WAVE ${wave.wave} — Issues: [${waveIssueNumbers.join(', ')}]`)
    console.log(`[dispatch] ═══════════════════════════════════════════\n`)

    // Execute all issues in this wave in parallel
    const waveResults = await Promise.all(
      waveIssueNumbers.map(async (num) => {
        const triaged = triagedMap.get(num)!
        const issue = issueMap.get(num)
        if (!issue) {
          console.error(`[dispatch] Issue #${num} not found in fetched issues`)
          return { issueNumber: num, success: false, error: 'Issue not found' } as WaveResult
        }
        return executeAgentOnIssue(triaged, issue)
      })
    )

    for (const result of waveResults) {
      allResults.set(result.issueNumber, result)
    }

    // Review PRs from this wave
    console.log(`\n[dispatch] 🔍 Reviewing wave ${wave.wave} PRs...\n`)

    for (const result of waveResults) {
      if (!result.success || !result.prNumber) continue

      const verdict = await reviewPR(result.prNumber, result.issueNumber)

      if (verdict === 'approved') {
        const merged = await mergePR(result.prNumber, result.issueNumber)
        if (!merged) {
          allResults.set(result.issueNumber, { ...result, success: false, error: 'Merge failed' })
        }
      } else {
        // Review failed — label and continue
        await setLabel(result.issueNumber, LABELS.NEEDS_FIX)
        await removeLabel(result.issueNumber, LABELS.TRIAGED)
        await commentOnIssue(result.issueNumber, `🔄 **Smithers Dispatch** — Review of PR #${result.prNumber} requested changes. Label \`needs-fix\` added.`)
        allResults.set(result.issueNumber, { ...result, success: false, error: 'Review rejected' })
      }
    }
  }

  return allResults
}

// ─── STEP 7: REPORT ─────────────────────────────────────────────────────────

function printReport(results: Map<number, WaveResult>): void {
  console.log(`\n[dispatch] ═══════════════════════════════════════════`)
  console.log(`[dispatch] DISPATCH REPORT`)
  console.log(`[dispatch] ═══════════════════════════════════════════\n`)

  const resolved: WaveResult[] = []
  const rejected: WaveResult[] = []
  const errored: WaveResult[] = []

  for (const result of results.values()) {
    if (result.success) {
      resolved.push(result)
    } else if (result.error?.startsWith('Rejected')) {
      rejected.push(result)
    } else {
      errored.push(result)
    }
  }

  console.log(`  ✅ Resolved: ${resolved.length}`)
  for (const r of resolved) {
    console.log(`     #${r.issueNumber} → PR #${r.prNumber ?? '?'}`)
  }

  console.log(`  🚫 Rejected: ${rejected.length}`)
  for (const r of rejected) {
    console.log(`     #${r.issueNumber}: ${r.error}`)
  }

  console.log(`  ❌ Errored: ${errored.length}`)
  for (const r of errored) {
    console.log(`     #${r.issueNumber}: ${r.error}`)
  }

  console.log(`\n  Total: ${results.size} issues processed`)
  console.log(`[dispatch] ═══════════════════════════════════════════\n`)
}

// ─── SMITHERS WORKFLOW ───────────────────────────────────────────────────────

const fetchSchema = z.object({
  count: z.number(),
  issues: z.array(z.object({
    number: z.number(),
    title: z.string(),
  })),
})

const triageOutputSchema = z.object({
  feasibleCount: z.number(),
  rejectedCount: z.number(),
  waveCount: z.number(),
})

const executeSchema = z.object({
  resolved: z.number(),
  rejected: z.number(),
  errored: z.number(),
  total: z.number(),
})

const { Workflow, Task, smithers, outputs } = createSmithers({
  fetch: fetchSchema,
  triage: triageOutputSchema,
  execute: executeSchema,
})

// Workflow-level state shared between tasks
let fetchedIssues: GitHubIssue[] = []
let triageResult: TriageResult | null = null

export default smithers((ctx) => (
  <Workflow name="dispatch-v2">
    <Sequence>
      {/* Step 1: Fetch issues */}
      <Task id="fetch" output={outputs.fetch}>
        {async () => {
          console.log(`[dispatch] ═══════════════════════════════════════════`)
          console.log(`[dispatch] SMITHERS DISPATCH v2`)
          console.log(`[dispatch] Repo: ${OWNER}/${REPO} → Branch: ${BRANCH}`)
          console.log(`[dispatch] Mode: ${ISSUE ? `ISSUE=${ISSUE}` : LABEL ? `LABEL=${LABEL}` : 'ALL OPEN'}`)
          console.log(`[dispatch] ═══════════════════════════════════════════\n`)

          await ensureLabelsExist()
          fetchedIssues = await fetchIssues()

          if (fetchedIssues.length === 0) {
            console.log('[dispatch] No issues found. Done.')
            return { count: 0, issues: [] }
          }

          console.log(`[dispatch] Found ${fetchedIssues.length} issues:\n`)
          for (const i of fetchedIssues) {
            console.log(`  #${i.number} — ${i.title} [${i.labels.join(', ') || 'no labels'}]`)
          }
          console.log()

          return {
            count: fetchedIssues.length,
            issues: fetchedIssues.map(i => ({ number: i.number, title: i.title })),
          }
        }}
      </Task>

      {/* Step 2: AI triage */}
      <Task id="triage" output={outputs.triage} skipIf={fetchedIssues.length === 0}>
        {async () => {
          triageResult = await triageIssues(fetchedIssues)

          const feasible = triageResult.issues.filter(i => i.feasible).length
          const rejected = triageResult.issues.filter(i => !i.feasible).length

          return {
            feasibleCount: feasible,
            rejectedCount: rejected,
            waveCount: triageResult.executionPlan.length,
          }
        }}
      </Task>

      {/* Steps 3-6: Execute waves, review, merge */}
      <Task id="execute" output={outputs.execute} skipIf={!triageResult}>
        {async () => {
          if (!triageResult) {
            return { resolved: 0, rejected: 0, errored: 0, total: 0 }
          }

          const results = await executeWaves(triageResult, fetchedIssues)
          printReport(results)

          let resolved = 0, rejected = 0, errored = 0
          for (const r of results.values()) {
            if (r.success) resolved++
            else if (r.error?.startsWith('Rejected')) rejected++
            else errored++
          }

          return { resolved, rejected, errored, total: results.size }
        }}
      </Task>
    </Sequence>
  </Workflow>
))
