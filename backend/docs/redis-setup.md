# Redis Setup for Production

## Option 1: Upstash (Recommended — Free Tier)

1. Go to [upstash.com](https://upstash.com)
2. Create account → New Database
3. Choose region closest to your backend
4. Copy connection details:

```bash
# Add to .env
REDIS_HOST=your-db.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=your-password
REDIS_TLS=true  # Upstash uses TLS
```

4. Update `app.module.ts`:

```typescript
BullModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    redis: {
      host: configService.get('REDIS_HOST', 'localhost'),
      port: configService.get('REDIS_PORT', 6379),
      password: configService.get('REDIS_PASSWORD'),
      tls: configService.get('REDIS_TLS') === 'true' ? {} : undefined,
    },
  }),
  inject: [ConfigService],
}),
```

**Pricing**: Free tier includes 10K commands/day

---

## Option 2: Railway

1. Go to [railway.app](https://railway.app)
2. New Project → Add Redis
3. Copy `REDIS_URL`:

```bash
# Add to .env
REDIS_URL=redis://default:password@redis.railway.internal:6379
```

4. Update `app.module.ts`:

```typescript
BullModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => {
    const redisUrl = configService.get('REDIS_URL');
    if (redisUrl) {
      return { redis: redisUrl };
    }
    return {
      redis: {
        host: configService.get('REDIS_HOST', 'localhost'),
        port: configService.get('REDIS_PORT', 6379),
      },
    };
  },
  inject: [ConfigService],
}),
```

**Pricing**: $5/month

---

## Option 3: Redis Cloud

1. Go to [redis.com/cloud](https://redis.com/try-free/)
2. Create free database (30MB)
3. Get connection details

**Pricing**: Free tier available

---

## Quick Test (Local)

For development, keep using localhost:

```bash
# Install Redis locally
brew install redis  # macOS
# or
sudo apt-get install redis-server  # Linux

# Start Redis
redis-server

# Test connection
redis-cli ping
# Should return: PONG
```
