# Backend Setup Roadmap

Complete guide for implementing RonPay backend for the Celo hackathon.

## Timeline: 4 Days (Feb 11-14)

### Day 1 - Foundation
- Environment setup (.env, database)
- Celo integration (viem)
- Basic payment endpoint

### Day 2 - AI Integration
- Claude AI service
- Intent parsing
- Natural language → payment logic

### Day 3 - Enhancement
- Transaction history
- Balance checking
- Multi-token support (cUSD, cKES)
- Testing

### Day 4 - Deployment
- Bug fixes
- Deploy to Railway/Render
- API documentation
- Demo prep

## Tech Stack

- **NestJS** - Backend framework
- **Viem** - Celo blockchain
- **Claude AI** - Intent parsing
- **PostgreSQL** - Database
- **TypeORM** - ORM

## Quick Start

```bash
# Install dependencies
cd backend/
pnpm add @anthropic-ai/sdk viem @celo/contractkit typeorm pg

# Setup database
createdb ronpay

# Configure .env
cp .env.example .env
# Add: DATABASE_URL, CELO_RPC_URL, ANTHROPIC_API_KEY

# Run migrations
pnpm run typeorm migration:generate -n InitialSchema
pnpm run typeorm migration:run

# Start dev server
pnpm run start:dev
```

## Core Modules

1. **Blockchain Module** - Celo payments (viem)
2. **AI Module** - Claude intent parsing
3. **Payments Module** - REST API endpoints
4. **Transactions Module** - History & tracking
5. **Users Module** - Wallet management

## MVP Features

✅ Natural language payments  
✅ Celo cUSD/CELO transactions  
✅ Transaction history  
✅ Balance checking  
✅ Multi-stablecoin support  

❌ Skip for MVP: Scheduling, VTPASS, SMS

## Resources

- Full guide: See artifact `implementation_plan.md`
- Viem: https://viem.sh
- Celo: https://docs.celo.org
- Claude: https://docs.anthropic.com
