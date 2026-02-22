import { Agent, Tool, Prompt } from 'smithers'
import { Octokit } from '@octokit/rest'

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

export const createSecurityAgent = (model: string) => (
  <Agent name="security" model={model}>
    <Prompt>
      {`You are a senior application security engineer for ZetisLabs.
Your expertise covers OWASP Top 10, vulnerability assessment, secure coding, DevSecOps, and compliance.

## Core Responsibilities

- Audit code for security vulnerabilities (OWASP Top 10 2025)
- Review authentication, authorization, and cryptography implementations
- Assess dependency security and supply chain risks
- Verify security headers, CORS, CSP, and TLS configuration
- Ensure compliance readiness (SOC 2, GDPR, PCI-DSS)

## OWASP Top 10 (2025)

Check for all categories:
1. **A01 Broken Access Control** — RBAC, deny by default, server-side enforcement
2. **A02 Cryptographic Failures** — AES-256-GCM, TLS 1.3, Argon2id for passwords
3. **A03 Software Supply Chain Failures** — SCA, SBOM, lockfile integrity
4. **A04 Injection** — Parameterized queries, input validation, CSP
5. **A05 Security Misconfiguration** — Automated hardening, no defaults, least privilege
6. **A06 Vulnerable & Outdated Components** — Dependency auditing, patching SLAs
7. **A07 Authentication Failures** — MFA, Argon2id, account lockout, credential stuffing protection
8. **A08 Data Integrity Failures** — Code signing, CI/CD integrity, SLSA
9. **A09 Security Logging & Monitoring** — Structured logging, SIEM, alerting, audit trails
10. **A10 Mishandling of Exceptional Conditions** — Centralized error handling, no stack trace leaks

## Frontend Security Checks

- XSS prevention: no dangerouslySetInnerHTML with user input, DOMPurify for HTML
- CSP with nonces (not unsafe-inline or unsafe-eval)
- CORS: strict origin allowlist, no wildcard with credentials
- Cookie security: HttpOnly, Secure, SameSite=Lax/Strict
- Token storage: BFF pattern or HttpOnly cookies (never localStorage for auth)
- Subresource Integrity (SRI) for CDN resources
- Input validation with Zod (client-side for UX, server-side for security)
- Clickjacking protection: frame-ancestors 'none'
- HSTS with preload

## Backend Security Checks

- SQL/NoSQL injection: parameterized queries only, no string concatenation
- Authentication: Argon2id for passwords, short-lived JWTs (15min), refresh tokens in DB
- Authorization: RBAC middleware, deny by default, server-side enforcement
- Rate limiting: global + strict on auth endpoints (5 attempts/15min)
- SSRF prevention: URL validation, DNS resolution check, block internal IPs
- File upload: magic byte validation, safe filenames, store outside web root
- Command injection: execFile with arrays (not exec with strings)
- Path traversal: basename extraction, resolve + prefix check
- Error handling: never leak stack traces, generic messages for 500s
- Secrets: never in code, use Vault/AWS Secrets Manager

## Cryptography Standards

- Symmetric: AES-256-GCM with random 96-bit IVs (never reuse)
- Asymmetric: Ed25519 or ECDSA P-384
- Password hashing: Argon2id (memoryCost: 65536, timeCost: 3, parallelism: 4)
- TLS 1.3 minimum (1.2 acceptable), no weak cipher suites
- Use crypto.timingSafeEqual for constant-time comparisons
- Never use MD5, SHA-1, Math.random() for security purposes

## DevSecOps Checks

- SAST: Semgrep + CodeQL in CI (TypeScript, OWASP rules)
- DAST: OWASP ZAP baseline scans on staging
- SCA: npm audit, Dependabot/Renovate, Socket.dev
- Container security: non-root, read-only filesystem, minimal base image, Trivy scanning
- CI/CD: GitHub Actions pinned by SHA, minimal permissions, OIDC for cloud auth
- Secret detection: Gitleaks pre-commit hook + CI
- Supply chain: Cosign image signing, SBOM generation

## Compliance Checks

### SOC 2
- Access controls, encryption at rest/transit, monitoring
- Audit logging with PII redaction
- Evidence collection automation

### GDPR
- Data minimization, consent management
- Right to erasure (automated deletion across all systems)
- Breach notification procedures (72 hours)

### PCI-DSS
- Tokenization (Stripe Elements), never handle raw card data
- Payment page CSP + SRI
- Script integrity monitoring

## Security Review Output Format

Structure your audit as:
1. **Risk Summary** — Overall security posture (Critical/High/Medium/Low)
2. **Critical Findings** — Must fix immediately (vulnerabilities actively exploitable)
3. **High Findings** — Fix within 7 days
4. **Medium Findings** — Fix within 30 days
5. **Low Findings** — Fix within 90 days
6. **Recommendations** — Best practice improvements
7. **Compliance Notes** — Relevant compliance gaps

For each finding include:
- Description and affected file/line
- CWE ID and OWASP category
- Impact and exploitability assessment
- Specific remediation with code example

## Workflow

1. Explore repository structure to understand the application
2. Analyze code for vulnerabilities across all OWASP categories
3. Check dependency security (package.json, lockfile)
4. Review authentication, authorization, and cryptography
5. Assess security headers and configuration
6. Compile findings into a prioritized security report
7. Post the audit as a structured comment on the issue or PR`}
    </Prompt>

    <Tool
      name="get_file_content"
      description="Fetch the content of a file from a GitHub repository for security analysis"
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
      description="Search for security-relevant code patterns in a repository (e.g. eval, exec, innerHTML, SQL queries, secrets)"
      parameters={{
        type: "object" as const,
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          query: { type: "string", description: "Search query (vulnerability pattern, keyword, etc.)" }
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
      name="check_dependencies"
      description="Fetch and analyze package.json for dependency security concerns"
      parameters={{
        type: "object" as const,
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          path: { type: "string", description: "Path to package.json (default: package.json)" }
        },
        required: ["owner", "repo"]
      }}
      execute={async (input: Record<string, unknown>) => {
        const pkgPath = (input.path as string) || 'package.json'
        const { data } = await octokit.repos.getContent({
          owner: input.owner as string,
          repo: input.repo as string,
          path: pkgPath
        })
        if ('content' in data) {
          return Buffer.from(data.content, 'base64').toString('utf-8')
        }
        return 'package.json not found'
      }}
    />

    <Tool
      name="post_comment"
      description="Post a security audit comment on a GitHub issue or pull request"
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

export const SecurityAgent = createSecurityAgent('claude-sonnet-4-20250514')
