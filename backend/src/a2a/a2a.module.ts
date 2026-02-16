import { Module } from '@nestjs/common';
import { A2aController } from './a2a.controller';

/**
 * A2A Protocol Module
 *
 * Registers the Agent-to-Agent protocol endpoints
 * for agent discovery and task routing.
 */
@Module({
  controllers: [A2aController],
})
export class A2aModule {}
