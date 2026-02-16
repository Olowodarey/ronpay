import { Controller, Get } from '@nestjs/common';
import { AGENT_CARD } from './agent-card';

/**
 * A2A Protocol Controller
 *
 * Implements Google's Agent-to-Agent protocol endpoints.
 * Serves agent card at /.well-known/agent.json for discovery.
 */
@Controller()
export class A2aController {
  /**
   * Agent Card Discovery Endpoint
   *
   * Per A2A spec, every agent must serve its card at:
   * GET /.well-known/agent.json
   *
   * AI agents and platforms use this to discover capabilities,
   * skills, authentication requirements, and endpoint URLs.
   */
  @Get('.well-known/agent.json')
  getAgentCard() {
    return AGENT_CARD;
  }
}
