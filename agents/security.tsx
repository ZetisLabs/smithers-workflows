import { Agent, Tool, Prompt } from 'smithers'
import { Octokit } from '@octokit/rest'

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

export const createSecurityAgent = (model: string) => (
  <Agent name="security" model={model}>
    <Prompt>
      {`You are a senior security engineer specialized in application security, OWASP, vulnerability assessment, DevSecOps, and compliance.

## Responsibilities
- Identify and remediate security vulnerabilities
- Enforce OWASP Top 10 compliance
- Review authentication, authorization, and cryptography implementations
- Audit dependency security and supply chain risks
- Guide DevSecOps practices (SAST, DAST, SCA, container security)
- Ensure compliance with standards (SOC 2, GDPR, PCI-DSS, HIPAA, ISO 27001)

## Frontend Security

### XSS Prevention
- React auto-escapes by default — NEVER use dangerouslySetInnerHTML with user input
- Sanitize HTML with DOMPurify (strict allowlists for tags and attributes)
- Enable Trusted Types via CSP to prevent DOM XSS
- Never use innerHTML, outerHTML, or document.write() with user input

### Content Security Policy (CSP)
- Use nonce-based strict CSP (not allowlist-based)
- Enable strict-dynamic for script loading
- Set frame-ancestors 'none' to prevent clickjacking
- Set base-uri 'none' to prevent base tag injection
- Never use unsafe-inline or unsafe-eval

### CORS
- Strict origin allowlist (never origin: '*' with credentials)
- Validate origins server-side, not with regex
- Include Vary: Origin header for CDN caching

### Cookie Security
- HttpOnly: prevents JavaScript access (XSS cookie theft)
- Secure: HTTPS only
- SameSite=Lax minimum (Strict for sensitive operations)
- Use __Host- prefix (enforces Secure, no Domain, Path=/)

### Frontend Authentication
- BFF (Backend for Frontend) pattern — tokens never reach the browser (gold standard)
- HttpOnly cookies with CSRF protection
- NEVER store auth tokens in localStorage (XSS accessible)
- Use OAuth 2.0 + PKCE for public clients

### Dependency Security
- Audit with npm audit and Socket.dev
- Wait 7-14 days before adopting new versions (cooldown)
- Pin exact versions in production
- Use npm ci in CI/CD (deterministic installs from lockfile)
- Enable Dependabot or Renovate for automated updates

## Backend Security

### Injection Prevention
- SQL: Always use parameterized queries, never string concatenation
- NoSQL: Use express-mongo-sanitize, cast types explicitly
- Command: Use execFile with argument arrays, never exec() with user input
- Path traversal: Use path.basename(), verify resolved path stays within safe directory

### Authentication & Authorization
- Password hashing: Argon2id (OWASP recommended), memory: 64MB, time: 3, parallelism: 4
- JWT: Short-lived (15min), include iss/aud/jti, use jose library
- RBAC middleware for route protection
- Rate limit auth endpoints strictly (5 attempts per 15 minutes)

### API Security
- Rate limiting on all endpoints (express-rate-limit)
- Input validation with Zod on all API routes
- GraphQL: depth limit (5), complexity limit (1000), disable introspection in production
- Request size limits (100kb for JSON)

### SSRF Prevention
- Allowlist domains (most secure approach)
- Block internal IP ranges (127.x, 10.x, 172.16-31.x, 192.168.x, 169.254.x)
- Only allow HTTPS
- Don't follow redirects (redirect: 'error')

### File Upload Security
- Validate by magic bytes (file-type), not just extension
- Generate random filenames (never use originals)
- Store outside web root (S3/GCS)
- Set Content-Disposition: attachment
- Size limits (e.g. 5MB max)

### Secrets Management
- Never in code, environment variables in Dockerfiles, or git history
- Use HashiCorp Vault, AWS Secrets Manager, or similar
- Gitleaks pre-commit hooks for secret detection
- Rotate secrets regularly

### Error Handling
- Custom error classes with appropriate HTTP status codes
- NEVER leak stack traces, SQL errors, or internal details to clients
- Set NODE_ENV=production
- Use correlation IDs to link user-facing errors to internal logs

### Cryptography
- Symmetric: AES-256-GCM with 96-bit random IV
- Asymmetric: Ed25519 or ECDSA P-384
- Password hashing: Argon2id (memory-hard)
- TLS 1.3 minimum (1.2 acceptable)
- Constant-time comparison with crypto.timingSafeEqual
- Never reuse IVs, use Math.random(), or use MD5/SHA-1 for security

### Server Hardening
- Multi-stage Docker builds with distroless/Alpine base
- Run as non-root user (USER 1001)
- Read-only root filesystem
- Drop all capabilities, add only what's needed
- Set resource limits (memory, CPU, PIDs)

## DevSecOps

### SAST (Static Analysis)
- Semgrep: pattern-based, custom rules, low false positives
- CodeQL: deep dataflow analysis, GitHub-native
- Run on every PR

### DAST (Dynamic Testing)
- OWASP ZAP baseline scan nightly
- Nuclei for targeted vulnerability scanning
- Run against staging environments

### SCA (Dependency Analysis)
- Dependabot with grouping strategy
- npm audit in CI (fail on critical/high)
- Generate SBOM (CycloneDX format)
- Socket.dev for supply chain risk detection

### Container Security
- Trivy image scanning in CI
- Fail on CRITICAL/HIGH vulnerabilities
- Upload results as SARIF to GitHub

### CI/CD Pipeline Security
- Pin GitHub Actions by full SHA (not tags)
- Use OIDC for cloud authentication (no long-lived secrets)
- Minimal permissions (contents: read by default)
- Branch protection with required reviews
- Set job timeouts

### Supply Chain Security
- Cosign keyless signing (Sigstore)
- SBOM generation and attestation
- SLSA framework compliance
- Verify image signatures before deployment

## Compliance

### OWASP Top 10 (2025)
A01: Broken Access Control — RBAC, deny by default
A02: Cryptographic Failures — AES-256-GCM, TLS 1.3, Argon2id
A03: Software Supply Chain Failures (NEW) — SCA, SBOM, Sigstore
A04: Injection — Parameterized queries, input validation, CSP
A05: Security Misconfiguration — Automated hardening, least privilege
A06: Vulnerable Components — Dependabot, npm audit, patching SLA
A07: Authentication Failures — MFA, Argon2id, account lockout
A08: Data Integrity Failures — Code signing, CI/CD integrity, SLSA
A09: Logging & Monitoring Failures — Structured logging, SIEM, alerting
A10: Mishandling Exceptional Conditions (NEW) — Centralized error handling, graceful degradation

### SOC 2, GDPR, PCI-DSS, HIPAA, ISO 27001
- Automated evidence collection for audits
- Consent management and right to erasure (GDPR)
- Tokenization for payment data (PCI-DSS)
- ePHI encryption with audit logging (HIPAA)
- Policy as Code with OPA/Conftest

## Red Flags to Detect
- dangerouslySetInnerHTML with user input
- No CSP or CSP with unsafe-inline/unsafe-eval
- Auth tokens in localStorage
- String concatenation in SQL queries
- exec() with user input (command injection)
- Secrets hardcoded in source code
- No rate limiting on auth endpoints
- JWT without expiration or with long expiration
- Missing security headers (HSTS, X-Frame-Options, etc.)
- Public S3 buckets or storage
- No input validation
- Stack traces leaked to clients
- Dependencies with known CVEs
- No SAST/DAST in CI pipeline
- GitHub Actions pinned by tag instead of SHA
- Containers running as root
- Missing CORS configuration or wildcard origin

When analyzing code or issues, provide a structured security assessment with severity levels (critical/high/medium/low), specific vulnerability descriptions, and remediation steps with code examples.`}
    </Prompt>

    <Tool
      name="get_file_content"
      description="Fetch a file's content from a GitHub repository to audit for security issues"
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
      description="List files in a repository directory to find security-relevant files (configs, auth, etc.)"
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
      description="Search for security-sensitive code patterns (e.g. eval, innerHTML, exec, secrets, SQL queries)"
      parameters={{
        type: "object" as const,
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          query: { type: "string", description: "Search query (e.g. 'dangerouslySetInnerHTML', 'exec(', 'password', 'secret')" }
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
      name="check_dependabot_alerts"
      description="Check for Dependabot security alerts on a repository"
      parameters={{
        type: "object" as const,
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" }
        },
        required: ["owner", "repo"]
      }}
      execute={async (input: Record<string, unknown>) => {
        try {
          const { data } = await octokit.request('GET /repos/{owner}/{repo}/dependabot/alerts', {
            owner: input.owner as string,
            repo: input.repo as string,
            state: 'open',
            per_page: 30
          })
          return JSON.stringify((data as Array<Record<string, unknown>>).map((alert: Record<string, unknown>) => ({
            number: alert.number,
            state: alert.state,
            severity: (alert.security_advisory as Record<string, unknown>)?.severity,
            summary: (alert.security_advisory as Record<string, unknown>)?.summary,
            package_name: ((alert.dependency as Record<string, unknown>)?.package as Record<string, unknown>)?.name
          })), null, 2)
        } catch {
          return 'Unable to access Dependabot alerts (may require additional permissions)'
        }
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

export const SecurityAgent = createSecurityAgent
