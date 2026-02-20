import { Agent, Tool, Prompt } from 'smithers'
import { Octokit } from '@octokit/rest'

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

export const SecurityAgent = (
  <Agent name="security" model="claude-sonnet-4-20250514">
    <Prompt>
      {`You are a security expert specialized in application security and secure coding practices.

Your expertise:
- OWASP Top 10 vulnerabilities
- Authentication and authorization flaws
- Injection attacks (SQL, NoSQL, Command, XSS, LDAP)
- Cryptography and data protection
- Secure session management
- API security (rate limiting, input validation, CORS)
- Dependency vulnerabilities (CVEs, outdated packages)
- Secrets management (API keys, tokens, credentials)
- Security headers and CSP
- CSRF, SSRF, and other web attacks
- Container and infrastructure security
- Compliance (GDPR, PCI-DSS, HIPAA)

Security review checklist:
1. **Input validation**: Are all inputs validated and sanitized?
2. **Authentication**: Is authentication properly implemented?
3. **Authorization**: Are access controls correctly enforced?
4. **Data protection**: Is sensitive data encrypted at rest and in transit?
5. **Secrets**: Are there hardcoded secrets or credentials?
6. **Dependencies**: Are dependencies up-to-date and vulnerability-free?
7. **Injection**: Are queries parameterized? Is user input escaped?
8. **XSS**: Are outputs properly encoded?
9. **CSRF**: Are state-changing operations protected?
10. **Rate limiting**: Are APIs protected against abuse?
11. **Logging**: Are security events logged (without sensitive data)?
12. **Error handling**: Do errors leak sensitive information?

Provide:
- Severity rating (CRITICAL, HIGH, MEDIUM, LOW, INFO)
- CVE references when applicable
- Exploitation scenarios
- Remediation steps with code examples
- Best practice recommendations`}
    </Prompt>

    <Tool
      name="get_pr_diff"
      description="Fetch the diff for a GitHub pull request"
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
      description="Fetch file content from a GitHub repository"
      parameters={{
        type: "object" as const,
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          path: { type: "string", description: "File path" },
          ref: { type: "string", description: "Branch or commit ref (optional)" }
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
        return 'Directory or symlink, not a file'
      }}
    />

    <Tool
      name="check_dependabot_alerts"
      description="List Dependabot security alerts for a repository"
      parameters={{
        type: "object" as const,
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          state: { type: "string", enum: ["open", "fixed", "dismissed"], description: "Alert state" }
        },
        required: ["owner", "repo"]
      }}
      execute={async (input: Record<string, unknown>) => {
        try {
          const { data } = await octokit.request('GET /repos/{owner}/{repo}/dependabot/alerts', {
            owner: input.owner as string,
            repo: input.repo as string,
            state: input.state as string | undefined
          })
          return JSON.stringify(data.map((alert: any) => ({
            number: alert.number,
            state: alert.state,
            severity: alert.security_advisory.severity,
            summary: alert.security_advisory.summary,
            cve_id: alert.security_advisory.cve_id,
            package: alert.dependency.package.name,
            vulnerable_version: alert.dependency.manifest_path
          })), null, 2)
        } catch (error: any) {
          return `Error fetching alerts: ${error.message}`
        }
      }}
    />

    <Tool
      name="post_review"
      description="Post a security review on a GitHub pull request"
      parameters={{
        type: "object" as const,
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          pull_number: { type: "number", description: "PR number" },
          body: { type: "string", description: "Review comment body" },
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
        return `Security review posted: ${data.html_url}`
      }}
    />

    <Tool
      name="post_comment"
      description="Post a comment on a GitHub issue or PR"
      parameters={{
        type: "object" as const,
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          issue_number: { type: "number", description: "Issue or PR number" },
          body: { type: "string", description: "Comment body" }
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
