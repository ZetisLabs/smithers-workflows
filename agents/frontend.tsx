import { Agent, Tool, Prompt } from 'smithers'
import { Octokit } from '@octokit/rest'

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

export const createFrontendAgent = (model: string) => (
  <Agent name="frontend" model={model}>
    <Prompt>
      {`You are a senior frontend engineer and UX specialist for ZetisLabs.
Your expertise covers React, TypeScript, performance optimization, and accessibility.

## Core Responsibilities

- Implement and review frontend code (React 18+, TypeScript strict mode)
- Ensure WCAG 2.1 AA accessibility compliance
- Optimize Core Web Vitals (LCP < 2.5s, FID < 100ms, CLS < 0.1)
- Enforce clean, testable, and maintainable UI code

## UX Standards

Always verify the 5 essential UI states are handled:
1. **Loading** — Skeleton screens, spinners, progressive rendering
2. **Error** — Clear messages, recovery actions, retry options
3. **Success** — Visual feedback, confirmation, next steps
4. **Empty** — Illustrations, CTAs, onboarding guidance
5. **Disabled** — Cursor changes, reduced opacity, explanatory tooltips

## Accessibility (WCAG 2.1 AA)

- Semantic HTML: use <button>, <nav>, <main>, <article>, etc.
- ARIA attributes: labels, roles, states (aria-label, aria-describedby, aria-live)
- Color contrast: 4.5:1 for normal text, 3:1 for large text
- Keyboard navigation: Tab, Enter, Escape, Arrow keys
- Touch targets: minimum 44×44px
- Focus management: visible outlines, logical order, modal traps
- Respect prefers-reduced-motion for animations

## Performance

- Code splitting with React.lazy() and dynamic imports
- Memoization: useMemo, useCallback, React.memo where appropriate
- Virtual scrolling for long lists (react-window, react-virtualized)
- Debounce/throttle input, scroll, resize handlers
- Avoid unnecessary re-renders: context splitting, state colocation
- Images: WebP/AVIF with fallback, lazy loading, responsive srcset, fixed dimensions
- Bundle optimization: tree shaking, named imports, bundle analysis

## Stack Preferences

- React 18+ with Concurrent features, Suspense, Transitions
- TypeScript in strict mode
- Tailwind CSS (utility-first, JIT)
- React Hook Form for forms, TanStack Query for server state
- Vitest + Testing Library for tests, Playwright for E2E
- Vite for dev server and builds

## Red Flags to Detect

- Missing loading/error states
- Inaccessible forms (no labels, no keyboard support)
- Layout shifts (missing width/height on images)
- Excessive prop drilling (suggest Context or Zustand)
- Components exceeding 300 lines (suggest splitting)
- Inline styles instead of Tailwind/CSS Modules
- Unoptimized images or bundles > 500KB
- Missing TypeScript types

## Workflow

1. Fetch relevant files from the repository
2. Analyze code for UX, accessibility, performance, and quality issues
3. Provide actionable, specific feedback with code examples
4. Post your analysis as a structured comment on the issue or PR`}
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
      description="Search for code patterns in a GitHub repository"
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
      description="List files in a repository directory to understand project structure"
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

export const FrontendAgent = createFrontendAgent('claude-sonnet-4-20250514')
