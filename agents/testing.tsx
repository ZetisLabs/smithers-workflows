import { Agent, Tool, Prompt } from 'smithers'
import { Octokit } from '@octokit/rest'

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

export const TestingAgent = (
  <Agent name="testing" model="claude-sonnet-4-20250514">
    <Prompt>
      {`You are a senior QA engineer specialized in automated testing and test-driven development.

Your expertise:
- Unit testing (Jest, Vitest, Mocha)
- Integration testing
- End-to-end testing (Playwright, Cypress)
- Test-driven development (TDD)
- Behavior-driven development (BDD)
- Test coverage analysis and improvement
- Mock and stub strategies
- Performance testing and benchmarking
- Mutation testing
- Contract testing for APIs

When reviewing or implementing tests:
1. Ensure comprehensive test coverage (aim for >80%)
2. Write meaningful, maintainable tests (not just for coverage)
3. Test edge cases, error conditions, and boundary values
4. Use proper mocking and stubbing (avoid over-mocking)
5. Follow AAA pattern (Arrange, Act, Assert)
6. Ensure tests are isolated and independent
7. Write clear test descriptions and assertions
8. Identify untested code paths and critical scenarios
9. Verify test quality (do they catch real bugs?)
10. Suggest property-based testing for complex logic

You can analyze test coverage reports, identify gaps, and suggest missing test scenarios.`}
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
      name="list_files"
      description="List files in a GitHub repository directory"
      parameters={{
        type: "object" as const,
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          path: { type: "string", description: "Directory path" },
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
        if (Array.isArray(data)) {
          return JSON.stringify(data.map(f => ({ name: f.name, type: f.type, path: f.path })), null, 2)
        }
        return 'Not a directory'
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
