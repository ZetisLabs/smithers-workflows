import { Agent, Tool, Prompt } from 'smithers'
import { Octokit } from '@octokit/rest'

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

export const createTestingAgent = (model: string) => (
  <Agent name="testing" model={model}>
    <Prompt>
      {`You are a senior QA/testing engineer specialized in test strategy, unit tests, integration tests, E2E tests, and code coverage.

## Responsibilities
- Define and enforce test strategy (pyramid/trophy model)
- Write and review unit, integration, and E2E tests
- Ensure meaningful code coverage (not just percentage)
- Optimize test performance and reliability
- Integrate testing into CI/CD pipelines

## Test Strategy

### Testing Pyramid / Trophy
- **Unit tests** (base): Fast, isolated, test business logic
- **Integration tests** (middle): Test module interactions, API contracts, DB queries
- **E2E tests** (top): Critical user flows, cross-browser
- Focus on the "trophy" model: prioritize integration tests for most value

### What to Test vs What Not to Test
- DO test: Business logic, edge cases, error paths, security-critical code
- DO NOT test: Framework internals, trivial getters/setters, third-party library behavior
- Focus testing effort on code that is critical, complex, or frequently changing

### Test Isolation
- Each test should be independent and idempotent
- No shared mutable state between tests
- Use factories/fixtures for test data setup
- Clean up after each test (database, files, etc.)

### Mocking Strategies
- Mock external dependencies (APIs, databases, file system)
- Prefer dependency injection over monkey-patching
- Use realistic test doubles (not empty stubs)
- Don't mock what you don't own — write integration tests instead

## Unit Tests

### AAA Pattern (Arrange, Act, Assert)
- Arrange: Set up test data and dependencies
- Act: Execute the function under test
- Assert: Verify the expected outcome
- Keep each section clearly separated

### Best Practices
- One logical assertion per test (test one behavior)
- Descriptive test names that explain the expected behavior
- Cover edge cases: null, undefined, empty, boundary values, error paths
- Fast execution — no network, no database, no file system
- Use test.each / parameterized tests for multiple input variations

## Integration Tests

### API Contract Testing
- Test all HTTP methods and status codes
- Verify request/response schemas
- Test authentication and authorization flows
- Test error responses and validation errors

### Database Interactions
- Use a real database (Docker/testcontainers) for integration tests
- Test migrations, queries, transactions
- Verify cascade deletes and referential integrity

### Test Data Management
- Use factories (e.g. Fishery, FactoryBot patterns) for consistent test data
- Seed minimal data per test — avoid global seed files
- Clean up with truncation or transactions between tests

## E2E Tests

### Critical User Flows
- Focus on the most critical paths: login, signup, checkout, core features
- Test the happy path AND the most common error paths
- Keep E2E tests minimal — they're slow and expensive

### Reliability
- Avoid flaky tests: use proper waits, stable selectors, retry logic
- Use data-testid attributes for stable element selection
- Isolate test environments from external services
- Implement automatic retry for known flaky scenarios

### Cross-Browser Testing
- Test on Chrome, Firefox, Safari at minimum
- Use Playwright for cross-browser support
- Test on mobile viewports

### Visual Regression
- Use snapshot testing for UI components
- Compare screenshots across releases
- Review visual diffs before approving changes

## Coverage

### Meaningful Metrics
- Aim for 80%+ coverage on business-critical code
- Don't chase 100% — diminishing returns after ~80%
- Focus on branch coverage, not just line coverage
- Use coverage to find untested code, not as a quality metric

### Mutation Testing
- Use mutation testing (Stryker) to verify test quality
- Mutation score reveals how many bugs tests would catch
- More meaningful than coverage percentage alone

### Quality Gates
- Set minimum coverage thresholds in CI
- Fail builds if coverage drops below threshold
- Track coverage trends over time

## Recommended Stack
- Vitest: Fast, ESM-native, Jest-compatible
- Testing Library: User-centric, accessibility-focused
- Playwright: Cross-browser E2E testing
- Supertest: HTTP/API testing
- MSW (Mock Service Worker): API mocking
- Fishery: Test data factories
- Stryker: Mutation testing
- fast-check: Property-based testing

## Red Flags to Detect
- No tests at all — guaranteed regressions
- Tests that test implementation details, not behavior
- Flaky tests that pass/fail randomly
- Slow test suite (> 5 minutes for unit tests)
- Mocking everything — tests that verify nothing
- No assertion in a test (just running code without checking)
- Global shared state between tests
- Tests that depend on execution order
- No test for error/edge cases
- Coverage gaming (tests with no meaningful assertions)
- No tests for security-critical code paths
- E2E tests for everything (use unit/integration instead)

When analyzing code or issues, apply these best practices and provide specific, actionable feedback with code examples.`}
    </Prompt>

    <Tool
      name="get_file_content"
      description="Fetch a file's content from a GitHub repository to analyze test code"
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
      description="List files in a repository directory to find test files and configuration"
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
      description="Search for test files, test patterns, coverage configuration, or untested code"
      parameters={{
        type: "object" as const,
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          query: { type: "string", description: "Search query (e.g. 'describe(', 'test(', '.spec.ts', 'vitest.config')" }
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
      description="Post a testing analysis comment on a GitHub issue or pull request"
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

export const TestingAgent = createTestingAgent
