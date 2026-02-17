import { Test, TestingModule } from '@nestjs/testing';
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn(),
  })),
}));
import { PaymentsService } from './payments.service';
import { CeloService } from '../blockchain/celo.service';
import { MentoService } from '../blockchain/mento.service';
import { IdentityService } from '../blockchain/identity.service';
import { AiService } from '../ai/ai.service';
import { TransactionsService } from '../transactions/transactions.service';
import { NellobytesService } from '../nellobytes/nellobytes.service';
import { ClaudeService } from '../ai/claude.service';
import { GeminiService } from '../ai/gemini.service';
import { RouteOptimizerService } from '../blockchain/route-optimizer.service';
import { ConversationService } from '../transactions/conversation.service';
import { BadRequestException } from '@nestjs/common';

describe('PaymentsService Integration', () => {
  let service: PaymentsService;
  let mentoService: MentoService;
  let identityService: IdentityService;
  let celoService: CeloService;
  let aiService: AiService;
  let routeOptimizerService: RouteOptimizerService;
  let nellobytesService: NellobytesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: CeloService,
          useValue: {
            isValidAddress: jest.fn((addr) => addr.startsWith('0x')),
            buildPaymentTransaction: jest.fn().mockResolvedValue({ to: 'mocked', value: '100', data: '0x' }),
            waitForTransaction: jest.fn().mockResolvedValue({ status: 'success' }),
            verifyERC20Transfer: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: MentoService,
          useValue: {
            getSwapQuote: jest.fn().mockResolvedValue({ amountOut: '0.66', price: 1/1500 }),
          },
        },
        {
          provide: IdentityService,
          useValue: {
            resolvePhoneNumber: jest.fn((phone) => Promise.resolve(phone === '+2348012345678' ? '0x742d35Cc6634C0532925a3b844Bc454e4438f44e' : null)),
          },
        },
        {
          provide: AiService,
          useValue: {
            parsePaymentIntent: jest.fn(),
          },
        },
        {
          provide: TransactionsService,
          useValue: {
            create: jest.fn().mockResolvedValue({ id: 'tx-1', txHash: '0x123' }),
            updateStatus: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: NellobytesService,
          useValue: {
            buyAirtime: jest.fn().mockResolvedValue({ status: 'ORDER_RECEIVED' }),
          },
        },
        {
          provide: ClaudeService,
          useValue: {
            parsePaymentIntent: jest.fn(),
          },
        },
        {
          provide: GeminiService,
          useValue: {
            parsePaymentIntent: jest.fn(),
          },
        },
        {
          provide: RouteOptimizerService,
          useValue: {
            findBestRoute: jest.fn().mockResolvedValue({
              bestRoute: {
                amountOut: '0.66',
                price: 1 / 1500,
                source: 'mock-route',
                path: ['NGNm', 'USDm'],
              },
            }),
          },
        },
        {
          provide: ConversationService,
          useValue: {
            getOrCreateSession: jest.fn().mockResolvedValue('session-123'),
            addMessage: jest.fn().mockResolvedValue(true),
            getSessionHistory: jest.fn().mockResolvedValue([]),
            formatContextForAI: jest.fn().mockReturnValue(''),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    mentoService = module.get<MentoService>(MentoService);
    identityService = module.get<IdentityService>(IdentityService);
    celoService = module.get<CeloService>(CeloService);
    aiService = module.get<AiService>(AiService);
    routeOptimizerService = module.get<RouteOptimizerService>(RouteOptimizerService);
    nellobytesService = module.get<NellobytesService>(NellobytesService);
    process.env.RONPAY_TREASURY_ADDRESS = '0xTreasury';
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('parsePaymentIntent', () => {
    it('should resolve phone number and build transaction', async () => {
      jest.spyOn(aiService, 'parsePaymentIntent').mockResolvedValue({
            action: 'send_payment',
            recipient: '+2348012345678',
            amount: 10,
            currency: 'cUSD',
            confidence: 0.9,
        } as any);

        const result = await service.parsePaymentIntent({ message: 'Send 10 cUSD to +2348012345678', senderAddress: '0xUser' });
        
        expect(identityService.resolvePhoneNumber).toHaveBeenCalledWith('+2348012345678');
        expect(celoService.buildPaymentTransaction).toHaveBeenCalled();
        expect(result.parsedCommand.recipient).toBe('0x742d35Cc6634C0532925a3b844Bc454e4438f44e');
    });

    it('should calculate Airtime cost using Mento rate', async () => {
        // Mock 1000 NGN -> 0.66 cUSD (rate 1500)
      jest.spyOn(aiService, 'parsePaymentIntent').mockResolvedValue({
            action: 'buy_airtime',
            recipient: '08012345678',
            amount: 1000,
            currency: 'NGN',
            biller: 'MTN',
            confidence: 0.9,
        } as any);

      const result = await service.parsePaymentIntent({ message: 'Buy 1000 Naira MTN airtime', senderAddress: '0xUser' });

      expect(routeOptimizerService.findBestRoute).toHaveBeenCalledWith('NGNm', 'USDm', '1000');
      expect((result as any).parsedCommand.amount).toBe(0.66); // From mocked Route quote
      // Provider is now NELLOBYTES for buy_airtime
      expect((result as any).meta.provider).toBe('NELLOBYTES');
      // Biller is preserved
      expect((result as any).meta.biller).toBe('MTN');
    });
  });

  describe('recordTransaction', () => {
    it('should trigger Nellobytes purchase on successful treasury deposit', async () => {
          process.env.RONPAY_TREASURY_ADDRESS = '0xTreasury';
          const validTx = {
            txHash: '0x' + '1'.repeat(64),
            fromAddress: '0xUser',
            toAddress: '0xTreasury', // Matches env
            amount: '0.66',
            currency: 'cUSD',
            metadata: {
              provider: 'NELLOBYTES',
              recipient: '08012345678',
              biller: 'MTN',
              originalAmountNgn: 1000,
              variation_code: null,
            },
          };

          await service.recordTransaction(validTx as any);

      // Wait for promises to resolve (recordTransaction does background work)
      // We can't easily wait for the background promise in this setup without changing the service method
      // But we can check if it was called if we mock properly.
      // In this test setup, recordTransaction waits for waitForTransaction which is mocked to resolve immediately.
      // So next tick should have called nellobytesService.buyAirtime

      // Allow internal promises to settle
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(nellobytesService.buyAirtime).toHaveBeenCalled();
      });
  });
});
