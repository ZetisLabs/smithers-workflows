import { Workflow, Agent, Tool, Prompt, render } from 'smithers'
import { Octokit } from '@octokit/rest'
import { FrontendAgent } from '../agents/frontend'
import { BackendAgent } from '../agents/backend'
import { TestingAgent } from '../agents/testing'
import { ReviewAgent } from '../agents/review'
import { SecurityAgent } from '../agents/security'

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

// Usage: OWNER=ZetisLabs REPO=invoice-reminder ISSUE=42 bun run workflows/dispatch.tsx
const owner = process.env.OWNER ?? 'ZetisLabs'
const repo = process.env.REPO ?? ''
const issueNumber = Number(process.env.ISSUE ?? '0')

if (!repo || !issueNumber) {
  console.error('Usage: OWNER=<owner> REPO=<repo> ISSUE=<number> bun run workflows/dispatch.tsx')
  process.exit(1)
}

const workflow = (
  <Workflow name="issue-dispatch">
    <Agent name="dispatcher" model="claude-sonnet-4-20250514">
      <Prompt>
        {`You are an intelligent issue dispatcher for ZetisLabs.

Your role is to analyze GitHub issues and route them to the appropriate specialized agent(s).

Analyze issue #${issueNumber} on ${owner}/${repo} and determine which agent(s) should handle it:

**Available agents:**
- **frontend**: React, TypeScript, UI/UX, performance, accessibility
- **backend**: APIs, databases, authentication, microservices, scalability
- **testing**: Unit tests, integration tests, e2e tests, test coverage, TDD
- **review**: Code review, architecture, best practices, quality assessment
- **security**: Vulnerabilities, OWASP, authentication/authorization, secrets, dependencies

**Routing logic:**

1. **Labels-based routing** (primary):
   - Labels like "frontend", "backend", "security", "testing" → route to corresponding agent
   - "bug" → review agent (to assess root cause)
   - "enhancement", "feature" → analyze description to determine frontend/backend
   - "dependencies" → security agent
   - "performance" → check if frontend or backend related

2. **Content-based routing** (if no clear labels):
   - UI/UX, components, styling, accessibility → frontend
   - API, database, auth, server-side logic → backend
   - Test coverage, test failures, testing strategy → testing
   - Code quality, architecture, refactoring → review
   - CVE, vulnerability, secrets, security headers → security

3. **Multi-agent routing** (when needed):
   - Full-stack features → frontend + backend
   - Security-critical changes → primary agent + security
   - New features → primary agent + testing
   - Major refactoring → review + testing

**Your task:**
1. Fetch the issue details (title, body, labels)
2. Analyze the issue type and scope
3. Determine which agent(s) should handle it
4. Assign labels if missing (e.g., add "frontend" if it's clearly a UI issue)
5. Post a comment tagging the appropriate team and explaining the routing decision
6. Create a summary of your analysis

**Output format:**
Provide a structured analysis:
- Issue type: [bug/feature/enhancement/security/test/refactor]
- Scope: [frontend/backend/full-stack/infrastructure/testing]
- Assigned agents: [list of agents]
- Priority: [critical/high/medium/low]
- Reasoning: [brief explanation]
- Suggested labels: [labels to add if missing]

Then post a comment on the issue with:
- A friendly greeting
- Summary of the issue
- Which team(s) will handle it
- Next steps or questions if clarification is needed`}
      </Prompt>

      <Tool
        name="get_issue"
        description="Fetch a GitHub issue details including title, body, labels, and metadata"
        parameters={{
          type: "object" as const,
          properties: {
            owner: { type: "string", description: "Repository owner" },
            repo: { type: "string", description: "Repository name" },
            issue_number: { type: "number", description: "Issue number" }
          },
          required: ["owner", "repo", "issue_number"]
        }}
        execute={async (input: Record<string, unknown>) => {
          const { data } = await octokit.issues.get({
            owner: input.owner as string,
            repo: input.repo as string,
            issue_number: input.issue_number as number
          })
          return JSON.stringify({
            number: data.number,
            title: data.title,
            body: data.body,
            state: data.state,
            labels: data.labels.map((l: any) => typeof l === 'string' ? l : l.name),
            assignees: data.assignees?.map((a: any) => a.login),
            created_at: data.created_at,
            updated_at: data.updated_at,
            user: data.user?.login
          }, null, 2)
        }}
      />

      <Tool
        name="add_labels"
        description="Add labels to a GitHub issue"
        parameters={{
          type: "object" as const,
          properties: {
            owner: { type: "string", description: "Repository owner" },
            repo: { type: "string", description: "Repository name" },
            issue_number: { type: "number", description: "Issue number" },
            labels: { type: "array", items: { type: "string" }, description: "Labels to add" }
          },
          required: ["owner", "repo", "issue_number", "labels"]
        }}
        execute={async (input: Record<string, unknown>) => {
          const { data } = await octokit.issues.addLabels({
            owner: input.owner as string,
            repo: input.repo as string,
            issue_number: input.issue_number as number,
            labels: input.labels as string[]
          })
          return `Labels added: ${(input.labels as string[]).join(', ')}`
        }}
      />

      <Tool
        name="post_comment"
        description="Post a comment on a GitHub issue"
        parameters={{
          type: "object" as const,
          properties: {
            owner: { type: "string", description: "Repository owner" },
            repo: { type: "string", description: "Repository name" },
            issue_number: { type: "number", description: "Issue number" },
            body: { type: "string", description: "Comment body (supports Markdown)" }
          },
          required: ["owner", "repo", "issue_number", "body"]
        }}
        execute={async (input: Record<string, unknown>) => {
          const { data } = await octokit.issues.createComment({
            owner: input.owner as string,
            repo: input.repo as string,
            issue_number: input.issue_number as number,
            body: input.body as string
          })
          return `Comment posted: ${data.html_url}`
        }}
      />

      <Tool
        name="assign_issue"
        description="Assign a GitHub issue to users"
        parameters={{
          type: "object" as const,
          properties: {
            owner: { type: "string", description: "Repository owner" },
            repo: { type: "string", description: "Repository name" },
            issue_number: { type: "number", description: "Issue number" },
            assignees: { type: "array", items: { type: "string" }, description: "GitHub usernames to assign" }
          },
          required: ["owner", "repo", "issue_number", "assignees"]
        }}
        execute={async (input: Record<string, unknown>) => {
          const { data } = await octokit.issues.addAssignees({
            owner: input.owner as string,
            repo: input.repo as string,
            issue_number: input.issue_number as number,
            assignees: input.assignees as string[]
          })
          return `Assigned to: ${(input.assignees as string[]).join(', ')}`
        }}
      />

      <Tool
        name="get_repo_files"
        description="List files in a repository directory to understand project structure"
        parameters={{
          type: "object" as const,
          properties: {
            owner: { type: "string", description: "Repository owner" },
            repo: { type: "string", description: "Repository name" },
            path: { type: "string", description: "Directory path (empty string for root)" }
          },
          required: ["owner", "repo", "path"]
        }}
        execute={async (input: Record<string, unknown>) => {
          const { data } = await octokit.repos.getContent({
            owner: input.owner as string,
            repo: input.repo as string,
            path: input.path as string
          })
          if (Array.isArray(data)) {
            return JSON.stringify(data.map(f => ({
              name: f.name,
              type: f.type,
              path: f.path
            })), null, 2)
          }
          return 'Not a directory'
        }}
      />
    </Agent>

    {/* Specialized agents are available but not invoked directly by dispatcher */}
    {/* They can be triggered separately based on the dispatcher's recommendation */}
  </Workflow>
)

render(workflow)
