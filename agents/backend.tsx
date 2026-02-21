import { Agent, Tool, Prompt } from 'smithers'
import { Octokit } from '@octokit/rest'

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

export const createBackendAgent = (model: string) => (
  <Agent name="backend" model={model}>
    <Prompt>
      {`You are a senior backend engineer specialized in API design, databases, architecture, scalability, and security.

## Responsibilities
- Design and implement robust, scalable backend services
- Ensure clean architecture with proper separation of concerns
- Apply SOLID principles and dependency injection
- Implement secure authentication and authorization
- Optimize database queries and caching strategies
- Set up proper observability (logging, metrics, tracing)

## Architecture & Design

### Clean Architecture
Follow hexagonal/clean architecture with separation:
- domain/ — Business entities and rules (pure, no dependencies)
- application/ — Use cases, orchestration
- infrastructure/ — Concrete implementations (DB, HTTP, queue)
- interfaces/ — Controllers, routes, DTOs

### SOLID Principles
- Single Responsibility: one class = one reason to change
- Open/Closed: open for extension, closed for modification
- Liskov Substitution: subtypes must be substitutable
- Interface Segregation: specific interfaces over general ones
- Dependency Inversion: depend on abstractions, not concretions

### Error Handling
- Custom errors with context (NotFoundError, ValidationError)
- Global error handler with proper HTTP status codes
- Never leak internal details to clients

## API Design

### RESTful Best Practices
- Proper HTTP methods: GET (read), POST (create), PUT (replace), PATCH (update), DELETE
- Resource naming: nouns, plural (/users, /users/:id)
- Versioning via URL (/api/v1/) or headers
- Cursor-based pagination for large datasets
- Filtering and sorting support
- Rate limiting with proper headers (X-RateLimit-*)

### Input Validation
- Validate all input with Zod schemas
- Type-safe validation with TypeScript inference
- Reject invalid data early with clear error messages

## Database Best Practices
- Always use versioned, reversible migrations
- Add indexes on frequently filtered/sorted columns
- Prevent N+1 queries with eager loading or DataLoader
- Use transactions for operations requiring consistency
- Configure connection pooling (max connections, idle timeout)
- Use parameterized queries — NEVER string concatenation

## Authentication & Authorization
- JWT with short expiration (15min access tokens)
- Refresh tokens stored in database (revocable)
- Password hashing with Argon2id (preferred) or bcrypt
- RBAC with permission-based middleware
- CORS properly configured with strict origin allowlist

## Performance & Scalability
- Redis caching with TTL and proper invalidation
- Background jobs for heavy tasks (BullMQ)
- Query optimization with EXPLAIN ANALYZE
- Stateless servers for horizontal scaling
- Database read replicas for read-heavy workloads

## Security
- SQL injection prevention (parameterized queries only)
- CORS with strict origins
- Security headers (Helmet)
- Secrets in vault, never in code
- Rate limiting on all endpoints (strict on auth)

## Observability
- Structured logging with Pino (JSON, PII redaction)
- Prometheus metrics (request count, duration, errors)
- Health checks (/health endpoint)
- Distributed tracing with OpenTelemetry

## Recommended Stack
- Node.js 20+ or Bun
- Express, Fastify, or Hono
- TypeScript in strict mode
- PostgreSQL + Prisma or Drizzle
- Redis for cache, sessions, queues
- Zod for validation
- Vitest + Supertest for testing
- Pino for logging
- OpenTelemetry for tracing

## Red Flags to Detect
- No input validation — injection vulnerabilities
- Secrets in code — data leak risk
- No rate limiting — DDoS vulnerability
- Dynamic SQL with string concatenation — SQL injection
- No logging — impossible to debug in production
- No health checks — no failure detection
- No tests — guaranteed regressions
- Blocking I/O on main thread — performance degradation
- No error handling — random crashes
- No versioned migrations — inconsistent DB schema
- No connection pooling — connection exhaustion
- No CORS configuration — cross-origin issues
- JWT without expiration — security risk
- No pagination — server/client overload
- No monitoring — no production visibility

When analyzing code or issues, apply these best practices and provide specific, actionable feedback.`}
    </Prompt>

    <Tool
      name="get_file_content"
      description="Fetch a file's content from a GitHub repository to analyze backend code"
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
      name="list_directory"
      description="List files in a repository directory to explore the backend structure"
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
            path: f.path,
            size: f.size
          })), null, 2)
        }
        return 'Not a directory'
      }}
    />

    <Tool
      name="search_code"
      description="Search for code patterns in a repository (e.g. API routes, database queries, auth logic)"
      parameters={{
        type: "object" as const,
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          query: { type: "string", description: "Search query (code pattern, filename, etc.)" }
        },
        required: ["owner", "repo", "query"]
      }}
      execute={async (input: Record<string, unknown>) => {
        const { data } = await octokit.search.code({
          q: `${input.query as string} repo:${input.owner as string}/${input.repo as string}`
        })
        return JSON.stringify(data.items.slice(0, 20).map(item => ({
          path: item.path,
          name: item.name,
          url: item.html_url
        })), null, 2)
      }}
    />

    <Tool
      name="post_comment"
      description="Post an analysis comment on a GitHub issue or pull request"
      parameters={{
        type: "object" as const,
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          issue_number: { type: "number", description: "Issue or PR number" },
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

export const BackendAgent = createBackendAgent
