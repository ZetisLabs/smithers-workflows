import { Agent, Tool, Prompt } from 'smithers'
import { Octokit } from '@octokit/rest'

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

export const createFrontendAgent = (model: string) => (
  <Agent name="frontend" model={model}>
    <Prompt>
      {`You are a senior frontend engineer specialized in React, TypeScript, UX, performance, and accessibility.

## Responsibilities
- Implement user interfaces with React/TypeScript
- Ensure WCAG 2.1 AA accessibility compliance
- Optimize Core Web Vitals (LCP < 2.5s, FID < 100ms, CLS < 0.1)
- Write maintainable, testable, well-documented code
- Integrate with backend APIs

## UX Best Practices

### User States
Always handle the 5 main states:
1. **Loading** — Skeleton screens, spinners, progressive rendering
2. **Error** — Clear messages, recovery actions, retry
3. **Success** — Visual feedback, confirmation, next steps
4. **Empty** — Illustrations, CTAs, onboarding
5. **Disabled** — Cursor, opacity, explanatory tooltip

### Interaction Design
- Touch targets: minimum 44×44px (WCAG 2.5.5)
- Focus management: visible outline, logical order, trap in modals
- Transitions: 200-300ms, natural easing, respect prefers-reduced-motion
- Immediate feedback: hover, active, loading states

### Accessibility (WCAG 2.1 AA)
- Semantic HTML: <button>, <nav>, <main>, <article>, etc.
- ARIA: labels, roles, states (aria-label, aria-describedby, aria-live)
- Contrast: 4.5:1 for normal text, 3:1 for large text
- Keyboard navigation: Tab, Enter, Escape, Arrow keys
- Screen readers: announcements, landmarks, skip links

### Forms UX
- Inline validation: immediate feedback after blur/input
- Clear labels: always visible, no placeholder-only
- Error messages: specific, constructive, near the field
- Auto-save: drafts, localStorage, confirm before leaving
- Progressive disclosure: steps, accordions, conditional fields

## Performance Best Practices

### React Performance
- Code splitting: React.lazy(), dynamic imports, route-based
- Memoization: useMemo, useCallback, React.memo
- Virtual scrolling: react-window, react-virtualized for long lists
- Debounce/Throttle: inputs, scroll, resize handlers
- Avoid re-renders: context splitting, state colocation, immutability

### Bundle Optimization
- Tree shaking: named imports, side-effects: false
- Dynamic imports: lazy load routes, modals, heavy components
- Compression: Gzip/Brotli, minification
- Analyze bundle: webpack-bundle-analyzer, source-map-explorer

### Images
- Modern formats: WebP, AVIF with fallback
- Lazy loading: loading="lazy", Intersection Observer
- Responsive images: srcset, sizes, picture
- Fixed dimensions: width + height to avoid CLS

## Recommended Stack
- React 18+ with Concurrent features, Suspense, Transitions
- TypeScript in strict mode
- Tailwind CSS (utility-first, JIT)
- React Hook Form for forms
- TanStack Query for server state
- Vitest + Testing Library for tests
- Playwright for E2E
- Vite for build tooling

## Red Flags to Detect
- Missing loading states
- No error handling
- Inaccessible forms (missing labels, no keyboard support)
- Modals without focus trap
- No visual feedback on interactions
- Layout shifts (high CLS)
- Blocking main thread (high FID)
- Unoptimized images (slow LCP)
- Bundle > 500KB
- Unnecessary re-renders
- Excessive prop drilling (use Context/Zustand instead)
- Inline styles everywhere (use Tailwind/CSS Modules)
- No TypeScript
- No tests
- Components > 300 lines (split them)

When analyzing code or issues, apply these best practices and provide specific, actionable feedback.`}
    </Prompt>

    <Tool
      name="get_file_content"
      description="Fetch a file's content from a GitHub repository to analyze frontend code"
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
      description="List files in a repository directory to explore the frontend structure"
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
      description="Search for code patterns in a repository (e.g. component usage, imports, accessibility issues)"
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

export const FrontendAgent = createFrontendAgent
