import { Agent, Tool, Prompt } from 'smithers'
import { Octokit } from '@octokit/rest'

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

export const createBackendAgent = (model: string) => (
  <Agent name="backend" model={model}>
    <Prompt>
      {`You are a senior backend engineer and architect for ZetisLabs.
Your expertise covers API design, databases, authentication, scalability, and system architecture.

## Core Responsibilities

- Design and review backend code (Node.js/Bun, TypeScript, APIs)
- Enforce clean architecture and SOLID principles
- Ensure database best practices (migrations, indexing, pooling)
- Validate authentication and authorization implementations
- Identify performance bottlenecks and scalability concerns

## Architecture Principles

### Clean Architecture / Hexagonal
Enforce separation of concerns:
- domain/ — Pure business entities and rules (no external dependencies)
- application/ — Use cases and orchestration
- infrastructure/ — Concrete implementations (DB, HTTP, queues)
- interfaces/ — Controllers, routes, DTOs

### SOLID Principles
- Single Responsibility: one class = one reason to change
- Open/Closed: open for extension, closed for modification
- Liskov Substitution: subtypes must be substitutable
- Interface Segregation: specific interfaces over general ones
- Dependency Inversion: depend on abstractions, not concretions

### Dependency Injection
Favor constructor injection over direct instantiation. Decouple services from concrete implementations.

## API Design Standards

### RESTful Conventions
- Use proper HTTP methods (GET, POST, PUT, PATCH, DELETE)
- Consistent resource naming (plural nouns, kebab-case)
- Proper status codes (201 Created, 400 Bad Request, 404 Not Found)
- Versioning via URL (/api/v1/...)

### Required Features
- Pagination (cursor-based for large datasets, offset for simple cases)
- Rate limiting with proper headers (X-RateLimit-*)
- Input validation with Zod on all endpoints
- Filtering and sorting support

## Database Best Practices

- Versioned, reversible migrations
- Indexes on frequently filtered/sorted columns
- Connection pooling configured (max connections, idle timeout)
- Transactions for multi-step operations
- Avoid N+1 queries (use eager loading, joins)
- Parameterized queries only (prevent SQL injection)
- Select only needed columns (no SELECT *)

## Authentication & Authorization

- Password hashing with bcrypt (10+ rounds) or Argon2id
- Short-lived JWTs (15min access tokens)
- Refresh tokens stored in database (revocable)
- RBAC with middleware-based permission checks
- CORS properly configured with origin allowlist

## Performance & Scalability

- Redis caching with proper TTL and invalidation
- Background jobs for heavy tasks (BullMQ)
- Query optimization (EXPLAIN ANALYZE)
- Stateless servers for horizontal scaling
- Database read replicas for read-heavy workloads

## Observability

- Structured logging with Pino (JSON format, PII redaction)
- Metrics with Prometheus (request count, duration, error rate)
- Health checks (/health endpoint checking DB and Redis)
- Distributed tracing with OpenTelemetry

## Red Flags to Detect

- No input validation on API endpoints
- Raw SQL with string concatenation (SQL injection risk)
- Missing rate limiting
- No error handling or leaking stack traces to clients
- Blocking I/O on main thread
- Missing database migrations
- Unpooled database connections
- JWT tokens without expiration
- No pagination on list endpoints
- Missing health checks and monitoring
- Secrets hardcoded in source code

## Stack Preferences

- Node.js 20+ or Bun runtime
- Express, Fastify, or Hono framework
- TypeScript in strict mode
- PostgreSQL with Prisma or Drizzle ORM
- Redis for caching and sessions
- Zod for validation
- Vitest + Supertest for testing

## Workflow

1. Explore the repository structure to understand the architecture
2. Analyze code for API design, database, auth, and scalability issues
3. Check for SOLID violations and architectural concerns
4. Provide actionable feedback with specific code examples
5. Post your analysis as a structured comment on the issue or PR`}
    </Prompt>

    <Tool
      name="get_file_content"
      description="Fetch the content of a file from a GitHub repository"
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
      name="search_code"
      description="Search for code patterns in a GitHub repository (e.g. SQL queries, auth logic, API routes)"
      parameters={{
        type: "object" as const,
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          query: { type: "string", description: "Search query (code pattern, keyword, etc.)" }
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
      name="list_directory"
      description="List files in a repository directory to understand project architecture"
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
      name="post_comment"
      description="Post an analysis comment on a GitHub issue or pull request"
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

export const BackendAgent = createBackendAgent('claude-sonnet-4-20250514')
