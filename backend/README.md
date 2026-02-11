# RonPay Backend (NestJS)

> The core API and payment processing engine for RonPay.

## Overview

This is the backend for **RonPay**, an AI-powered payment agent designed for Africa and beyond. It leverages natural language processing to handle money transfers, bill payments, and recurring schedules across multiple countries.

## Features

- **Natural Language Parsing**: Deep integration with Claude AI for intent extraction.
- **Blockchain Integration**: Secure transaction processing on the Celo network.
- **Task Scheduling**: robust handling of recurring payments using Redis-backed queues.
- **Bill Payments**: Integration with VTPASS for Nigerian utility bills.
- **SMS Notifications**: Real-time status updates via Twilio.

## Tech Stack

- **Framework**: [NestJS](https://nestjs.com/)
- **Language**: TypeScript
- **Database**: PostgreSQL (TypeORM)
- **Cache/Queue**: Redis
- **AI**: Claude Sonnet (Anthropic)
- **Blockchain**: Viem/Ethers (Celo)

## Project Structure

```
src/
├── app.module.ts       # Root module
├── main.ts             # Application entry point
├── ai/                 # AI intent parsing logic
├── blockchain/         # Celo & Mento interactions
├── bills/              # Third-party bill payment services
├── scheduler/          # Recurring payment jobs
└── users/              # User management and profiles
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL
- Redis

### Installation

```bash
$ pnpm install
```

### Environment Setup

Create a `.env` file in this directory based on the project root requirements.

### Running the App

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Testing

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## License

MIT
