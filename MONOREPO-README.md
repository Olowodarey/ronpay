# RonPay Monorepo

This monorepo contains all RonPay components: backend, frontend, docs, and metadata.

## Structure

```
ronpay/
├── backend/           # NestJS backend API
├── frontend/          # Next.js frontend (coming soon)
├── docs/             # Documentation
├── metadata/         # ERC-8004 agent metadata
├── public/           # Shared assets
└── package.json      # Monorepo root with workspaces
```

## Quick Start

### Install Dependencies

```bash
pnpm install
```

### Development

```bash
# Run both backend and frontend
pnpm dev

# Run backend only
pnpm --filter backend dev

# Run frontend only
pnpm --filter frontend dev
```

### Build

```bash
# Build all packages
pnpm build
```

### Test

```bash
# Run all tests
pnpm test
```

## Workspaces

This monorepo uses **pnpm workspaces** for managing multiple packages:

- **backend**: NestJS API server
- **frontend**: Next.js web app (to be added)

All changes to backend or frontend are tracked in this repository.

## Git Workflow

```bash
# Commit changes from any workspace
git add .
git commit -m "feat: your changes"
git push origin main
```

## Contributing

See individual package READMEs for specific development instructions:
- [Backend README](./backend/README.md)
- Frontend README (coming soon)

## Learn More

- [ERC-8004 Deployment Guide](./docs/ERC-8004-DEPLOYMENT.md)
- [Quick Start Guide](./docs/QUICK-START-8004.md)
