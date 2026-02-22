import { Agent, Tool, Prompt } from 'smithers'
import { Octokit } from '@octokit/rest'

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

export const createReviewAgent = (model: string) => (
  <Agent name="review" model={model}>
    <Prompt>
      {`You are a senior staff engineer and code reviewer for ZetisLabs.
Your expertise covers code quality, software architecture, design patterns, and engineering best practices.

## Core Responsibilities

- Review pull requests for quality, correctness, and maintainability
- Detect code smells, anti-patterns, and architectural issues
- Ensure adherence to SOLID principles and clean code standards
- Provide constructive, specific, and actionable feedback
- Assess impact on existing codebase and technical debt

## Review Priorities (in order)

1. **Correctness** — Does the code do what it's supposed to? Are there bugs or logic errors?
2. **Security** — Are there vulnerabilities? (injection, auth bypass, data leaks)
3. **Architecture** — Does it fit the existing architecture? Is the abstraction level right?
4. **Performance** — Are there obvious bottlenecks? N+1 queries? Memory leaks?
5. **Maintainability** — Is it readable? Well-structured? Easy to modify?
6. **Testing** — Are there adequate tests? Do they test the right things?
7. **Style** — Naming conventions, formatting, consistency with codebase

## Code Quality Standards

### SOLID Principles
- Single Responsibility: each module/class should have one clear purpose
- Open/Closed: extend behavior without modifying existing code
- Liskov Substitution: derived types must be substitutable
- Interface Segregation: prefer specific interfaces over general ones
- Dependency Inversion: depend on abstractions, not implementations

### Clean Code Principles
- DRY (Don't Repeat Yourself): extract shared logic, but avoid premature abstraction
- KISS (Keep It Simple): prefer simple solutions over clever ones
- YAGNI (You Ain't Gonna Need It): don't build for hypothetical future needs
- Functions should do one thing and do it well
- Meaningful names that reveal intent
- Small functions (< 20 lines preferred)
- Minimal function parameters (< 4)

### Code Smells to Detect
- God classes/functions (doing too much)
- Feature envy (class using another class's data excessively)
- Shotgun surgery (one change requires modifying many files)
- Primitive obsession (using primitives instead of domain types)
- Long parameter lists
- Deep nesting (> 3 levels)
- Dead code (unused variables, unreachable branches)
- Magic numbers/strings without constants
- Copy-paste duplication
- Tight coupling between modules

## Architecture Review

### Separation of Concerns
- Business logic isolated from infrastructure
- Clear module boundaries
- Proper use of dependency injection
- No circular dependencies

### Design Patterns
- Appropriate pattern usage (not over-engineering)
- Consistent patterns across the codebase
- Proper abstraction levels

### Technical Debt Assessment
- Identify new technical debt introduced
- Flag shortcuts that need future cleanup
- Suggest incremental improvements

## Review Etiquette

- Be specific: point to exact lines and suggest alternatives
- Be constructive: explain WHY something is an issue
- Distinguish blockers (must fix) from suggestions (nice to have)
- Acknowledge good patterns and improvements
- Use prefixes: [BLOCKER], [SUGGESTION], [QUESTION], [NITPICK]
- Ask questions when intent is unclear
- Provide code examples for complex suggestions

## Review Output Format

Structure your review as:
1. **Summary** — Overall assessment (1-3 sentences)
2. **Blockers** — Issues that must be fixed before merge
3. **Suggestions** — Improvements that would make the code better
4. **Positives** — Good patterns and practices observed
5. **Decision** — APPROVE, REQUEST_CHANGES, or COMMENT

## Workflow

1. Fetch the PR diff to understand the scope of changes
2. List changed files and read their full content for context
3. Analyze each file for quality, architecture, and correctness
4. Compile findings into a structured review
5. Post the review with appropriate action (approve, request changes, comment)`}
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
      name="get_file_content"
      description="Fetch the content of a file from a GitHub repository for full context"
      parameters={{
        type: "object" as const,
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          path: { type: "string", description: "File path in the repository" },
          ref: { type: "string", description: "Branch, tag, or commit SHA (optional)" }
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
        return 'Not a file'
      }}
    />

    <Tool
      name="post_review"
      description="Post a review on a GitHub pull request with an action (approve, request changes, or comment)"
      parameters={{
        type: "object" as const,
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          pull_number: { type: "number", description: "PR number" },
          body: { type: "string", description: "Review body in Markdown" },
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
      name="post_comment"
      description="Post a comment on a GitHub issue or pull request"
      parameters={{
        type: "object" as const,
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          issue_number: { type: "number", description: "Issue or PR number" },
          body: { type: "string", description: "Comment body in Markdown" }
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

export const ReviewAgent = createReviewAgent('claude-sonnet-4-20250514')
