import { Workflow, Agent, Tool, Prompt, render } from 'smithers'
import { Octokit } from '@octokit/rest'

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

// Usage: OWNER=ZetisLabs REPO=invoice-reminder PR=89 bun run workflows/pr-review.tsx
const owner = process.env.OWNER ?? 'ZetisLabs'
const repo = process.env.REPO ?? ''
const prNumber = Number(process.env.PR ?? '0')

if (!repo || !prNumber) {
  console.error('Usage: REPO=<repo> PR=<number> bun run workflows/pr-review.tsx')
  process.exit(1)
}

const workflow = (
  <Workflow name="pr-review">
    <Agent name="reviewer" model="claude-sonnet-4-20250514">
      <Prompt>
        {`You are a senior code reviewer for ZetisLabs.
Review PR #${prNumber} on ${owner}/${repo}.

Focus on:
- Code quality and best practices
- Potential bugs or edge cases
- Performance considerations
- Security concerns

First fetch the diff, analyze it, then post your review.`}
      </Prompt>

      <Tool
        name="get_pr_diff"
        description="Fetch the diff for a GitHub pull request"
        parameters={{
          type: "object" as const,
          properties: {
            owner: { type: "string", description: "Repository owner" },
            repo: { type: "string", description: "Repository name" },
            pull_number: { type: "number", description: "PR number" }
          },
          required: ["owner", "repo", "pull_number"]
        }}
        execute={async (input: Record<string, unknown>) => {
          const { data } = await octokit.pulls.get({
            owner: input.owner as string,
            repo: input.repo as string,
            pull_number: input.pull_number as number,
            mediaType: { format: 'diff' }
          })
          return data as unknown as string
        }}
      />

      <Tool
        name="post_review"
        description="Post a review comment on a GitHub pull request"
        parameters={{
          type: "object" as const,
          properties: {
            owner: { type: "string", description: "Repository owner" },
            repo: { type: "string", description: "Repository name" },
            pull_number: { type: "number", description: "PR number" },
            body: { type: "string", description: "Review comment body" },
            event: { type: "string", enum: ["APPROVE", "REQUEST_CHANGES", "COMMENT"], description: "Review action" }
          },
          required: ["owner", "repo", "pull_number", "body", "event"]
        }}
        execute={async (input: Record<string, unknown>) => {
          const { data } = await octokit.pulls.createReview({
            owner: input.owner as string,
            repo: input.repo as string,
            pull_number: input.pull_number as number,
            body: input.body as string,
            event: input.event as "APPROVE" | "REQUEST_CHANGES" | "COMMENT"
          })
          return `Review posted: ${data.html_url}`
        }}
      />
    </Agent>
  </Workflow>
)

render(workflow)
