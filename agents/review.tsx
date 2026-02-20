import { Agent, Tool, Prompt } from 'smithers'
import { Octokit } from '@octokit/rest'

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

export const ReviewAgent = (
  <Agent name="review" model="claude-sonnet-4-20250514">
    <Prompt>
      {`You are a senior code reviewer with expertise across the full stack.

Your responsibilities:
- Comprehensive code review (architecture, design, implementation)
- Code quality and maintainability assessment
- Best practices enforcement
- Performance implications analysis
- Potential bugs and edge cases identification
- Security concerns detection
- Documentation and comments quality
- Test coverage verification
- Breaking changes and backward compatibility
- Dependency updates and version conflicts

Review criteria:
1. **Correctness**: Does the code work as intended? Are there bugs?
2. **Design**: Is the solution well-designed and architecturally sound?
3. **Complexity**: Is the code unnecessarily complex?
4. **Tests**: Are there adequate tests? Are they meaningful?
5. **Naming**: Are variables, functions, and classes well-named?
6. **Comments**: Are comments clear and necessary?
7. **Style**: Does the code follow style guidelines?
8. **Documentation**: Is there adequate documentation?
9. **Security**: Are there security vulnerabilities?
10. **Performance**: Are there performance concerns?

Provide constructive feedback with:
- Specific line references when possible
- Explanation of the issue
- Suggested improvements or alternatives
- Severity level (critical, major, minor, nit)

Use APPROVE, REQUEST_CHANGES, or COMMENT based on the overall assessment.`}
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
      name="get_pr_details"
      description="Fetch pull request details including description and metadata"
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
          pull_number: input.pull_number as number
        })
        return JSON.stringify({
          title: data.title,
          body: data.body,
          state: data.state,
          head: data.head.ref,
          base: data.base.ref,
          commits: data.commits,
          additions: data.additions,
          deletions: data.deletions,
          changed_files: data.changed_files
        }, null, 2)
      }}
    />

    <Tool
      name="get_pr_files"
      description="List all files changed in a pull request"
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
        const { data } = await octokit.pulls.listFiles({
          owner: input.owner as string,
          repo: input.repo as string,
          pull_number: input.pull_number as number
        })
        return JSON.stringify(data.map(f => ({
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          changes: f.changes
        })), null, 2)
      }}
    />

    <Tool
      name="post_review"
      description="Post a review on a GitHub pull request"
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

    <Tool
      name="post_review_comment"
      description="Post a line-specific comment on a pull request"
      parameters={{
        type: "object" as const,
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          pull_number: { type: "number", description: "PR number" },
          body: { type: "string", description: "Comment body" },
          commit_id: { type: "string", description: "Commit SHA" },
          path: { type: "string", description: "File path" },
          line: { type: "number", description: "Line number" }
        },
        required: ["owner", "repo", "pull_number", "body", "commit_id", "path", "line"]
      }}
      execute={async (input: Record<string, unknown>) => {
        const { data } = await octokit.pulls.createReviewComment({
          owner: input.owner as string,
          repo: input.repo as string,
          pull_number: input.pull_number as number,
          body: input.body as string,
          commit_id: input.commit_id as string,
          path: input.path as string,
          line: input.line as number
        })
        return `Comment posted: ${data.html_url}`
      }}
    />
  </Agent>
)
