FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (better caching)
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build

# Production image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy built assets and prod dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/API.md ./API.md

EXPOSE 3001

CMD ["node", "dist/main"]
