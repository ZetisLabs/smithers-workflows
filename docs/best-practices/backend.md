# Backend Best Practices

> Guide complet pour le développement backend robuste, scalable et maintenable

## 📋 Table des matières

1. [Architecture & Design](#architecture--design)
2. [API Design](#api-design)
3. [Base de données](#base-de-données)
4. [Authentification & Autorisation](#authentification--autorisation)
5. [Performance & Scalabilité](#performance--scalabilité)
6. [Sécurité](#sécurité)
7. [Observabilité](#observabilité)
8. [Testing](#testing)
9. [Stack Recommandé](#stack-recommandé)
10. [Red Flags](#red-flags)

---

## Architecture & Design

### Clean Architecture / Hexagonal Architecture

**Séparation des responsabilités :**
```
src/
├── domain/          # Entités métier, règles business (pur, sans dépendances)
├── application/     # Use cases, orchestration
├── infrastructure/  # Implémentations concrètes (DB, HTTP, queue)
└── interfaces/      # Controllers, routes, DTOs
```

**Principes SOLID :**
- **S**ingle Responsibility : une classe = une raison de changer
- **O**pen/Closed : ouvert à l'extension, fermé à la modification
- **L**iskov Substitution : les sous-types doivent être substituables
- **I**nterface Segregation : interfaces spécifiques plutôt que générales
- **D**ependency Inversion : dépendre d'abstractions, pas de concret

### Dependency Injection

**Bon :**
```typescript
class UserService {
  constructor(
    private userRepo: IUserRepository,
    private emailService: IEmailService
  ) {}
}
```

**Mauvais :**
```typescript
class UserService {
  private userRepo = new UserRepository(); // Couplage fort
  private emailService = new EmailService();
}
```

### Error Handling

**Custom errors avec contexte :**
```typescript
class NotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} ${id} not found`);
    this.name = 'NotFoundError';
  }
}

class ValidationError extends Error {
  constructor(public errors: Record<string, string>) {
    super('Validation failed');
    this.name = 'ValidationError';
  }
}
```

**Global error handler :**
```typescript
app.use((err, req, res, next) => {
  if (err instanceof ValidationError) {
    return res.status(400).json({ errors: err.errors });
  }
  if (err instanceof NotFoundError) {
    return res.status(404).json({ message: err.message });
  }
  // Log l'erreur
  logger.error(err);
  res.status(500).json({ message: 'Internal server error' });
});
```

---

## API Design

### RESTful Best Practices

**Conventions de nommage :**
```
GET    /users           # Liste
GET    /users/:id       # Détail
POST   /users           # Création
PUT    /users/:id       # Remplacement complet
PATCH  /users/:id       # Modification partielle
DELETE /users/:id       # Suppression
```

**Relations :**
```
GET /users/:id/posts           # Posts d'un user
GET /users/:id/posts/:postId   # Post spécifique d'un user
```

### Versioning

**Via URL (recommandé) :**
```
/api/v1/users
/api/v2/users
```

**Via header :**
```
Accept: application/vnd.api+json;version=1
```

### Pagination

**Cursor-based (recommandé pour gros volumes) :**
```typescript
GET /users?cursor=abc123&limit=20

{
  "data": [...],
  "pagination": {
    "next_cursor": "def456",
    "has_more": true
  }
}
```

**Offset-based (simple) :**
```typescript
GET /users?page=2&limit=20

{
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 20,
    "total": 150,
    "total_pages": 8
  }
}
```

### Filtering & Sorting

```
GET /users?role=admin&status=active&sort=-created_at,name
```

### Rate Limiting

**Headers :**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1640000000
```

**Implémentation (express-rate-limit) :**
```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requêtes max
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);
```

### Input Validation

**Avec Zod :**
```typescript
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  age: z.number().min(18).optional(),
});

app.post('/users', (req, res) => {
  const result = createUserSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ errors: result.error.flatten() });
  }
  // Utiliser result.data (typé et validé)
});
```

---

## Base de données

### Migrations

**Toujours versionnées et réversibles :**
```typescript
// migrations/001_create_users.ts
export async function up(db) {
  await db.schema.createTable('users', (table) => {
    table.uuid('id').primary();
    table.string('email').unique().notNullable();
    table.timestamp('created_at').defaultTo(db.fn.now());
  });
}

export async function down(db) {
  await db.schema.dropTable('users');
}
```

### Indexes

**Sur les colonnes fréquemment filtrées/triées :**
```sql
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
```

**Index composites :**
```sql
CREATE INDEX idx_posts_user_status ON posts(user_id, status);
```

### N+1 Query Problem

**Mauvais :**
```typescript
const users = await db.select('*').from('users'); // 1 query
for (const user of users) {
  user.posts = await db.select('*').from('posts').where({ user_id: user.id }); // N queries
}
```

**Bon (eager loading) :**
```typescript
const users = await db
  .select('users.*', db.raw('json_agg(posts.*) as posts'))
  .from('users')
  .leftJoin('posts', 'users.id', 'posts.user_id')
  .groupBy('users.id');
```

### Transactions

**Pour garantir la cohérence :**
```typescript
await db.transaction(async (trx) => {
  const user = await trx('users').insert({ email }).returning('*');
  await trx('profiles').insert({ user_id: user.id, bio: '' });
  await trx('audit_log').insert({ action: 'user_created', user_id: user.id });
});
```

### Connection Pooling

```typescript
const pool = new Pool({
  max: 20,                // Max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

---

## Authentification & Autorisation

### JWT Best Practices

**Payload minimal :**
```typescript
const token = jwt.sign(
  { sub: user.id, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: '15m' }
);
```

**Refresh tokens :**
```typescript
const refreshToken = jwt.sign(
  { sub: user.id, type: 'refresh' },
  process.env.REFRESH_SECRET,
  { expiresIn: '7d' }
);

// Stocker le refresh token en DB (pour révocation)
await db('refresh_tokens').insert({
  user_id: user.id,
  token: refreshToken,
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
});
```

### Password Hashing

**Avec bcrypt :**
```typescript
import bcrypt from 'bcrypt';

// Création
const hash = await bcrypt.hash(password, 10);

// Vérification
const valid = await bcrypt.compare(password, hash);
```

**Ou argon2 (plus moderne) :**
```typescript
import argon2 from 'argon2';

const hash = await argon2.hash(password);
const valid = await argon2.verify(hash, password);
```

### RBAC (Role-Based Access Control)

```typescript
const permissions = {
  admin: ['users:read', 'users:write', 'posts:delete'],
  editor: ['posts:read', 'posts:write'],
  viewer: ['posts:read'],
};

function can(user: User, permission: string): boolean {
  return permissions[user.role]?.includes(permission) ?? false;
}

// Middleware
function requirePermission(permission: string) {
  return (req, res, next) => {
    if (!can(req.user, permission)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}

app.delete('/posts/:id', requirePermission('posts:delete'), deletePost);
```

---

## Performance & Scalabilité

### Caching

**Redis pour cache distribué :**
```typescript
import Redis from 'ioredis';

const redis = new Redis();

async function getUser(id: string) {
  const cached = await redis.get(`user:${id}`);
  if (cached) return JSON.parse(cached);

  const user = await db('users').where({ id }).first();
  await redis.setex(`user:${id}`, 3600, JSON.stringify(user)); // TTL 1h
  return user;
}
```

**Cache invalidation :**
```typescript
async function updateUser(id: string, data: Partial<User>) {
  await db('users').where({ id }).update(data);
  await redis.del(`user:${id}`); // Invalider le cache
}
```

### Background Jobs

**Avec BullMQ :**
```typescript
import { Queue, Worker } from 'bullmq';

const emailQueue = new Queue('email', { connection: redis });

// Ajouter un job
await emailQueue.add('welcome', { userId: user.id });

// Worker
const worker = new Worker('email', async (job) => {
  if (job.name === 'welcome') {
    await sendWelcomeEmail(job.data.userId);
  }
}, { connection: redis });
```

### Database Query Optimization

**EXPLAIN ANALYZE pour comprendre les plans d'exécution :**
```sql
EXPLAIN ANALYZE SELECT * FROM posts WHERE user_id = 123;
```

**Projection (ne sélectionner que les colonnes nécessaires) :**
```typescript
// Mauvais
const users = await db.select('*').from('users');

// Bon
const users = await db.select('id', 'email', 'name').from('users');
```

### Horizontal Scaling

**Stateless servers :**
- Pas de sessions en mémoire (utiliser Redis)
- Pas de fichiers locaux (utiliser S3)
- Load balancer (Nginx, HAProxy, ALB)

**Database replication :**
```
Master (write) → Replica 1 (read)
              → Replica 2 (read)
```

---

## Sécurité

### SQL Injection Prevention

**Toujours utiliser des requêtes paramétrées :**
```typescript
// ❌ DANGEREUX
const users = await db.raw(`SELECT * FROM users WHERE email = '${email}'`);

// ✅ SÛR
const users = await db('users').where({ email });
// ou
const users = await db.raw('SELECT * FROM users WHERE email = ?', [email]);
```

### CORS

```typescript
import cors from 'cors';

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
}));
```

### Security Headers

**Avec Helmet :**
```typescript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));
```

### Secrets Management

**Ne jamais committer de secrets :**
```bash
# .env (gitignored)
DATABASE_URL=postgresql://...
JWT_SECRET=...
API_KEY=...
```

**Utiliser un vault en production :**
- AWS Secrets Manager
- HashiCorp Vault
- Azure Key Vault

---

## Observabilité

### Structured Logging

**Avec Pino :**
```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty' }
    : undefined,
});

logger.info({ userId: user.id, action: 'login' }, 'User logged in');
logger.error({ err, userId: user.id }, 'Failed to update user');
```

### Metrics

**Avec Prometheus client :**
```typescript
import { Counter, Histogram, register } from 'prom-client';

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route'],
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestsTotal.inc({ method: req.method, route: req.route?.path, status: res.statusCode });
    httpRequestDuration.observe({ method: req.method, route: req.route?.path }, duration);
  });
  next();
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

### Health Checks

```typescript
app.get('/health', async (req, res) => {
  try {
    await db.raw('SELECT 1'); // Check DB
    await redis.ping();       // Check Redis
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});
```

### Distributed Tracing

**Avec OpenTelemetry :**
```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('my-service');

app.get('/users/:id', async (req, res) => {
  const span = tracer.startSpan('get_user');
  try {
    const user = await getUser(req.params.id);
    res.json(user);
  } finally {
    span.end();
  }
});
```

---

## Testing

### Unit Tests

**Avec Vitest :**
```typescript
import { describe, it, expect, vi } from 'vitest';

describe('UserService', () => {
  it('should create a user', async () => {
    const mockRepo = {
      create: vi.fn().mockResolvedValue({ id: '1', email: 'test@example.com' }),
    };
    const service = new UserService(mockRepo);

    const user = await service.createUser({ email: 'test@example.com' });

    expect(mockRepo.create).toHaveBeenCalledWith({ email: 'test@example.com' });
    expect(user.id).toBe('1');
  });
});
```

### Integration Tests

**Avec Supertest :**
```typescript
import request from 'supertest';
import { app } from './app';

describe('POST /users', () => {
  it('should create a user', async () => {
    const res = await request(app)
      .post('/users')
      .send({ email: 'test@example.com', password: 'password123' })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.email).toBe('test@example.com');
  });

  it('should reject invalid email', async () => {
    await request(app)
      .post('/users')
      .send({ email: 'invalid', password: 'password123' })
      .expect(400);
  });
});
```

### E2E Tests

**Avec Playwright (API testing) :**
```typescript
import { test, expect } from '@playwright/test';

test('user registration flow', async ({ request }) => {
  // Créer un user
  const createRes = await request.post('/api/users', {
    data: { email: 'e2e@example.com', password: 'password123' },
  });
  expect(createRes.ok()).toBeTruthy();
  const user = await createRes.json();

  // Login
  const loginRes = await request.post('/api/auth/login', {
    data: { email: 'e2e@example.com', password: 'password123' },
  });
  const { token } = await loginRes.json();

  // Accéder à une ressource protégée
  const profileRes = await request.get('/api/profile', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(profileRes.ok()).toBeTruthy();
});
```

---

## Stack Recommandé

### Runtime & Framework
- **Node.js 20+** ou **Bun** (plus rapide)
- **Express** (mature) ou **Fastify** (performant) ou **Hono** (moderne)
- **TypeScript** (type safety)

### Database
- **PostgreSQL** (relationnel, robuste)
- **Prisma** ou **Drizzle** (ORM/query builder typé)
- **Redis** (cache, sessions, queues)

### Validation
- **Zod** (schema validation avec inférence TypeScript)

### Auth
- **Passport.js** (stratégies multiples)
- **jose** (JWT moderne)

### Testing
- **Vitest** (rapide, compatible ESM)
- **Supertest** (tests HTTP)
- **Playwright** (E2E API)

### Monitoring
- **Pino** (logging structuré)
- **Prometheus** + **Grafana** (metrics)
- **Sentry** (error tracking)
- **OpenTelemetry** (tracing)

### DevOps
- **Docker** + **Docker Compose**
- **GitHub Actions** (CI/CD)
- **Kubernetes** (orchestration)

---

## Red Flags

### ❌ À éviter absolument

1. **Pas de validation d'input** → Vulnérabilités (injection, XSS)
2. **Secrets en clair dans le code** → Fuite de données
3. **Pas de rate limiting** → DDoS facile
4. **Requêtes SQL dynamiques non paramétrées** → SQL injection
5. **Pas de logging** → Impossible de débugger en production
6. **Pas de health checks** → Pas de détection de panne
7. **Pas de tests** → Régressions garanties
8. **Blocking I/O dans le main thread** → Performance dégradée
9. **Pas de gestion d'erreurs** → Crashes aléatoires
10. **Pas de migrations versionnées** → Schéma DB incohérent
11. **Connexions DB non poolées** → Épuisement des connexions
12. **Pas de CORS configuré** → Problèmes cross-origin
13. **Tokens JWT sans expiration** → Risque de sécurité
14. **Pas de pagination** → Surcharge serveur/client
15. **Pas de monitoring** → Pas de visibilité sur la prod

---

## Checklist Backend

### Architecture
- [ ] Séparation domain/application/infrastructure
- [ ] Dependency injection configurée
- [ ] Error handling centralisé

### API
- [ ] RESTful conventions respectées
- [ ] Versioning en place
- [ ] Pagination implémentée
- [ ] Rate limiting configuré
- [ ] Input validation (Zod)

### Database
- [ ] Migrations versionnées
- [ ] Indexes sur colonnes filtrées
- [ ] Connection pooling configuré
- [ ] Transactions pour opérations critiques

### Auth
- [ ] Passwords hashés (bcrypt/argon2)
- [ ] JWT avec expiration courte
- [ ] Refresh tokens stockés en DB
- [ ] RBAC implémenté

### Performance
- [ ] Caching (Redis) en place
- [ ] Background jobs pour tâches lourdes
- [ ] Query optimization (EXPLAIN ANALYZE)
- [ ] Stateless servers (horizontal scaling ready)

### Sécurité
- [ ] Requêtes paramétrées (pas de SQL injection)
- [ ] CORS configuré
- [ ] Security headers (Helmet)
- [ ] Secrets en vault (pas en code)

### Observabilité
- [ ] Structured logging (Pino)
- [ ] Metrics (Prometheus)
- [ ] Health checks (/health)
- [ ] Distributed tracing (OpenTelemetry)

### Testing
- [ ] Unit tests (>80% coverage)
- [ ] Integration tests (routes critiques)
- [ ] E2E tests (user flows)
- [ ] CI/CD configuré

---

## Ressources

- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [The Twelve-Factor App](https://12factor.net/)
- [REST API Design Best Practices](https://stackoverflow.blog/2020/03/02/best-practices-for-rest-api-design/)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [Database Indexing Explained](https://use-the-index-luke.com/)
