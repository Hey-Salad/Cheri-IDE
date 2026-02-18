# Cloudflare Infrastructure Integration for Cheri IDE

## Overview

Connect Cheri IDE (desktop app) to HeySalad's Cloudflare infrastructure for:
- ✅ **Rate Limiting**: Prevent API abuse
- ✅ **Billing & Usage Tracking**: Monitor AI API costs per user
- ✅ **Cloud Sync**: Sync sessions across devices
- ✅ **Telemetry**: Track performance and errors

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Cheri IDE (Desktop)                     │
│         Electron App on User's Machine                   │
└──────────────────────┬──────────────────────────────────┘
                       │
                       │ HTTPS + Auth Token
                       │
         ┌─────────────▼──────────────┐
         │  Cloudflare Workers API     │
         │  api.heysalad.co/cheri/*   │
         └─────────────┬───────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │               │
┌───────▼────┐  ┌──────▼────┐  ┌──────▼────────┐
│  Rate      │  │  Billing  │  │  Cloud Sync   │
│  Limiter   │  │  Tracker  │  │  (D1 + KV)    │
└────────────┘  └───────────┘  └───────────────┘
        │              │               │
        └──────────────┼───────────────┘
                       │
         ┌─────────────▼──────────────┐
         │   AI Providers (proxied)   │
         │   - OpenAI                 │
         │   - Anthropic (Claude)     │
         │   - Azure OpenAI           │
         └────────────────────────────┘
```

---

## 1. Rate Limiting

### Backend: Cloudflare Workers

**File**: `backend/middleware/rate-limiter.ts`

```typescript
import { RateLimiterRes } from '@cloudflare/workers-types'

interface RateLimitConfig {
  requestsPerMinute: number
  requestsPerHour: number
  requestsPerDay: number
}

// Free tier: 10 req/min, 100 req/hour, 1000 req/day
// Pro tier: 60 req/min, 1000 req/hour, 10000 req/day
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  free: { requestsPerMinute: 10, requestsPerHour: 100, requestsPerDay: 1000 },
  pro: { requestsPerMinute: 60, requestsPerHour: 1000, requestsPerDay: 10000 },
  enterprise: { requestsPerMinute: 300, requestsPerHour: 10000, requestsPerDay: 100000 }
}

export async function rateLimitMiddleware(
  request: Request,
  env: Env,
  userId: string
): Promise<Response | null> {
  // Get user tier
  const user = await env.DB.prepare('SELECT tier FROM users WHERE id = ?').bind(userId).first()
  const tier = user?.tier || 'free'
  const limits = RATE_LIMITS[tier]

  // Check rate limits (minute, hour, day)
  const now = Date.now()
  const minute = Math.floor(now / 60000)
  const hour = Math.floor(now / 3600000)
  const day = Math.floor(now / 86400000)

  // KV keys
  const minuteKey = `ratelimit:${userId}:minute:${minute}`
  const hourKey = `ratelimit:${userId}:hour:${hour}`
  const dayKey = `ratelimit:${userId}:day:${day}`

  // Increment counters
  const [minuteCount, hourCount, dayCount] = await Promise.all([
    incrementCounter(env.KV, minuteKey, 60),
    incrementCounter(env.KV, hourKey, 3600),
    incrementCounter(env.KV, dayKey, 86400)
  ])

  // Check limits
  if (minuteCount > limits.requestsPerMinute) {
    return new Response(JSON.stringify({
      error: 'Rate limit exceeded',
      limit: 'minute',
      retryAfter: 60 - (now % 60000) / 1000
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(60 - (now % 60000) / 1000)
      }
    })
  }

  if (hourCount > limits.requestsPerHour) {
    return new Response(JSON.stringify({
      error: 'Rate limit exceeded',
      limit: 'hour',
      retryAfter: 3600 - (now % 3600000) / 1000
    }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  if (dayCount > limits.requestsPerDay) {
    return new Response(JSON.stringify({
      error: 'Rate limit exceeded',
      limit: 'day',
      retryAfter: 86400 - (now % 86400000) / 1000
    }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Add rate limit headers
  request.headers.set('X-RateLimit-Limit', String(limits.requestsPerMinute))
  request.headers.set('X-RateLimit-Remaining', String(limits.requestsPerMinute - minuteCount))
  request.headers.set('X-RateLimit-Reset', String(minute * 60 + 60))

  return null // No rate limit hit
}

async function incrementCounter(kv: KVNamespace, key: string, ttl: number): Promise<number> {
  const current = await kv.get(key)
  const count = current ? parseInt(current) + 1 : 1
  await kv.put(key, String(count), { expirationTtl: ttl })
  return count
}
```

### Frontend: Cheri IDE

**File**: `src/services/api-client.ts`

```typescript
export class CheriAPIClient {
  private baseURL = 'https://api.heysalad.co/cheri'
  private authToken: string

  async chat(params: ChatParams): Promise<ChatResponse> {
    try {
      const response = await fetch(`${this.baseURL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify(params)
      })

      // Handle rate limiting
      if (response.status === 429) {
        const data = await response.json()
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60')

        // Show user-friendly error
        throw new RateLimitError(data.limit, retryAfter)
      }

      return await response.json()
    } catch (error) {
      if (error instanceof RateLimitError) {
        // Show notification to user
        this.notifyRateLimit(error)
      }
      throw error
    }
  }

  private notifyRateLimit(error: RateLimitError) {
    const message = error.limit === 'minute'
      ? `Rate limit reached. Please wait ${Math.ceil(error.retryAfter)}s.`
      : `Daily limit reached. Upgrade to Pro for higher limits.`

    // Show in UI
    window.electron.showNotification({
      title: 'Rate Limit Reached',
      body: message,
      type: 'warning'
    })
  }
}
```

---

## 2. Billing & Usage Tracking

### Backend: Track AI API Costs

**File**: `backend/lib/billing-tracker.ts`

```typescript
interface UsageRecord {
  userId: string
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  timestamp: string
}

// Current API pricing (as of 2025)
const MODEL_PRICING = {
  'gpt-4': { input: 0.03, output: 0.06 }, // per 1K tokens
  'gpt-3.5-turbo': { input: 0.0015, output: 0.002 },
  'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
  'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 }
}

export class BillingTracker {
  constructor(private db: D1Database) {}

  async trackUsage(params: {
    userId: string
    model: string
    inputTokens: number
    outputTokens: number
  }): Promise<void> {
    const pricing = MODEL_PRICING[params.model] || { input: 0, output: 0 }

    const costUsd =
      (params.inputTokens / 1000) * pricing.input +
      (params.outputTokens / 1000) * pricing.output

    await this.db.prepare(`
      INSERT INTO usage_records (
        user_id, model, input_tokens, output_tokens, cost_usd, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      params.userId,
      params.model,
      params.inputTokens,
      params.outputTokens,
      costUsd,
      new Date().toISOString()
    ).run()

    // Update monthly totals
    await this.updateMonthlyTotal(params.userId, costUsd)
  }

  async getUsageSummary(userId: string, month: string): Promise<UsageSummary> {
    const result = await this.db.prepare(`
      SELECT
        COUNT(*) as request_count,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(cost_usd) as total_cost_usd,
        model
      FROM usage_records
      WHERE user_id = ? AND strftime('%Y-%m', timestamp) = ?
      GROUP BY model
    `).bind(userId, month).all()

    return {
      month,
      requests: result.results,
      totalCost: result.results.reduce((sum, r) => sum + r.total_cost_usd, 0)
    }
  }

  private async updateMonthlyTotal(userId: string, costUsd: number) {
    const month = new Date().toISOString().slice(0, 7) // YYYY-MM

    await this.db.prepare(`
      INSERT INTO monthly_usage (user_id, month, cost_usd)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, month) DO UPDATE SET
        cost_usd = cost_usd + excluded.cost_usd
    `).bind(userId, month, costUsd).run()
  }
}
```

### Frontend: Display Usage

**File**: `src/renderer/usage-panel.ts`

```typescript
export async function showUsagePanel() {
  const usage = await window.electron.getUsage()

  const html = `
    <div class="usage-panel">
      <h2>API Usage This Month</h2>

      <div class="usage-summary">
        <div class="usage-stat">
          <span class="label">Total Requests</span>
          <span class="value">${usage.totalRequests}</span>
        </div>
        <div class="usage-stat">
          <span class="label">Total Cost</span>
          <span class="value">$${usage.totalCost.toFixed(2)}</span>
        </div>
        <div class="usage-stat">
          <span class="label">Tokens Used</span>
          <span class="value">${(usage.totalTokens / 1000).toFixed(1)}K</span>
        </div>
      </div>

      <h3>By Model</h3>
      <table class="usage-table">
        <thead>
          <tr>
            <th>Model</th>
            <th>Requests</th>
            <th>Tokens</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          ${usage.byModel.map(m => `
            <tr>
              <td>${m.model}</td>
              <td>${m.requests}</td>
              <td>${(m.tokens / 1000).toFixed(1)}K</td>
              <td>$${m.cost.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${usage.tier === 'free' ? `
        <div class="upgrade-notice">
          <p>You're on the Free tier</p>
          <button onclick="window.electron.openUpgrade()">
            Upgrade to Pro for 10x more requests
          </button>
        </div>
      ` : ''}
    </div>
  `

  showModal(html)
}
```

---

## 3. Cloud Sync

### Backend: Session Sync

**File**: `backend/routes/sync.ts`

```typescript
export async function syncSession(request: Request, env: Env): Promise<Response> {
  const { userId, sessionId, data } = await request.json()

  // Store in D1 for persistence
  await env.DB.prepare(`
    INSERT OR REPLACE INTO synced_sessions (user_id, session_id, data, updated_at)
    VALUES (?, ?, ?, ?)
  `).bind(userId, sessionId, JSON.stringify(data), new Date().toISOString()).run()

  // Cache in KV for fast access
  await env.KV.put(
    `session:${userId}:${sessionId}`,
    JSON.stringify(data),
    { expirationTtl: 86400 } // 24 hours
  )

  return new Response(JSON.stringify({ synced: true }), {
    headers: { 'Content-Type': 'application/json' }
  })
}
```

### Frontend: Auto-sync

**File**: `src/agent/cloud-sync.ts`

```typescript
export class CloudSync {
  private syncInterval: NodeJS.Timeout | null = null

  startAutoSync(sessionId: string) {
    this.syncInterval = setInterval(async () => {
      try {
        const session = await chatStore.getSession(sessionId)
        await this.apiClient.syncSession(sessionId, session)
      } catch (error) {
        console.error('Sync failed:', error)
      }
    }, 60000) // Sync every minute
  }

  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
    }
  }
}
```

---

## 4. Telemetry

### Backend: Error Tracking

**File**: `backend/lib/telemetry.ts`

```typescript
export async function trackError(params: {
  userId: string
  error: string
  stack: string
  context: Record<string, any>
}, env: Env): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO error_logs (user_id, error, stack, context, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    params.userId,
    params.error,
    params.stack,
    JSON.stringify(params.context),
    new Date().toISOString()
  ).run()

  // Alert if critical
  if (params.context.level === 'critical') {
    await sendSlackAlert(params.error)
  }
}
```

---

## 5. Implementation Steps

### Phase 1: Backend Setup (Cloudflare Workers)

1. **Deploy Workers API**:
   ```bash
   cd backend
   wrangler deploy
   ```

2. **Create D1 Database**:
   ```bash
   wrangler d1 create cheri-db
   wrangler d1 execute cheri-db --file=schema.sql
   ```

3. **Setup KV Namespace**:
   ```bash
   wrangler kv:namespace create "CHERI_KV"
   ```

4. **Configure Secrets**:
   ```bash
   wrangler secret put ANTHROPIC_API_KEY
   wrangler secret put OPENAI_API_KEY
   wrangler secret put JWT_SECRET
   ```

### Phase 2: Frontend Integration

1. **Add API Client** to Cheri IDE:
   - `src/services/api-client.ts`
   - `src/services/auth.ts`
   - `src/services/cloud-sync.ts`

2. **Update Main Process** to proxy requests:
   ```typescript
   // src/main/main.ts
   ipcMain.handle('cheri:api:chat', async (event, params) => {
     return await apiClient.chat(params)
   })
   ```

3. **Add Usage UI**:
   - Settings panel for API key management
   - Usage dashboard
   - Rate limit notifications

### Phase 3: Testing

1. **Test Rate Limiting**:
   - Send 11 requests in 1 minute (free tier)
   - Verify 429 response

2. **Test Billing Tracking**:
   - Make API calls
   - Check usage dashboard
   - Verify cost calculations

3. **Test Cloud Sync**:
   - Create session on desktop
   - Check it appears in cloud
   - Verify sync across devices

---

## 6. Environment Variables

### Desktop App (.env)

```env
CHERI_API_URL=https://api.heysalad.co/cheri
CHERI_API_KEY=user_provided_key
ENABLE_CLOUD_SYNC=true
ENABLE_TELEMETRY=true
```

### Cloudflare Workers (wrangler.toml)

```toml
name = "cheri-api"
main = "src/index.ts"
compatibility_date = "2025-01-01"

[vars]
ENVIRONMENT = "production"

[[d1_databases]]
binding = "DB"
database_name = "cheri-db"
database_id = "your-db-id"

[[kv_namespaces]]
binding = "KV"
id = "your-kv-id"

[observability]
enabled = true
```

---

## 7. Cost Estimates

### Cloudflare Costs (per 1000 users)

| Service | Usage | Cost/Month |
|---------|-------|------------|
| Workers | 10M requests | $5 |
| D1 Database | 100GB reads, 10GB writes | $1 |
| KV | 10M reads, 1M writes | $1.50 |
| **Total** | | **$7.50** |

### AI API Costs (per user/month)

| Tier | Requests | Avg Tokens | Cost |
|------|----------|------------|------|
| Free | 1000 | 500K | $1.50 |
| Pro | 10000 | 5M | $15 |
| Enterprise | 100000 | 50M | $150 |

---

## Next Steps

1. [ ] Deploy Cloudflare Workers backend
2. [ ] Integrate API client in Cheri IDE
3. [ ] Add authentication flow
4. [ ] Implement rate limiting UI
5. [ ] Add usage dashboard
6. [ ] Test end-to-end flow
7. [ ] Deploy to production

**Ready to connect Cheri IDE to the cloud! ☁️🍒**
