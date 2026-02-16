import { AGENT_CONFIG } from '../agent/agent-config';

/**
 * A2A Agent Card
 *
 * Conforms to the Google Agent-to-Agent (A2A) protocol specification.
 * Served at /.well-known/agent.json for agent discovery.
 *
 * @see https://google.github.io/A2A/
 */
export const AGENT_CARD = {
  // Agent Identity
  name: AGENT_CONFIG.name,
  description: AGENT_CONFIG.description,
  version: AGENT_CONFIG.version,

  // A2A Protocol
  url: process.env.A2A_ENDPOINT_URL || 'http://localhost:3001/a2a',
  provider: {
    organization: 'RonPay',
    url: 'https://ronpay.xyz',
  },

  // Authentication
  authentication: {
    schemes: ['bearer'],
    credentials: null, // Public discovery, auth required for execution
  },

  // Capabilities
  capabilities: {
    streaming: false,
    pushNotifications: false,
    stateTransitionHistory: false,
  },

  // Default data formats
  defaultInputModes: ['text/plain', 'application/json'],
  defaultOutputModes: ['text/plain', 'application/json'],

  // Skills — what this agent can do
  skills: AGENT_CONFIG.skills.map((skill) => ({
    id: skill.name.toLowerCase().replace(/\s+/g, '_'),
    name: skill.name,
    description: skill.description,
    tags: ['payment', 'celo', 'blockchain'],
    examples: getSkillExamples(skill.name),
  })),

  // Extended metadata (RonPay-specific)
  metadata: {
    agentId: AGENT_CONFIG.agentId,
    erc8004OnChainId: AGENT_CONFIG.erc8004OnChainId,
    wallet: AGENT_CONFIG.wallet,
    blockchain: 'Celo',
    supportedCurrencies: [...AGENT_CONFIG.supportedCurrencies],
    supportedLanguages: [...AGENT_CONFIG.supportedLanguages],
    maxTransactionAmount: AGENT_CONFIG.maxTransactionAmount,
    category: AGENT_CONFIG.category,
  },
};

/**
 * Provide example inputs for each skill
 */
function getSkillExamples(skillName: string): string[] {
  const examples: Record<string, string[]> = {
    'Send CELO': ['Send 5 CELO to 0x123...abc'],
    'Send Tokens': [
      'Send 100 USDm to 0x456...def',
      'Transfer 50,000 NGNm to 0x789...ghi',
    ],
    'Check Balance': ['What is my balance?', 'Check balance for 0xabc...'],
    'Query Rate': [
      'Compare fees for sending $200 USD to Nigeria',
      'How much do I save vs Wise?',
    ],
    'Gas Price': ['How much is gas right now?'],
    'Buy Airtime': [
      'Buy 1000 naira MTN airtime for 08012345678',
      'Recharge 500 Airtel for 08098765432',
    ],
    'Pay Bills': [
      'Pay my DSTV Premium subscription',
      'Pay electricity bill for meter 12345',
    ],
    'Schedule Payment': [
      'Send $50 to mom every month on the 5th',
      'Schedule 10,000 NGNm transfer weekly',
    ],
  };
  return examples[skillName] || [];
}
