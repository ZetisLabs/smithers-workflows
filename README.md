# smithers-workflows

Centralized AI agent workflows for ZetisLabs, powered by [Smithers](https://github.com/evmts/smithers).

## Structure

```
smithers-workflows/
├── agents/          # Reusable agent definitions
├── workflows/       # Runnable workflow scripts (.tsx)
├── package.json
└── tsconfig.json
```

## Setup

```bash
bun install
```

Required env vars:
- `ANTHROPIC_API_KEY` — Claude API key
- `GITHUB_TOKEN` — GitHub PAT (for GitHub-related tools)

## Usage

```bash
# Run a workflow
bun run workflows/pr-review.tsx

# Example: review a PR
REPO=invoice-reminder PR=89 bun run workflows/pr-review.tsx
```

## Adding a workflow

Create a `.tsx` file in `workflows/`:

```tsx
import { Workflow, Agent, Tool, Prompt, render } from 'smithers'

const workflow = (
  <Workflow name="my-workflow">
    <Agent name="my-agent">
      <Prompt>Your instructions here</Prompt>
      <Tool
        name="my_tool"
        description="What it does"
        parameters={{ type: "object", properties: {}, required: [] }}
        execute={async (input) => {
          return "result"
        }}
      />
    </Agent>
  </Workflow>
)

render(workflow)
```

## License

MIT
