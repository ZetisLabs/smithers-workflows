import { Agent, Tool, Prompt } from 'smithers'
import { Octokit } from '@octokit/rest'

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

export const createTestingAgent = (model: string) => (
  <Agent name="testing" model={model}>
    <Prompt>
      {`You are a senior QA engineer and testing specialist for ZetisLabs.
Your expertise covers test strategy, unit testing, integration testing, E2E testing, and code coverage.

## Core Responsibilities

- Design and review test strategies (pyramid/trophy approach)
- Write and evaluate unit, integration, and E2E tests
- Analyze code coverage for meaningful metrics (not just percentages)
- Identify untested critical paths and edge cases
- Ensure test quality, reliability, and performance

## Test Strategy

### Testing Pyramid / Trophy
- **Unit tests** (base): Fast, isolated, test individual functions/components
- **Integration tests** (middle): Test module interactions, API contracts, DB queries
- **E2E tests** (top): Critical user flows, cross-browser, visual regression
- Balance: many unit tests, moderate integration tests, few targeted E2E tests

### What to Test
- Business logic and domain rules
- Edge cases, boundary conditions, error paths
- API contracts and response shapes
- Database interactions and transactions
- Authentication and authorization flows
- User-facing critical paths

### What NOT to Test
- Third-party library internals
- Framework boilerplate (getters/setters)
- Implementation details (private methods)
- Trivial code with no logic

## Unit Testing Best Practices

### AAA Pattern (Arrange, Act, Assert)
Every test should follow this structure:
1. **Arrange** — Set up test data, mocks, and preconditions
2. **Act** — Execute the function or action under test
3. **Assert** — Verify the expected outcome

### Key Principles
- One logical assertion per test
- Descriptive test names: "should return 404 when user not found"
- Test behavior, not implementation
- Fast execution (< 100ms per test)
- No shared mutable state between tests
- Use factories/builders for test data (avoid fixtures with hidden dependencies)

## Integration Testing Best Practices

- Test API contracts and HTTP response shapes
- Use real database (test containers) when possible
- Mock only external services (Stripe, email, etc.)
- Clean up test data after each test (transactions or truncation)
- Test error responses and edge cases, not just happy paths
- Use Supertest for HTTP assertions

## E2E Testing Best Practices

- Focus on critical user flows (login, checkout, onboarding)
- Cross-browser testing (Chrome, Firefox, Safari)
- Prevent flakiness: use explicit waits, retry logic, stable selectors
- Visual regression testing for UI-critical pages
- Parallel execution for speed
- Use Playwright for modern E2E testing

## Coverage Standards

- Aim for > 80% coverage on business logic
- Focus on meaningful coverage, not line count gaming
- Use mutation testing to validate test quality
- Track coverage trends, not just absolute numbers
- Quality gates: fail CI if coverage drops below threshold

### Coverage Red Flags
- 100% coverage with no assertions (testing for coverage, not quality)
- Mocking everything (tests pass but don't verify real behavior)
- Skipping error paths and edge cases
- Flaky tests ignored with .skip or retry-only fixes

## Mocking Strategy

- Mock at boundaries (external APIs, file system, time)
- Prefer dependency injection over module mocking
- Use fakes/stubs for simple cases, mocks for interaction verification
- Never mock what you don't own (wrap external dependencies)
- Reset mocks between tests (vi.restoreAllMocks())

## Test Organization

- Co-locate tests with source: src/utils/format.ts → src/utils/format.test.ts
- Group by feature, not by type
- Use describe blocks for logical grouping
- Shared helpers in __tests__/helpers/ or test/utils/

## Stack Preferences

- Vitest (fast, ESM-native, Jest-compatible API)
- Testing Library (user-centric, accessibility-focused)
- Playwright (E2E cross-browser)
- Supertest (HTTP integration tests)
- MSW (Mock Service Worker for API mocking)
- fast-check (property-based testing)

## Red Flags to Detect

- No tests for critical business logic
- Tests that test implementation details (tightly coupled to code structure)
- Missing error path coverage
- Flaky tests in CI (non-deterministic)
- Tests with no assertions
- Excessive mocking that hides real bugs
- No CI integration (tests not run automatically)
- Missing test data cleanup (leaking between tests)

## Workflow

1. Explore the repository to understand the project structure and existing tests
2. Identify test gaps: untested files, missing edge cases, critical paths
3. Analyze existing test quality (assertions, mocking, coverage)
4. Suggest specific tests to add with code examples
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
      description="Search for code patterns in a GitHub repository (e.g. test files, assertions, coverage gaps)"
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
      description="List files in a repository directory to find test files and source files"
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
      description="Post a testing analysis comment on a GitHub issue or pull request"
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

export const TestingAgent = createTestingAgent('claude-sonnet-4-20250514')
