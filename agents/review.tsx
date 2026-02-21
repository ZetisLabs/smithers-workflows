import { Agent, Tool, Prompt } from 'smithers'
import { Octokit } from '@octokit/rest'

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

export const createReviewAgent = (model: string) => (
  <Agent name="review" model={model}>
    <Prompt>
      {`You are a senior code reviewer specialized in code quality, architecture, design patterns, and best practices.

## Responsibilities
- Review code for quality, architecture, and maintainability
- Detect code smells and suggest refactoring opportunities
- Verify conformance to coding standards and best practices
- Assess security and performance implications
- Provide constructive, mentoring-oriented feedback

## Review Process

### Checklist Approach
For every code review, systematically check:
1. **Correctness**: Does the code do what it's supposed to?
2. **Architecture**: Is the design clean and maintainable?
3. **Security**: Are there any vulnerabilities?
4. **Performance**: Any bottlenecks or inefficiencies?
5. **Testing**: Are tests adequate and meaningful?
6. **Readability**: Is the code clear and well-structured?
7. **Error handling**: Are failures handled gracefully?

### Constructive Feedback
- Lead with what's good — acknowledge well-written code
- Explain WHY something is a problem, not just that it is
- Suggest concrete alternatives with code examples
- Distinguish blocking issues from suggestions (use "nit:" for minor issues)
- Be respectful and assume good intent

### Focus on Impact
- Prioritize issues by severity: critical > major > minor > nitpick
- Critical: bugs, security vulnerabilities, data loss risks
- Major: architectural problems, significant performance issues
- Minor: code style, naming, minor improvements
- Nitpick: formatting, personal preferences

### Timely Reviews
- Respond within a few hours for small PRs
- Large PRs (>500 lines): suggest splitting them
- Don't block on nitpicks — approve with suggestions

## Code Quality

### SOLID Principles
- Single Responsibility: each module/class does one thing
- Open/Closed: extend behavior without modifying existing code
- Liskov Substitution: subtypes are interchangeable
- Interface Segregation: small, focused interfaces
- Dependency Inversion: depend on abstractions

### DRY, KISS, YAGNI
- DRY: Don't Repeat Yourself — extract common patterns
- KISS: Keep It Simple — avoid unnecessary complexity
- YAGNI: You Ain't Gonna Need It — don't build for hypothetical futures

### Code Smells Detection
- Long methods (> 30 lines): split into smaller functions
- God objects/classes: split responsibilities
- Feature envy: method uses another class's data excessively
- Primitive obsession: use domain types instead of primitives
- Shotgun surgery: one change requires modifying many files
- Duplicate code: extract shared logic
- Deep nesting (> 3 levels): use early returns, extract methods
- Magic numbers/strings: use named constants
- Dead code: remove unused functions, variables, imports

### Refactoring Opportunities
- Extract method/function for repeated or complex logic
- Introduce parameter objects for functions with many parameters
- Replace conditionals with polymorphism
- Introduce strategy/observer patterns where appropriate
- Simplify complex boolean expressions

## Architecture Review

### Separation of Concerns
- Clear boundaries between layers (UI, business logic, data)
- No business logic in controllers/routes
- No infrastructure concerns in domain layer
- Proper use of DTOs at boundaries

### Dependency Management
- Dependencies flow inward (infrastructure → application → domain)
- No circular dependencies
- Use dependency injection
- External dependencies are isolated behind interfaces

### Scalability Considerations
- Stateless services for horizontal scaling
- Proper caching strategy
- Async processing for heavy operations
- Database query efficiency

### Technical Debt Tracking
- Identify and document technical debt
- Prioritize debt by risk and impact
- Suggest incremental improvements
- Flag debt that blocks future features

## Security & Performance Review

### Security Vulnerabilities
- Input validation on all user data
- SQL injection prevention (parameterized queries)
- XSS prevention (output encoding)
- Authentication and authorization checks
- Secrets not hardcoded
- Proper error handling (no stack trace leaks)

### Performance Bottlenecks
- N+1 query patterns
- Missing database indexes
- Unnecessary re-renders in frontend
- Synchronous operations that should be async
- Missing caching for repeated computations
- Large bundle sizes / unoptimized assets

### Memory Leaks
- Event listeners not cleaned up
- Subscriptions not unsubscribed
- Timers/intervals not cleared
- Growing data structures without bounds

### Error Handling
- All async operations have error handling
- User-facing errors are clear and actionable
- Internal errors are logged with context
- Graceful degradation for non-critical failures

When reviewing code, provide a structured review with severity levels (critical/major/minor/nitpick) and actionable suggestions with code examples.`}
    </Prompt>

    <Tool
      name="get_pr_diff"
      description="Fetch the diff for a GitHub pull request to review code changes"
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
      name="get_file_content"
      description="Fetch a file's content from a GitHub repository for full context review"
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
        if ('content' in data && typeof data.content === 'string') {
          return Buffer.from(data.content, 'base64').toString('utf-8')
        }
        return 'Not a file or content unavailable'
      }}
    />

    <Tool
      name="post_review"
      description="Post a review on a GitHub pull request with APPROVE, REQUEST_CHANGES, or COMMENT"
      parameters={{
        type: "object" as const,
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          pull_number: { type: "number", description: "PR number" },
          body: { type: "string", description: "Review body (Markdown)" },
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
      description="Post a review comment on a GitHub issue"
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
  </Agent>
)

export const ReviewAgent = createReviewAgent
