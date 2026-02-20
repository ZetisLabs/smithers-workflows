# Security Best Practices

> Comprehensive security guide covering frontend, backend, DevSecOps, and compliance.
> Last updated: 2026-02-20

## Table of Contents

- [1. Frontend Security](#1-frontend-security)
  - [1.1 XSS Prevention](#11-xss-prevention)
  - [1.2 Content Security Policy (CSP)](#12-content-security-policy-csp)
  - [1.3 CORS](#13-cors)
  - [1.4 Subresource Integrity (SRI)](#14-subresource-integrity-sri)
  - [1.5 Cookie Security](#15-cookie-security)
  - [1.6 Frontend Authentication](#16-frontend-authentication)
  - [1.7 Input Validation & Sanitization](#17-input-validation--sanitization)
  - [1.8 Dependency Security](#18-dependency-security)
  - [1.9 Clickjacking Protection](#19-clickjacking-protection)
  - [1.10 HTTPS & HSTS](#110-https--hsts)
  - [1.11 Security Headers](#111-security-headers)
  - [1.12 Client-Side Storage Security](#112-client-side-storage-security)
  - [1.13 WebSocket Security](#113-websocket-security)
  - [1.14 iframe Security](#114-iframe-security)
- [2. Backend Security](#2-backend-security)
  - [2.1 SQL Injection Prevention](#21-sql-injection-prevention)
  - [2.2 NoSQL Injection](#22-nosql-injection)
  - [2.3 Authentication & Authorization](#23-authentication--authorization)
  - [2.4 API Security](#24-api-security)
  - [2.5 SSRF Prevention](#25-ssrf-prevention)
  - [2.6 File Upload Security](#26-file-upload-security)
  - [2.7 Secrets Management](#27-secrets-management)
  - [2.8 Logging & Monitoring](#28-logging--monitoring)
  - [2.9 Database Security](#29-database-security)
  - [2.10 Error Handling](#210-error-handling)
  - [2.11 Command Injection](#211-command-injection)
  - [2.12 Path Traversal](#212-path-traversal)
  - [2.13 Denial of Service Protection](#213-denial-of-service-protection)
  - [2.14 Cryptography](#214-cryptography)
  - [2.15 Server Hardening](#215-server-hardening)
- [3. DevSecOps](#3-devsecops)
  - [3.1 SAST (Static Application Security Testing)](#31-sast)
  - [3.2 DAST (Dynamic Application Security Testing)](#32-dast)
  - [3.3 SCA (Software Composition Analysis)](#33-sca)
  - [3.4 Container Security](#34-container-security)
  - [3.5 Infrastructure as Code Security](#35-infrastructure-as-code-security)
  - [3.6 CI/CD Pipeline Security](#36-cicd-pipeline-security)
  - [3.7 Supply Chain Security](#37-supply-chain-security)
  - [3.8 Secret Detection](#38-secret-detection)
  - [3.9 Vulnerability Management](#39-vulnerability-management)
  - [3.10 Security Testing in CI](#310-security-testing-in-ci)
- [4. Compliance](#4-compliance)
  - [4.1 OWASP Top 10 (2025)](#41-owasp-top-10-2025)
  - [4.2 SOC 2](#42-soc-2)
  - [4.3 GDPR](#43-gdpr)
  - [4.4 PCI-DSS](#44-pci-dss)
  - [4.5 HIPAA](#45-hipaa)
  - [4.6 ISO 27001](#46-iso-27001)
  - [4.7 Security Policies](#47-security-policies)
  - [4.8 Audit & Evidence](#48-audit--evidence)
- [5. Implementation Checklist](#5-implementation-checklist)
- [6. Sources](#6-sources)

---

## 1. Frontend Security

### 1.1 XSS Prevention

Cross-Site Scripting (XSS) remains the most prevalent web vulnerability. There are three types: **Stored** (persistent in database), **Reflected** (via URL parameters), and **DOM-based** (client-side manipulation).

**Framework-specific protections:**

```tsx
// React -- auto-escapes by default. NEVER use dangerouslySetInnerHTML with user input.
function SafeComponent({ userInput }: { userInput: string }) {
  return <div>{userInput}</div>; // Auto-escaped
}

// DANGEROUS -- avoid this pattern
function UnsafeComponent({ html }: { html: string }) {
  // return <div dangerouslySetInnerHTML={{ __html: html }} />; // XSS risk!

  // If you must render HTML, sanitize first:
  const clean = DOMPurify.sanitize(html);
  return <div dangerouslySetInnerHTML={{ __html: clean }} />;
}
```

**DOMPurify sanitization:**

```typescript
import DOMPurify from 'dompurify';

// Basic sanitization
const clean = DOMPurify.sanitize(dirtyHtml);

// Strict: only allow specific tags and attributes
const strict = DOMPurify.sanitize(dirtyHtml, {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p'],
  ALLOWED_ATTR: ['href', 'title'],
  ALLOW_DATA_ATTR: false,
});

// Strip all HTML
const textOnly = DOMPurify.sanitize(dirtyHtml, { ALLOWED_TAGS: [] });
```

**Trusted Types (CSP Level 3) -- prevents DOM XSS at the browser level:**

```
Content-Security-Policy: require-trusted-types-for 'script'
```

```typescript
// Create a Trusted Types policy
if (window.trustedTypes) {
  const policy = trustedTypes.createPolicy('default', {
    createHTML: (input: string) => DOMPurify.sanitize(input),
    createScript: () => { throw new Error('Scripts not allowed'); },
    createScriptURL: () => { throw new Error('Script URLs not allowed'); },
  });
}
```

**Tools:** DOMPurify, Trusted Types API, eslint-plugin-no-unsanitized, semgrep (XSS rules).

**Common mistakes:**
- Using `innerHTML`, `outerHTML`, or `document.write()` with user input
- Inserting user data into `javascript:` URLs or event handlers
- Relying solely on client-side sanitization without server-side validation
- Using `.html()` in jQuery with untrusted data

---

### 1.2 Content Security Policy (CSP)

CSP is the most powerful defense against XSS. Use nonce-based strict CSP (recommended over allowlist-based).

**Strict CSP with nonces (recommended):**

```
Content-Security-Policy:
  default-src 'none';
  script-src 'nonce-{RANDOM}' 'strict-dynamic';
  style-src 'nonce-{RANDOM}';
  img-src 'self' data:;
  font-src 'self';
  connect-src 'self' https://api.example.com;
  frame-ancestors 'none';
  base-uri 'none';
  form-action 'self';
  require-trusted-types-for 'script';
```

**Express.js with Helmet:**

```typescript
import helmet from 'helmet';
import crypto from 'crypto';

app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(32).toString('base64');
  next();
});

app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'none'"],
      scriptSrc: [(req, res) => `'nonce-${res.locals.cspNonce}'`, "'strict-dynamic'"],
      styleSrc: [(req, res) => `'nonce-${res.locals.cspNonce}'`],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'https://api.example.com'],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'self'"],
    },
  }),
);
```

**Report-only mode for gradual rollout:**

```
Content-Security-Policy-Report-Only:
  default-src 'self';
  report-uri /csp-report;
  report-to csp-endpoint;
```

**Tools:** Helmet.js, csp-evaluator.withgoogle.com, report-uri.com, CSP Scanner.

**Common mistakes:**
- Using `unsafe-inline` or `unsafe-eval` (defeats the purpose of CSP)
- Overly permissive allowlists (`*.googleapis.com` allows JSONP bypass)
- Not using `frame-ancestors` to prevent clickjacking
- Forgetting `base-uri 'none'` (base tag injection can bypass CSP)

---

### 1.3 CORS

Cross-Origin Resource Sharing controls which domains can access your API.

**Proper CORS configuration:**

```typescript
import cors from 'cors';

const ALLOWED_ORIGINS = new Set([
  'https://app.example.com',
  'https://admin.example.com',
]);

if (process.env.NODE_ENV !== 'production') {
  ALLOWED_ORIGINS.add('http://localhost:3000');
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.has(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600, // Cache preflight for 10 minutes
}));
```

**Common mistakes:**
- Using `origin: '*'` with `credentials: true` (browsers block this)
- Reflecting any origin back without validation (`origin: true`)
- Regex-based origin matching without proper anchoring (`/example\.com$/` matches `evil-example.com`)
- Forgetting `Vary: Origin` header (causes CDN caching issues)

---

### 1.4 Subresource Integrity (SRI)

SRI ensures CDN-loaded resources haven't been tampered with.

```html
<script
  src="https://cdn.example.com/lib.js"
  integrity="sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8w"
  crossorigin="anonymous">
</script>

<link
  rel="stylesheet"
  href="https://cdn.example.com/style.css"
  integrity="sha384-Gn5384xqQ1aoWXA+058RXPxPg6fy4IWvTNh0E263XmFcJlSAwiGgFAW/dAiS6JXm"
  crossorigin="anonymous">
```

**Generate SRI hashes:**

```bash
# Generate hash for a remote resource
curl -s https://cdn.example.com/lib.js | openssl dgst -sha384 -binary | openssl base64 -A

# Using srihash.org or webpack-subresource-integrity plugin
```

**Common mistakes:**
- Not including `crossorigin="anonymous"` (SRI check is silently skipped)
- Using SRI with resources that change frequently (hash mismatch blocks loading)
- Not having a fallback for SRI failures

---

### 1.5 Cookie Security

```typescript
// Express.js secure cookie configuration
app.use(session({
  name: '__Host-session', // __Host- prefix enforces Secure + no Domain
  secret: process.env.SESSION_SECRET,
  cookie: {
    httpOnly: true,     // Not accessible via JavaScript
    secure: true,       // HTTPS only
    sameSite: 'lax',    // CSRF protection (use 'strict' for sensitive operations)
    maxAge: 3600000,    // 1 hour
    path: '/',
    domain: undefined,  // Required for __Host- prefix
  },
  resave: false,
  saveUninitialized: false,
}));
```

| Attribute | Purpose |
|-----------|---------|
| `HttpOnly` | Prevents JavaScript access (blocks XSS cookie theft) |
| `Secure` | Only sent over HTTPS |
| `SameSite=Lax` | Blocks cross-site POST requests (CSRF protection) |
| `SameSite=Strict` | Blocks all cross-site requests |
| `__Host-` prefix | Enforces Secure, no Domain, Path=/ |
| `__Secure-` prefix | Enforces Secure flag |

---

### 1.6 Frontend Authentication

**Token storage hierarchy (most secure to least):**

1. **BFF (Backend for Frontend) pattern** -- tokens never reach the browser (gold standard)
2. **HttpOnly cookies** with CSRF protection
3. **In-memory** (JavaScript variable) with HttpOnly cookie refresh token
4. **Never use `localStorage`** for auth tokens (accessible to XSS)

**BFF pattern (recommended for SPAs):**

```
Browser <--cookie--> BFF Server <--token--> API Server
```

```typescript
// BFF proxy -- tokens stay server-side
app.post('/bff/api/:path(*)', async (req, res) => {
  const session = req.session;
  if (!session?.accessToken) return res.status(401).json({ error: 'Unauthenticated' });

  const response = await fetch(`${API_URL}/${req.params.path}`, {
    method: req.method,
    headers: {
      'Authorization': `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(req.body),
  });

  res.status(response.status).json(await response.json());
});
```

**OAuth 2.0 + PKCE (for public clients):**

```typescript
// Generate PKCE challenge
function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

// Authorization request
const { verifier, challenge } = generatePKCE();
sessionStorage.setItem('pkce_verifier', verifier); // Temporary, cleared after exchange

const authUrl = new URL('https://auth.example.com/authorize');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('code_challenge', challenge);
authUrl.searchParams.set('code_challenge_method', 'S256');
authUrl.searchParams.set('state', crypto.randomUUID());
```

---

### 1.7 Input Validation & Sanitization

```typescript
import { z } from 'zod';

// Client-side validation schema (mirror server-side)
const userFormSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(100).regex(/^[\p{L}\p{N}\s\-'.]+$/u),
  age: z.number().int().min(13).max(150),
  website: z.string().url().optional(),
});

// Validate before submission
function handleSubmit(formData: unknown) {
  const result = userFormSchema.safeParse(formData);
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    // Display errors to user
    return;
  }
  // Submit result.data (typed and validated)
}
```

**Rule:** Always validate on the server. Client-side validation is for UX, not security.

---

### 1.8 Dependency Security

Supply chain attacks are the top emerging threat. The September 2025 Shai-Hulud attack compromised packages with 2.6 billion weekly downloads.

```bash
# Audit dependencies
npm audit --audit-level=high
npx socket optimize  # Socket.dev -- detects supply chain risks

# Lock file integrity
npm ci  # Uses package-lock.json exactly (never npm install in CI)

# Check for known vulnerabilities
npx better-npm-audit audit
```

**Recommended practices:**
- Wait 7-14 days before adopting new dependency versions (cooldown period)
- Pin exact versions in production (`"lodash": "4.17.21"` not `"^4.17.21"`)
- Use `npm ci` in CI/CD (deterministic installs from lockfile)
- Enable Dependabot or Renovate for automated updates
- Run Socket.dev to detect typosquatting, install scripts, and obfuscated code

**Tools:** npm audit, Socket.dev, Snyk, Dependabot, Renovate, better-npm-audit.

---

### 1.9 Clickjacking Protection

```
# X-Frame-Options (legacy, still supported)
X-Frame-Options: DENY

# CSP frame-ancestors (modern, more flexible)
Content-Security-Policy: frame-ancestors 'none';

# Allow only same-origin framing
Content-Security-Policy: frame-ancestors 'self';
```

```typescript
// Express.js
app.use(helmet.frameguard({ action: 'deny' }));
// Or via CSP (preferred)
app.use(helmet.contentSecurityPolicy({
  directives: { frameAncestors: ["'none'"] },
}));
```

---

### 1.10 HTTPS & HSTS

```
# HSTS header (required before preload submission)
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

```typescript
// Express.js
app.use(helmet.hsts({
  maxAge: 63072000, // 2 years
  includeSubDomains: true,
  preload: true,
}));
```

**HSTS deployment steps:**
1. Ensure all subdomains support HTTPS
2. Start with low `max-age` (300 seconds) and ramp up
3. Add `includeSubDomains`
4. Set `max-age` to 2 years (63072000)
5. Add `preload` directive
6. Submit to [hstspreload.org](https://hstspreload.org)

**Warning:** HSTS preloading is difficult to reverse. Removal takes months via browser updates.

---

### 1.11 Security Headers

```typescript
import helmet from 'helmet';

// Helmet sets sensible defaults for all these headers
app.use(helmet());

// Or configure individually:
app.use(helmet.noSniff());                    // X-Content-Type-Options: nosniff
app.use(helmet.referrerPolicy({
  policy: 'strict-origin-when-cross-origin',
}));
app.use(helmet.permittedCrossDomainPolicies());
app.use(helmet.dnsPrefetchControl());
```

**Permissions-Policy (only ~3% of sites use this despite high value):**

```
Permissions-Policy:
  camera=(),
  microphone=(),
  geolocation=(self),
  payment=(self "https://pay.example.com"),
  usb=(),
  bluetooth=(),
  interest-cohort=()
```

**Complete security headers reference:**

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit referrer leakage |
| `Permissions-Policy` | `camera=(), microphone=()` | Restrict browser features |
| `X-DNS-Prefetch-Control` | `off` | Prevent DNS prefetch leaks |
| `Cross-Origin-Opener-Policy` | `same-origin` | Isolate browsing context |
| `Cross-Origin-Embedder-Policy` | `require-corp` | Prevent cross-origin loads |

---

### 1.12 Client-Side Storage Security

**localStorage/sessionStorage are accessible to ANY JavaScript on the page (including XSS payloads).**

```typescript
// NEVER store in localStorage/sessionStorage:
// - Auth tokens, JWTs, API keys
// - PII, PHI, financial data
// - Session identifiers

// If you must store non-sensitive data client-side:
const storageKey = 'user_preferences';

// Encrypt before storing (defense-in-depth, NOT a substitute for proper auth)
import { encrypt, decrypt } from './crypto-utils';

function setSecure(key: string, value: unknown) {
  const encrypted = encrypt(JSON.stringify(value));
  sessionStorage.setItem(key, encrypted); // Prefer sessionStorage over localStorage
}

function getSecure<T>(key: string): T | null {
  const encrypted = sessionStorage.getItem(key);
  if (!encrypted) return null;
  return JSON.parse(decrypt(encrypted));
}
```

| Storage | Scope | XSS Accessible | Use For |
|---------|-------|-----------------|---------|
| `localStorage` | Persistent, same origin | Yes | Non-sensitive preferences |
| `sessionStorage` | Tab-scoped | Yes | Temporary non-sensitive data |
| `IndexedDB` | Persistent, same origin | Yes | Large non-sensitive datasets |
| `HttpOnly Cookie` | Sent with requests | **No** | Auth tokens, sessions |

---

### 1.13 WebSocket Security

```typescript
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({
  server: httpsServer, // Always use wss:// (TLS)
  maxPayload: 64 * 1024, // 64KB max message size
  perMessageDeflate: false, // Disable compression (security)
  verifyClient: ({ origin, req }, callback) => {
    // 1. Origin validation
    const ALLOWED_ORIGINS = new Set(['https://app.example.com']);
    if (!ALLOWED_ORIGINS.has(origin)) {
      callback(false, 403, 'Origin not allowed');
      return;
    }

    // 2. Authentication via one-time token
    const token = new URL(req.url!, `wss://${req.headers.host}`).searchParams.get('token');
    if (!token || !validateOneTimeToken(token)) {
      callback(false, 401, 'Unauthorized');
      return;
    }

    callback(true);
  },
});

// Rate limiting per connection
const messageCounts = new Map<WebSocket, number>();

wss.on('connection', (ws) => {
  messageCounts.set(ws, 0);

  const interval = setInterval(() => messageCounts.set(ws, 0), 60000);

  ws.on('message', (data) => {
    const count = (messageCounts.get(ws) || 0) + 1;
    messageCounts.set(ws, count);

    if (count > 100) { // Max 100 messages/minute
      ws.close(1008, 'Rate limit exceeded');
      return;
    }

    // Validate and sanitize message data
    try {
      const parsed = messageSchema.parse(JSON.parse(data.toString()));
      handleMessage(ws, parsed);
    } catch {
      ws.send(JSON.stringify({ error: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    messageCounts.delete(ws);
    clearInterval(interval);
  });
});
```

**Key rules:**
- Always use `wss://` (TLS) in production
- Validate Origin header on every handshake
- Use one-time ephemeral tokens (not long-lived JWTs in query strings)
- Implement per-connection rate limiting
- Validate all incoming message data

---

### 1.14 iframe Security

```html
<!-- Minimal permissions with sandbox -->
<iframe
  src="https://trusted.example.com/widget"
  sandbox="allow-forms allow-scripts"
  loading="lazy"
></iframe>

<!-- CSP: restrict which origins can be framed -->
<!-- Content-Security-Policy: frame-src https://trusted.example.com -->
```

**postMessage validation:**

```typescript
// Sender: always specify target origin
iframe.contentWindow?.postMessage(
  { type: 'UPDATE', data: safeData },
  'https://trusted.example.com', // NEVER use '*'
);

// Receiver: validate origin AND data
window.addEventListener('message', (event) => {
  // 1. Check origin
  if (event.origin !== 'https://parent.example.com') return;

  // 2. Validate message structure
  const { type, data } = event.data;
  if (typeof type !== 'string' || !ALLOWED_TYPES.has(type)) return;

  // 3. NEVER eval() or use innerHTML with message data
  handleMessage(type, data);
});
```

**Warning:** Never combine `sandbox="allow-scripts allow-same-origin"` -- the embedded content can remove the sandbox attribute entirely.

---

## 2. Backend Security

### 2.1 SQL Injection Prevention

SQL injection allows attackers to modify database queries. Always use parameterized queries.

```typescript
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// VULNERABLE -- string concatenation
// const result = await pool.query(`SELECT * FROM users WHERE id = '${userId}'`);

// SAFE -- parameterized query
async function getUserById(userId: string) {
  const result = await pool.query(
    'SELECT id, name, email FROM users WHERE id = $1',
    [userId],
  );
  return result.rows[0];
}

// SAFE -- ORM with Prisma
async function searchUsers(name: string, limit: number) {
  return prisma.user.findMany({
    where: { name: { contains: name } },
    take: Math.min(limit, 100), // Always cap limits
    select: { id: true, name: true, email: true }, // Explicit field selection
  });
}

// SAFE -- Query builder with Knex
async function getActiveUsers(role: string) {
  return knex('users')
    .where({ role, active: true })
    .select('id', 'name', 'email')
    .limit(100);
}
```

**Common mistakes:**
- String concatenation/template literals in queries
- Using ORM raw query methods with user input
- Not parameterizing `LIKE`, `ORDER BY`, or `LIMIT` clauses

---

### 2.2 NoSQL Injection

MongoDB is vulnerable to operator injection when user input is passed directly.

```typescript
import mongoSanitize from 'express-mongo-sanitize';

// Middleware: strip $ and . from request data
app.use(mongoSanitize());

// VULNERABLE -- user sends { "email": { "$gt": "" } } to bypass auth
// const user = await db.collection('users').findOne({ email: req.body.email });

// SAFE -- explicit type casting
async function findUser(email: unknown) {
  if (typeof email !== 'string') throw new ValidationError('Invalid email');

  return db.collection('users').findOne({
    email: { $eq: String(email) }, // Force string comparison
  });
}

// SAFE -- Zod schema validation
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

app.post('/login', async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  // email is guaranteed to be a string, not an operator object
});
```

---

### 2.3 Authentication & Authorization

**Password hashing with Argon2id (recommended over bcrypt):**

```typescript
import argon2 from 'argon2';

// Hash password (Argon2id -- OWASP recommended)
async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,  // 64 MB
    timeCost: 3,        // 3 iterations
    parallelism: 4,
  });
}

// Verify password
async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
```

**JWT best practices:**

```typescript
import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

// Sign -- short-lived access tokens
async function signAccessToken(userId: string, roles: string[]) {
  return new SignJWT({ sub: userId, roles })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')  // Short-lived (15 minutes max)
    .setIssuer('https://api.example.com')
    .setAudience('https://app.example.com')
    .setJti(crypto.randomUUID()) // Unique token ID for revocation
    .sign(JWT_SECRET);
}

// Verify
async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, JWT_SECRET, {
    issuer: 'https://api.example.com',
    audience: 'https://app.example.com',
  });
  return payload;
}
```

**RBAC middleware:**

```typescript
function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRoles = req.user?.roles || [];
    const hasRole = roles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }
    next();
  };
}

app.delete('/api/users/:id', requireRole('admin'), deleteUser);
```

---

### 2.4 API Security

**Rate limiting:**

```typescript
import { rateLimit } from 'express-rate-limit';

// Global rate limit
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || 'unknown',
}));

// Strict rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5, // 5 attempts per 15 minutes
  skipSuccessfulRequests: true,
});

app.post('/api/login', authLimiter, loginHandler);
app.post('/api/register', authLimiter, registerHandler);
```

**Input validation with Zod:**

```typescript
import { z } from 'zod';

const createUserSchema = z.object({
  body: z.object({
    email: z.string().email().max(254),
    name: z.string().min(1).max(100).trim(),
    password: z.string().min(12).max(128),
    role: z.enum(['user', 'editor']).default('user'),
  }),
  params: z.object({}),
  query: z.object({}),
});

// Validation middleware
function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (!result.success) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', details: result.error.flatten().fieldErrors },
      });
    }

    req.body = result.data.body;
    next();
  };
}

app.post('/api/users', validate(createUserSchema), createUser);
```

**GraphQL security:**

```typescript
import depthLimit from 'graphql-depth-limit';
import { createComplexityLimitRule } from 'graphql-validation-complexity';

const server = new ApolloServer({
  schema,
  validationRules: [
    depthLimit(5),                           // Max query depth
    createComplexityLimitRule(1000),          // Max query complexity
  ],
  plugins: [
    ApolloServerPluginLandingPageDisabled(), // Disable in production
  ],
  introspection: process.env.NODE_ENV !== 'production',
});
```

---

### 2.5 SSRF Prevention

Server-Side Request Forgery allows attackers to make the server fetch internal resources.

```typescript
import { URL } from 'url';
import dns from 'dns/promises';

const BLOCKED_RANGES = [
  /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^169\.254\./, /^0\./, /^::1$/, /^fc00:/, /^fe80:/,
];

async function safeFetch(urlString: string): Promise<Response> {
  // 1. Parse and validate URL
  const url = new URL(urlString);

  // 2. Only allow HTTPS
  if (url.protocol !== 'https:') {
    throw new Error('Only HTTPS URLs are allowed');
  }

  // 3. Allowlist domains (most secure approach)
  const ALLOWED_HOSTS = new Set(['api.github.com', 'api.stripe.com']);
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error('Host not allowed');
  }

  // 4. Resolve DNS and check for internal IPs
  const addresses = await dns.resolve4(url.hostname);
  for (const addr of addresses) {
    if (BLOCKED_RANGES.some((r) => r.test(addr))) {
      throw new Error('Internal addresses are not allowed');
    }
  }

  // 5. Fetch with timeout
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 10000);

  return fetch(urlString, {
    signal: controller.signal,
    redirect: 'error', // Don't follow redirects (can bypass checks)
  });
}
```

**Cloud metadata protection:**
- Block `169.254.169.254` (AWS/GCP metadata endpoint)
- Use IMDSv2 on AWS (requires token-based access)
- Use network policies to restrict outbound traffic

---

### 2.6 File Upload Security

```typescript
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import crypto from 'crypto';
import path from 'path';

// 1. Size and type restrictions
const upload = multer({
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
    files: 1,
  },
  storage: multer.memoryStorage(), // Buffer in memory for validation
});

// 2. Validate file content (magic bytes, not just extension)
async function validateFile(buffer: Buffer, originalName: string) {
  const type = await fileTypeFromBuffer(buffer);

  const ALLOWED_TYPES = new Map([
    ['image/jpeg', ['.jpg', '.jpeg']],
    ['image/png', ['.png']],
    ['image/webp', ['.webp']],
    ['application/pdf', ['.pdf']],
  ]);

  if (!type || !ALLOWED_TYPES.has(type.mime)) {
    throw new Error('File type not allowed');
  }

  // Verify extension matches content
  const ext = path.extname(originalName).toLowerCase();
  if (!ALLOWED_TYPES.get(type.mime)!.includes(ext)) {
    throw new Error('Extension does not match file content');
  }

  return type;
}

// 3. Generate safe filename (never use original)
function safeFilename(ext: string): string {
  return `${crypto.randomUUID()}${ext}`;
}

app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  const type = await validateFile(req.file.buffer, req.file.originalname);
  const filename = safeFilename(`.${type.ext}`);

  // Store outside web root, in isolated storage (S3, GCS)
  await storageService.upload(filename, req.file.buffer, {
    contentType: type.mime,
    contentDisposition: 'attachment', // Force download, never inline
  });

  res.json({ id: filename });
});
```

---

### 2.7 Secrets Management

**Never store secrets in code, environment variables in Dockerfiles, or git history.**

```typescript
// HashiCorp Vault integration
import Vault from 'node-vault';

const vault = Vault({
  apiVersion: 'v1',
  endpoint: process.env.VAULT_ADDR,
  token: process.env.VAULT_TOKEN, // Or use AppRole/Kubernetes auth
});

async function getSecret(path: string): Promise<string> {
  const result = await vault.read(`secret/data/${path}`);
  return result.data.data.value;
}

// AWS Secrets Manager
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const smClient = new SecretsManagerClient({});

async function getAwsSecret(secretId: string): Promise<Record<string, string>> {
  const response = await smClient.send(
    new GetSecretValueCommand({ SecretId: secretId }),
  );
  return JSON.parse(response.SecretString!);
}
```

**Secret detection in CI:**

```bash
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.0
    hooks:
      - id: gitleaks

# .gitleaks.toml
[extend]
useDefault = true

[[rules]]
id = "custom-api-key"
description = "Custom API key pattern"
regex = '''(?i)api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9]{32,}['"]'''
```

**Tools:** HashiCorp Vault, AWS Secrets Manager, SOPS, doppler, gitleaks, truffleHog, git-secrets.

---

### 2.8 Logging & Monitoring

```typescript
import pino from 'pino';

// Structured logging with PII redaction
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'body.password',
      'body.ssn',
      'body.creditCard',
      '*.email',
      '*.token',
    ],
    censor: '[REDACTED]',
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});

// Security event logging
function logSecurityEvent(event: {
  type: 'auth_failure' | 'auth_success' | 'access_denied' | 'suspicious_activity';
  userId?: string;
  ip: string;
  details: string;
}) {
  logger.warn({ security: true, ...event }, `Security event: ${event.type}`);
}

// Express request logging
import pinoHttp from 'pino-http';

app.use(pinoHttp({
  logger,
  genReqId: (req) => req.headers['x-request-id'] as string || crypto.randomUUID(),
}));
```

**Logging rules:**
- Always use structured (JSON) logging for SIEM parsing
- Redact PII, passwords, tokens, session IDs
- Include correlation IDs for distributed tracing
- Store audit logs in append-only / WORM storage
- Alert on anomalous patterns (failed login spikes, privilege escalation)

---

### 2.9 Database Security

```typescript
import { Pool } from 'pg';
import fs from 'fs';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: {
    rejectUnauthorized: true, // Always verify server certificate
    ca: fs.readFileSync('/etc/ssl/certs/rds-ca.pem').toString(),
  },
});

// Row-Level Security (PostgreSQL)
async function queryWithTenant(tenantId: string, query: string, params: unknown[]) {
  const client = await pool.connect();
  try {
    await client.query('SET app.tenant_id = $1', [tenantId]);
    return (await client.query(query, params)).rows;
  } finally {
    client.release();
  }
}
```

```sql
-- Least privilege roles
CREATE ROLE app_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;

CREATE ROLE app_readwrite;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_readwrite;
-- NEVER use superuser for application connections

-- Column-level restrictions
REVOKE SELECT(ssn, credit_card) ON users FROM app_readonly;

-- Row-Level Security
CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
```

| Layer | Method |
|-------|--------|
| At Rest | TDE (Transparent Data Encryption), AES-256 |
| In Transit | TLS 1.3, `ssl: { rejectUnauthorized: true }` |
| Backups | Encrypt with separate keys, separate location |
| Keys | HSM or cloud KMS, rotate regularly |

---

### 2.10 Error Handling

```typescript
// Custom error classes
class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public isOperational: boolean = true,
    public code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, true, 'NOT_FOUND');
  }
}

// Centralized error handler -- NEVER leak stack traces
function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  logger.error({ err, correlationId: req.id, method: req.method, url: req.url });

  if (err instanceof AppError && err.isOperational) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
  }

  // Unknown errors: generic message only
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}

app.use(errorHandler);

// Safety net
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});
```

**Rules:**
- Set `NODE_ENV=production` (Express leaks stack traces in development mode)
- Never return raw database errors to clients
- Use correlation IDs to link user-facing errors to internal logs

---

### 2.11 Command Injection

```typescript
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

const execFileAsync = promisify(execFile);

// VULNERABLE -- exec passes through shell
// exec(`convert ${filename} output.png`); // If filename = "img.png; rm -rf /"

// SAFE -- execFile with argument array (no shell)
async function convertImage(inputPath: string, outputPath: string) {
  if (!/^[a-zA-Z0-9_\-]+\.[a-z]{3,4}$/.test(inputPath)) {
    throw new Error('Invalid filename');
  }

  const { stdout } = await execFileAsync('convert', [
    inputPath,
    '-resize', '800x600',
    outputPath,
  ]);
  return stdout;
}

// BEST -- use Node.js built-in APIs instead of shell commands
await fs.mkdir('/some/path', { recursive: true }); // Instead of exec('mkdir -p')
await fs.rm('/some/file', { recursive: true });     // Instead of exec('rm -rf')
await fs.copyFile('source', 'dest');                // Instead of exec('cp')
```

**Rules:**
- Never use `child_process.exec()` with user input
- Use `execFile` or `spawn` with argument arrays (no shell)
- Prefer Node.js built-in APIs (`fs`, `path`) over shell commands
- Validate arguments against allowlists

---

### 2.12 Path Traversal

```typescript
import path from 'path';
import fs from 'fs/promises';

const SAFE_BASE_DIR = '/var/app/data/uploads';

async function readUserFile(userFilename: string): Promise<Buffer> {
  // 1. Reject malicious patterns
  if (userFilename.includes('..') || userFilename.includes('\0')) {
    throw new Error('Invalid filename');
  }

  // 2. Extract basename only
  const basename = path.basename(userFilename);

  // 3. Resolve to absolute path
  const resolvedPath = path.resolve(SAFE_BASE_DIR, basename);

  // 4. Verify path is within safe directory (CRITICAL)
  if (!resolvedPath.startsWith(SAFE_BASE_DIR + path.sep)) {
    throw new Error('Path traversal detected');
  }

  return fs.readFile(resolvedPath);
}

// Most secure: ID-based file access (no paths from user input)
const FILE_REGISTRY = new Map<string, string>();

function registerFile(physicalPath: string): string {
  const fileId = crypto.randomUUID();
  FILE_REGISTRY.set(fileId, physicalPath);
  return fileId;
}

async function getFileById(fileId: string): Promise<Buffer> {
  const physicalPath = FILE_REGISTRY.get(fileId);
  if (!physicalPath) throw new NotFoundError('File');
  return fs.readFile(physicalPath);
}
```

**Zip Slip prevention:**

```typescript
import unzipper from 'unzipper';

async function safeExtract(zipPath: string, destDir: string) {
  const directory = await unzipper.Open.file(zipPath);
  const resolvedDest = path.resolve(destDir);

  for (const file of directory.files) {
    const filePath = path.resolve(destDir, file.path);

    if (!filePath.startsWith(resolvedDest + path.sep)) {
      throw new Error(`Zip Slip detected: ${file.path}`);
    }

    if (file.type === 'Directory') {
      await fs.mkdir(filePath, { recursive: true });
    } else {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, await file.buffer());
    }
  }
}
```

---

### 2.13 Denial of Service Protection

Node.js is single-threaded -- a single blocked event loop freezes ALL requests.

```typescript
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import slowDown from 'express-slow-down';
import RE2 from 're2';
import { z } from 'zod';

const app = express();

// 1. Request size limits
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ limit: '100kb', extended: false })); // extended: false avoids qs deep nesting

// 2. Server timeouts
import { createServer } from 'http';
const server = createServer(app);
server.timeout = 30000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;
server.requestTimeout = 30000;

// 3. Progressive rate limiting
app.use(slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 50,
  delayMs: (hits) => hits * 100,
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-8',
}));

// 4. ReDoS prevention -- use RE2 for user-supplied patterns
function safeRegexTest(pattern: string, input: string): boolean {
  const re = new RE2(pattern); // RE2: linear time, no catastrophic backtracking
  return re.test(input);
}

// 5. Use Zod instead of hand-written regex for validation
const emailSchema = z.string().email(); // Uses safe internal validation

// 6. Limit JSON nesting depth
function checkJsonDepth(obj: unknown, maxDepth = 5, current = 0): boolean {
  if (current > maxDepth) return false;
  if (typeof obj !== 'object' || obj === null) return true;
  return Object.values(obj).every((v) => checkJsonDepth(v, maxDepth, current + 1));
}
```

---

### 2.14 Cryptography

```typescript
import crypto from 'crypto';

interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
}

// AES-256-GCM encryption (NIST SP 800-38D)
function encrypt(plaintext: string, key: Buffer): EncryptedPayload {
  const iv = crypto.randomBytes(12); // 96-bit IV (NIST recommended for GCM)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

function decrypt(payload: EncryptedPayload, key: Buffer): string {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(payload.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

// Constant-time comparison (prevent timing attacks)
function safeCompare(a: string, b: string): boolean {
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// HMAC for message authentication
function hmacSign(message: string, secret: Buffer): string {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}
```

**Algorithm recommendations (2025):**

| Purpose | Algorithm | Key Size |
|---------|-----------|----------|
| Symmetric encryption | AES-256-GCM | 256-bit |
| Asymmetric signing | Ed25519 or ECDSA P-384 | -- |
| Key exchange | X25519 or ECDH P-384 | -- |
| Hashing (integrity) | SHA-256 / SHA-3 | -- |
| Password hashing | Argon2id | Memory-hard |
| TLS | 1.3 (minimum 1.2) | -- |
| Post-quantum (prepare) | ML-KEM (FIPS 203), ML-DSA (FIPS 204) | -- |

**TLS configuration (Nginx):**

```nginx
server {
    listen 443 ssl http2;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305';

    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    ssl_stapling on;
    ssl_stapling_verify on;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
}
```

**Common mistakes:**
- Reusing IVs with the same key in GCM (catastrophic -- breaks confidentiality AND authenticity)
- Using CBC without HMAC (padding oracle attacks)
- Using MD5 or SHA-1 for security purposes
- Generating keys with `Math.random()` instead of `crypto.randomBytes()`
- Hardcoding encryption keys in source code

---

### 2.15 Server Hardening

**Production-hardened Dockerfile:**

```dockerfile
# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

# Production stage (minimal)
FROM node:22-alpine AS production

RUN apk --no-cache add dumb-init && rm -rf /var/cache/apk/*

# Non-root user
RUN addgroup -g 1001 -S appgroup \
    && adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package.json ./

RUN chown -R appuser:appgroup /app && chmod -R 550 /app

USER appuser

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

EXPOSE 3000
```

**Docker run with security flags:**

```bash
docker run \
  --read-only \
  --tmpfs /tmp:noexec,nosuid,size=64m \
  --cap-drop ALL \
  --cap-add NET_BIND_SERVICE \
  --security-opt no-new-privileges \
  --memory 512m \
  --cpus 1.0 \
  --pids-limit 100 \
  -u 1001:1001 \
  myapp:latest
```

**Kubernetes Security Context:**

```yaml
apiVersion: v1
kind: Pod
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1001
    fsGroup: 1001
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: app
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop: ['ALL']
      resources:
        limits:
          memory: '512Mi'
          cpu: '1'
```

---

## 3. DevSecOps

### 3.1 SAST

Static Application Security Testing scans source code for vulnerabilities before deployment.

**Semgrep in GitHub Actions:**

```yaml
name: SAST
on: [pull_request]

jobs:
  semgrep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: semgrep/semgrep-action@v1
        with:
          config: >-
            p/typescript
            p/owasp-top-ten
            p/nodejs
            p/security-audit
        env:
          SEMGREP_APP_TOKEN: ${{ secrets.SEMGREP_APP_TOKEN }}
```

**CodeQL analysis:**

```yaml
name: CodeQL
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1' # Weekly

jobs:
  analyze:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript
          queries: security-extended
      - uses: github/codeql-action/analyze@v3
        with:
          category: '/language:javascript-typescript'
```

**Custom Semgrep rule example:**

```yaml
rules:
  - id: no-eval-with-user-input
    pattern: eval($INPUT)
    message: "eval() with potentially untrusted input detected"
    severity: ERROR
    languages: [typescript, javascript]
    metadata:
      cwe: ["CWE-95"]
      owasp: ["A03:2021"]
```

**Tools comparison:**

| Tool | Type | Strengths |
|------|------|-----------|
| Semgrep | Pattern-based | Fast, custom rules, low false positives |
| CodeQL | Semantic analysis | Deep dataflow analysis, GitHub-native |
| SonarQube | Multi-language | Quality + security, IDE integration |
| Snyk Code | AI-powered | Real-time in IDE, auto-fix suggestions |

---

### 3.2 DAST

Dynamic Application Security Testing scans running applications.

**OWASP ZAP baseline scan in CI:**

```yaml
name: DAST
on:
  schedule:
    - cron: '0 2 * * *' # Nightly

jobs:
  zap-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Start application
        run: docker compose up -d
      - name: Wait for app
        run: sleep 30
      - uses: zaproxy/action-baseline@v0.12.0
        with:
          target: 'http://localhost:3000'
          rules_file_name: '.zap-rules.tsv'
          fail_action: 'warn'
          allow_issue_writing: false
      - uses: actions/upload-artifact@v4
        with:
          name: zap-report
          path: report_html.html
```

**Nuclei for targeted scanning:**

```yaml
- uses: projectdiscovery/nuclei-action@v2
  with:
    target: https://staging.example.com
    templates: |
      cves/
      misconfiguration/
      exposures/
    severity: 'critical,high,medium'
    sarif-export: nuclei-results.sarif
```

**Strategy:** Run passive scans on every PR, active/full scans on nightly builds against staging.

---

### 3.3 SCA

Software Composition Analysis identifies vulnerabilities in dependencies.

**Dependabot configuration:**

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 10
    groups:
      production:
        dependency-type: production
      development:
        dependency-type: development
    ignore:
      - dependency-name: '*'
        update-types: ['version-update:semver-major']

  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly

  - package-ecosystem: docker
    directory: /
    schedule:
      interval: weekly
```

**npm audit in CI:**

```bash
#!/bin/bash
set -e

AUDIT_RESULT=$(npm audit --json 2>/dev/null || true)
CRITICAL=$(echo "$AUDIT_RESULT" | jq '.metadata.vulnerabilities.critical // 0')
HIGH=$(echo "$AUDIT_RESULT" | jq '.metadata.vulnerabilities.high // 0')

if [ "$CRITICAL" -gt 0 ] || [ "$HIGH" -gt 0 ]; then
  echo "BLOCKING: Found $CRITICAL critical and $HIGH high vulnerabilities"
  npm audit --audit-level=high
  exit 1
fi

echo "No critical/high vulnerabilities found"
```

**SBOM generation:**

```yaml
- name: Generate SBOM
  uses: anchore/sbom-action@v0
  with:
    path: .
    format: cyclonedx-json
    output-file: sbom.json
```

**Tools:** npm audit, Snyk, Dependabot, Renovate, Socket.dev, Syft (SBOM), Grype.

---

### 3.4 Container Security

**Hardened Dockerfile (see [2.15 Server Hardening](#215-server-hardening)).**

**Image scanning with Trivy:**

```yaml
name: Container Security
on: [push]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build image
        run: docker build -t myapp:${{ github.sha }} .
      - uses: aquasecurity/trivy-action@0.28.0
        with:
          image-ref: myapp:${{ github.sha }}
          format: sarif
          output: trivy-results.sarif
          severity: 'CRITICAL,HIGH'
          exit-code: '1'
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: trivy-results.sarif
```

**Container best practices:**
- Use distroless or Alpine base images
- Multi-stage builds (don't ship compilers, source code, dev dependencies)
- Run as non-root (`USER 1001`)
- Read-only root filesystem
- Drop all Linux capabilities
- Set resource limits (memory, CPU, PIDs)
- Scan images in CI/CD before deployment
- Never use `--privileged` flag

---

### 3.5 Infrastructure as Code Security

**Checkov scanning:**

```yaml
- uses: bridgecrewio/checkov-action@v12
  with:
    directory: ./terraform
    framework: terraform
    soft_fail: false
    output_format: sarif
```

**OPA Rego policy (deny public S3 buckets):**

```rego
package terraform.aws.s3

deny contains msg if {
    r := input.resource_changes[_]
    r.type == "aws_s3_bucket"
    r.mode == "managed"
    action := r.change.actions[_]
    {"create", "update"}[action]
    acl := object.get(r.change.after, "acl", "")
    {"public-read", "public-read-write"}[acl]
    msg := sprintf("S3 bucket '%s' must not have a public ACL: '%s'", [r.address, acl])
}
```

```bash
# Evaluate against Terraform plan
terraform plan -out=tfplan.binary
terraform show -json tfplan.binary > tfplan.json
opa eval --data policies/ --input tfplan.json "data.terraform.aws.s3.deny"
```

**Kyverno policy (require non-root containers):**

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-run-as-nonroot
spec:
  validationFailureAction: Enforce
  background: true
  rules:
    - name: run-as-non-root
      match:
        any:
          - resources:
              kinds:
                - Pod
      validate:
        message: "Running as root is not allowed. Set runAsNonRoot to true."
        anyPattern:
          - spec:
              securityContext:
                runAsNonRoot: true
          - spec:
              containers:
                - securityContext:
                    runAsNonRoot: true
```

**Tools:** Checkov, tfsec, OPA/Conftest, Kyverno, Trivy (IaC scanning).

---

### 3.6 CI/CD Pipeline Security

**Hardened GitHub Actions workflow:**

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read # Minimal permissions

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      # Pin actions by SHA (not tags -- tags can be moved)
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: actions/setup-node@39370e3970a6d050c480ffad4ff0ed4d3fdee5af # v4.1.0
        with:
          node-version-file: .nvmrc
          cache: npm

      - run: npm ci
      - run: npm test
      - run: npm run build

  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      id-token: write # OIDC for cloud auth (no long-lived secrets)
      contents: read
    steps:
      - uses: aws-actions/configure-aws-credentials@e3dd6a429d7300a6a4c196c26e071d42e0343502 # v4.0.2
        with:
          role-to-assume: arn:aws:iam::123456789:role/deploy
          aws-region: us-east-1
```

**CI/CD security rules:**
- Pin actions by full SHA (not tags) -- the `tj-actions/changed-files` CVE-2025-30066 compromise proved this is critical
- Use OIDC for cloud authentication (no long-lived secrets)
- Minimal permissions (`contents: read` by default)
- Enable branch protection with required reviews
- Require status checks before merge
- Set job timeouts

---

### 3.7 Supply Chain Security

**Cosign keyless signing (Sigstore):**

```yaml
name: Build & Sign
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      packages: write
      id-token: write # Required for OIDC/keyless signing
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
      - uses: sigstore/cosign-installer@main
      - name: Sign image
        run: cosign sign ghcr.io/${{ github.repository }}:${{ github.sha }}
      - name: Attach SBOM
        run: |
          syft ghcr.io/${{ github.repository }}:${{ github.sha }} -o cyclonedx-json > sbom.json
          cosign attest --type cyclonedx --predicate sbom.json ghcr.io/${{ github.repository }}:${{ github.sha }}
```

**Verification:**

```bash
cosign verify ghcr.io/org/image:sha \
  --certificate-identity=https://github.com/org/repo/.github/workflows/build.yml@refs/heads/main \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com
```

**SLSA framework levels:**
- Level 1: Documentation of the build process
- Level 2: Tamper resistance of the build service
- Level 3: Tamper resistance of the build process (provenance)
- Level 4: Hermetic, reproducible builds

---

### 3.8 Secret Detection

**Gitleaks pre-commit hook:**

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.21.0
    hooks:
      - id: gitleaks
```

```toml
# .gitleaks.toml
[extend]
useDefault = true

[[rules]]
id = "custom-internal-api-key"
description = "Internal API key"
regex = '''INTERNAL_KEY_[A-Za-z0-9]{32,}'''
tags = ["internal"]

[allowlist]
paths = [
    '''\.test\.ts$''',
    '''\.spec\.ts$''',
    '''__mocks__''',
]
```

**GitHub Actions:**

```yaml
- uses: gitleaks/gitleaks-action@v2
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Tools:** Gitleaks, TruffleHog, git-secrets, detect-secrets (Yelp), GitHub secret scanning.

---

### 3.9 Vulnerability Management

**Risk-tiered SLA framework:**

| Priority | CVSS | EPSS | SLA | Example |
|----------|------|------|-----|---------|
| P0 - Critical | 9.0+ | > 0.5 | 24 hours | RCE in production |
| P1 - High | 7.0-8.9 | > 0.3 | 7 days | Auth bypass |
| P2 - Medium | 4.0-6.9 | > 0.1 | 30 days | SSRF with limited impact |
| P3 - Low | 0.1-3.9 | < 0.1 | 90 days | Info disclosure |
| P4 - Informational | 0 | -- | Next sprint | Best practice improvement |

**Composite risk scoring:**

```typescript
interface VulnerabilityRisk {
  cvss: number;
  epss: number;      // Exploit Prediction Scoring System (0-1)
  isKev: boolean;     // CISA Known Exploited Vulnerabilities
  assetCriticality: 'critical' | 'high' | 'medium' | 'low';
}

function calculatePriority(risk: VulnerabilityRisk): 'P0' | 'P1' | 'P2' | 'P3' | 'P4' {
  const assetMultiplier = { critical: 1.5, high: 1.2, medium: 1.0, low: 0.8 };
  const score = (risk.cvss * 0.4 + risk.epss * 10 * 0.3 + (risk.isKev ? 10 : 0) * 0.3)
    * assetMultiplier[risk.assetCriticality];

  if (score >= 8 || risk.isKev) return 'P0';
  if (score >= 6) return 'P1';
  if (score >= 4) return 'P2';
  if (score >= 2) return 'P3';
  return 'P4';
}
```

**Key metrics:** MTTR (Mean Time to Remediate), patch coverage %, SLA compliance rate.

---

### 3.10 Security Testing in CI

**Property-based testing with fast-check:**

```typescript
import fc from 'fast-check';
import { sanitizeHtml } from '../sanitize';

describe('XSS sanitization', () => {
  it('should neutralize all script tags', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (before, after) => {
        const malicious = `${before}<script>alert('xss')</script>${after}`;
        const result = sanitizeHtml(malicious);
        expect(result).not.toContain('<script');
        expect(result).not.toContain('</script');
      }),
    );
  });

  it('should be idempotent', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const once = sanitizeHtml(input);
        const twice = sanitizeHtml(once);
        expect(once).toBe(twice);
      }),
    );
  });
});

describe('input validation', () => {
  it('should reject all prototype pollution payloads', () => {
    fc.assert(
      fc.property(fc.string(), fc.jsonValue(), (key, value) => {
        const payload = { [key]: value, '__proto__': { admin: true } };
        const result = validateInput(payload);
        expect(result).not.toHaveProperty('__proto__');
      }),
    );
  });
});
```

**Security integration tests:**

```typescript
describe('Security headers', () => {
  it('should include all required security headers', async () => {
    const res = await request(app).get('/');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('should rate limit auth endpoints', async () => {
    for (let i = 0; i < 6; i++) {
      await request(app).post('/api/login').send({ email: 'x@x.com', password: 'wrong' });
    }
    const res = await request(app).post('/api/login').send({ email: 'x@x.com', password: 'wrong' });
    expect(res.status).toBe(429);
  });

  it('should not leak error details', async () => {
    const res = await request(app).get('/api/users/invalid-id');
    expect(res.body).not.toHaveProperty('stack');
    expect(res.body).not.toHaveProperty('sql');
    expect(JSON.stringify(res.body)).not.toContain('node_modules');
  });
});
```

---

## 4. Compliance

### 4.1 OWASP Top 10 (2025)

The OWASP Top 10 2025 was released in November 2025 with two new categories.

| # | Category | Key Mitigations |
|---|----------|----------------|
| A01 | Broken Access Control | RBAC, deny by default, server-side enforcement |
| A02 | Cryptographic Failures | AES-256-GCM, TLS 1.3, Argon2id for passwords |
| A03 | **Software Supply Chain Failures** (NEW) | SCA, SBOM, Sigstore, lockfile integrity |
| A04 | Injection | Parameterized queries, input validation, CSP |
| A05 | Security Misconfiguration | Automated hardening, no defaults, least privilege |
| A06 | Vulnerable & Outdated Components | Dependabot, npm audit, SLA for patching |
| A07 | Authentication Failures | MFA, Argon2id, account lockout, credential stuffing protection |
| A08 | Data Integrity Failures | Code signing, CI/CD integrity, SLSA |
| A09 | Security Logging & Monitoring Failures | Structured logging, SIEM, alerting, audit trails |
| A10 | **Mishandling of Exceptional Conditions** (NEW) | Centralized error handling, no stack trace leaks, graceful degradation |

---

### 4.2 SOC 2

SOC 2 evaluates controls based on five Trust Service Criteria.

| Type | Duration | Purpose |
|------|----------|---------|
| Type I | Point in time | Design of controls |
| Type II | 6-12 months | Operating effectiveness |

**Trust Service Criteria:**
1. **Security** (required): Access controls, encryption, monitoring
2. **Availability**: Uptime, disaster recovery, capacity planning
3. **Processing Integrity**: Data accuracy, completeness, timeliness
4. **Confidentiality**: Data classification, encryption at rest/transit
5. **Privacy**: PII handling, consent, retention policies

**Automated evidence collection:**

```yaml
name: SOC2 Evidence
on:
  schedule:
    - cron: '0 0 1 * *' # Monthly

jobs:
  collect:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Access review export
        run: |
          gh api /orgs/$ORG/members --paginate > evidence/access-review-$(date +%Y%m).json
      - name: Dependency audit
        run: npm audit --json > evidence/dep-audit-$(date +%Y%m).json
      - name: Branch protection check
        run: |
          gh api /repos/$ORG/$REPO/branches/main/protection > evidence/branch-protection.json
      - uses: actions/upload-artifact@v4
        with:
          name: soc2-evidence-${{ github.run_id }}
          path: evidence/
          retention-days: 400
```

---

### 4.3 GDPR

**Key requirements for web applications:**

| Requirement | Implementation |
|-------------|---------------|
| Lawful basis | Document processing basis for each data type |
| Consent | Granular, freely given, withdrawable |
| Right to erasure | Automated deletion across all systems |
| Data minimization | Collect only what's necessary |
| Breach notification | 72-hour notification to supervisory authority |
| DPO | Designate Data Protection Officer if applicable |

**Right to erasure implementation:**

```typescript
async function handleErasureRequest(userId: string) {
  const operations = [
    // Database: delete or anonymize
    prisma.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${crypto.randomUUID()}@erased.local`,
        name: '[DELETED]',
        phone: null,
        address: null,
        deletedAt: new Date(),
      },
    }),
    // Search index
    searchClient.deleteDocuments('users', [userId]),
    // Cache
    redis.del(`user:${userId}`, `session:${userId}`),
    // File storage
    storageService.deleteUserFiles(userId),
    // Audit log (keep for legal compliance, but anonymize)
    prisma.auditLog.updateMany({
      where: { userId },
      data: { userId: 'ANONYMIZED', details: '[REDACTED]' },
    }),
  ];

  await Promise.all(operations);

  // Log the erasure for compliance proof
  logger.info({ type: 'gdpr_erasure', userId: 'ANONYMIZED', timestamp: new Date() });
}
```

**Consent management:**

```typescript
const consentSchema = z.object({
  marketing: z.boolean(),
  analytics: z.boolean(),
  thirdPartySharing: z.boolean(),
});

app.post('/api/consent', async (req, res) => {
  const consent = consentSchema.parse(req.body);

  await prisma.consent.upsert({
    where: { userId: req.user.id },
    create: { userId: req.user.id, ...consent, version: CONSENT_VERSION, grantedAt: new Date() },
    update: { ...consent, version: CONSENT_VERSION, updatedAt: new Date() },
  });

  res.json({ status: 'ok' });
});
```

---

### 4.4 PCI-DSS

PCI DSS 4.0 key requirements for web applications:

| Requirement | Description |
|-------------|-------------|
| 3.x | Protect stored cardholder data (tokenization) |
| 4.x | Encrypt transmission (TLS 1.2+) |
| 6.4.3 | Manage payment page scripts (CSP + SRI) |
| 8.x | Strong authentication (MFA for admin) |
| 10.x | Logging and monitoring |
| 11.6.1 | Detect unauthorized changes to payment pages |

**Tokenization (use Stripe to minimize PCI scope):**

```typescript
// Client-side: Stripe Elements handles card data (never touches your server)
const stripe = Stripe('pk_live_...');
const elements = stripe.elements();
const card = elements.create('card');
card.mount('#card-element');

// Server-side: only receives tokenized payment method
app.post('/api/payment', async (req, res) => {
  const { paymentMethodId, amount } = req.body;

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: 'usd',
    payment_method: paymentMethodId, // Token, not card data
    confirm: true,
  });

  res.json({ status: paymentIntent.status });
});
```

**Payment page integrity (Req 6.4.3 / 11.6.1):**

```
Content-Security-Policy: script-src 'nonce-{RANDOM}' 'strict-dynamic' https://js.stripe.com;
```

Use SRI for all payment page scripts and monitor for unauthorized DOM changes.

---

### 4.5 HIPAA

**ePHI encryption (NIST SP 800-111 compliant):**

```typescript
// See section 2.14 for AES-256-GCM implementation
// All PHI must be encrypted at rest and in transit

// HIPAA audit logging with hash chain integrity
async function logPhiAccess(event: {
  userId: string;
  patientId: string;
  action: 'view' | 'modify' | 'export';
  resource: string;
}) {
  const previousHash = await getLastAuditHash();
  const entry = {
    ...event,
    timestamp: new Date().toISOString(),
    previousHash,
  };

  const currentHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(entry))
    .digest('hex');

  await prisma.hipaaAuditLog.create({
    data: { ...entry, hash: currentHash },
  });
}
```

**Key requirements:**
- Encrypt ePHI at rest (AES-256) and in transit (TLS 1.2+)
- Implement access controls and audit logging
- Business Associate Agreements (BAAs) for all vendors handling PHI
- Risk assessment and management plan
- Breach notification within 60 days

---

### 4.6 ISO 27001

ISO 27001:2022 restructured controls into 4 categories (93 controls total):

| Category | Controls |
|----------|----------|
| Organizational | 37 |
| People | 8 |
| Physical | 14 |
| Technological | 34 |

**11 new controls in 2022 revision:**
- Threat intelligence
- ICT readiness for business continuity
- Information security for cloud services
- Physical security monitoring
- Data masking
- Configuration management
- Information deletion
- Data leakage prevention
- Monitoring activities
- Web filtering
- Secure coding

**Secure SDLC policy (CODEOWNERS):**

```
# CODEOWNERS -- require security review for sensitive files
/src/auth/**          @security-team
/src/crypto/**        @security-team
/.github/workflows/** @security-team @devops-team
/terraform/**         @security-team @devops-team
Dockerfile*           @security-team @devops-team
```

**Transition deadline:** October 31, 2025 for ISO 27001:2013 to 2022.

---

### 4.7 Security Policies

**Incident Response Plan structure:**

```yaml
incident_response:
  severity_levels:
    critical:
      description: "Active data breach, RCE in production"
      response_time: "15 minutes"
      notification: ["CISO", "CTO", "Legal"]
    high:
      description: "Vulnerability actively exploited, auth bypass"
      response_time: "1 hour"
      notification: ["Security Lead", "Engineering Lead"]
    medium:
      description: "Vulnerability with no active exploitation"
      response_time: "4 hours"
      notification: ["Security Team"]
    low:
      description: "Informational finding, best practice gap"
      response_time: "Next business day"
      notification: ["Security Team"]

  phases:
    - name: Preparation
      actions: ["Maintain runbooks", "Regular tabletop exercises", "Tool readiness"]
    - name: Detection & Analysis
      actions: ["Alert triage", "Severity classification", "Evidence preservation"]
    - name: Containment
      actions: ["Isolate affected systems", "Block attack vectors", "Preserve forensic data"]
    - name: Eradication & Recovery
      actions: ["Remove threat", "Patch vulnerability", "Restore from clean backups"]
    - name: Post-Incident
      actions: ["Blameless retrospective", "Update runbooks", "Improve detection"]

  regulatory_notification:
    gdpr: "72 hours to supervisory authority"
    hipaa: "60 days to HHS and affected individuals"
    pci: "Immediately to acquiring bank and card brands"
```

**Vulnerability Disclosure Policy:** Provide a `/.well-known/security.txt` file (RFC 9116):

```
Contact: mailto:security@example.com
Encryption: https://example.com/.well-known/pgp-key.txt
Acknowledgments: https://example.com/security/hall-of-fame
Policy: https://example.com/security/disclosure-policy
Preferred-Languages: en
Expires: 2027-01-01T00:00:00.000Z
```

---

### 4.8 Audit & Evidence

**Policy as Code with OPA:**

```rego
# SOC 2 access control compliance check
package compliance.soc2

import rego.v1

deny contains msg if {
    input.resource_type == "aws_s3_bucket"
    not input.config.server_side_encryption_configuration
    msg := sprintf("S3 bucket '%s' missing encryption (SOC2 CC6.1)", [input.resource_name])
}

deny contains msg if {
    input.resource_type == "aws_rds_cluster"
    not input.config.storage_encrypted
    msg := sprintf("RDS cluster '%s' missing encryption at rest (SOC2 CC6.1)", [input.resource_name])
}

deny contains msg if {
    input.resource_type == "aws_security_group"
    rule := input.config.ingress[_]
    rule.cidr_blocks[_] == "0.0.0.0/0"
    rule.from_port <= 22
    rule.to_port >= 22
    msg := sprintf("Security group '%s' allows SSH from internet (SOC2 CC6.6)", [input.resource_name])
}
```

**Continuous compliance monitoring in CI:**

```yaml
name: Compliance Checks
on:
  push:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1' # Weekly

jobs:
  compliance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: IaC compliance
        run: conftest test terraform/ --policy policies/compliance/

      - name: Dependency compliance
        run: |
          npm audit --json > audit.json
          node scripts/check-license-compliance.js

      - name: Security headers check
        run: |
          curl -sI https://app.example.com | grep -i "strict-transport\|content-security\|x-frame"

      - name: Access review
        run: node scripts/access-review.js

      - uses: actions/upload-artifact@v4
        with:
          name: compliance-report
          path: reports/
          retention-days: 400
```

**Tools:** OPA/Conftest, Vanta, Drata, Secureframe (automated compliance platforms), Chef InSpec, cloud-custodian.

---

## 5. Implementation Checklist

### Phase 1: Foundation (Weeks 1-4)

- [ ] Configure security headers (Helmet.js)
- [ ] Implement CSP with nonces
- [ ] Enable HSTS with preload
- [ ] Set up CORS with strict origin allowlist
- [ ] Add rate limiting on all endpoints
- [ ] Implement input validation with Zod on all API routes
- [ ] Use parameterized queries everywhere (no string concatenation)
- [ ] Set up Argon2id for password hashing
- [ ] Configure short-lived JWTs (15min access, rotate refresh)
- [ ] Add Gitleaks pre-commit hook
- [ ] Enable npm audit in CI
- [ ] Pin GitHub Actions by SHA
- [ ] Harden Dockerfiles (non-root, multi-stage, distroless)
- [ ] Set `NODE_ENV=production`

### Phase 2: Depth (Weeks 5-10)

- [ ] Deploy SAST (Semgrep + CodeQL)
- [ ] Deploy DAST (ZAP baseline scan nightly)
- [ ] Configure Dependabot with grouping strategy
- [ ] Implement structured logging with PII redaction
- [ ] Set up SBOM generation in CI
- [ ] Enable Trivy image scanning
- [ ] Implement SSRF protection on all URL-fetching endpoints
- [ ] Add file upload validation (magic bytes, type allowlist)
- [ ] Set up secrets management (Vault or AWS Secrets Manager)
- [ ] Write property-based security tests
- [ ] Configure Kubernetes security contexts
- [ ] Implement centralized error handling

### Phase 3: Compliance (Weeks 11-16)

- [ ] Conduct OWASP Top 10 gap analysis
- [ ] Create incident response plan
- [ ] Set up `security.txt`
- [ ] Implement GDPR consent management and erasure flows
- [ ] Configure audit logging with hash chain integrity
- [ ] Set up automated evidence collection for SOC 2
- [ ] Implement policy-as-code with OPA
- [ ] Deploy Cosign image signing
- [ ] Create CODEOWNERS for sensitive directories
- [ ] Establish vulnerability management SLAs
- [ ] Run tabletop incident response exercise
- [ ] Document all security policies

---

## 6. Sources

### Standards & Frameworks
- [OWASP Top 10:2025](https://owasp.org/Top10/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [NIST SP 800-57 Rev. 6 - Key Management](https://csrc.nist.gov/pubs/sp/800/57/pt1/r6/ipd)
- [NIST SP 800-52 Rev. 2 - TLS Guidelines](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-52r2.pdf)
- [SLSA Framework](https://slsa.dev/)
- [Sigstore / Cosign](https://docs.sigstore.dev/)

### Tools
- [Helmet.js](https://helmetjs.github.io/)
- [DOMPurify](https://github.com/cure53/DOMPurify)
- [Zod](https://zod.dev/)
- [Semgrep](https://semgrep.dev/)
- [CodeQL](https://codeql.github.com/)
- [Trivy](https://aquasecurity.github.io/trivy/)
- [OWASP ZAP](https://www.zaproxy.org/)
- [Gitleaks](https://github.com/gitleaks/gitleaks)
- [TruffleHog](https://github.com/trufflesecurity/trufflehog)
- [Socket.dev](https://socket.dev/)
- [OPA (Open Policy Agent)](https://www.openpolicyagent.org/)
- [Kyverno](https://kyverno.io/)
- [fast-check](https://fast-check.dev/)
- [express-rate-limit](https://www.npmjs.com/package/express-rate-limit)
- [RE2](https://www.npmjs.com/package/re2)

### Guides
- [MDN Web Security](https://developer.mozilla.org/en-US/docs/Web/Security)
- [web.dev Security](https://web.dev/explore/secure)
- [OWASP WebSocket Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)
- [OWASP SQL Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- [OWASP SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Docker Hardening Guide](https://docs.docker.com/dhi/core-concepts/hardening/)
