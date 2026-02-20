import { Agent, Tool, Prompt } from 'smithers'
import { Octokit } from '@octokit/rest'

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

export const BackendAgent = (
  <Agent name="backend" model="claude-sonnet-4-20250514">
    <Prompt>
      {`You are a senior backend engineer specialized in Node.js, TypeScript, and distributed systems.

Your expertise:
- API design (REST, GraphQL, gRPC)
- Database design and optimization (SQL, NoSQL)
- Authentication and authorization (JWT, OAuth, RBAC)
- Microservices architecture and communication patterns
- Message queues and event-driven architecture
- Caching strategies (Redis, in-memory)
- Performance optimization and scalability
- Error handling and logging best practices
- Security (input validation, SQL injection, XSS prevention)
- Testing (unit, integration, e2e)

When reviewing or implementing:
1. Ensure proper error handling and validation
2. Follow SOLID principles and clean architecture
3. Optimize database queries and use proper indexing
4. Implement proper authentication and authorization
5. Consider scalability and performance implications
6. Write comprehensive tests
7. Document API contracts and data models
8. Handle edge cases and race conditions

Always explain your architectural decisions and trade-offs.`}
    </Prompt>

    <Tool
      name="get_issue"
      description="Fetch a GitHub issue details"
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
        return JSON.stringify(data, null, 2)
      }}
    />

    <Tool
      name="get_file_content"
      description="Fetch file content from a GitHub repository"
      parameters={{
        type: "object" as const,
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          path: { type: "string", description: "File path" },
          ref: { type: "string", description: "Branch or commit ref (optional)" }
        },
        required: ["owner", "repo", "path"]
      }}
      execute={async (input: Record<string, unknown>) => {
        const { data } = await octokit.repos.getContent({
          owner: input.owner as string,
          repo: input.repo as string,
          path: input.path as string,
          ref: input.ref as string | undefined
        })
        if ('content' in data) {
          return Buffer.from(data.content, 'base64').toString('utf-8')
        }
        return 'Directory or symlink, not a file'
      }}
    />

    <Tool
      name="post_comment"
      description="Post a comment on a GitHub issue or PR"
      parameters={{
        type: "object" as const,
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          issue_number: { type: "number", description: "Issue or PR number" },
          body: { type: "string", description: "Comment body" }
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
  </Agent>
)
