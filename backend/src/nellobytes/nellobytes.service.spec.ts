import { Test, TestingModule } from '@nestjs/testing';
import { NellobytesService } from './nellobytes.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';

describe('NellobytesService', () => {
  let service: NellobytesService;
  let httpService: HttpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NellobytesService,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              if (key === 'NELLOBYTES_USER_ID') return 'test-user';
              if (key === 'NELLOBYTES_API_KEY') return 'test-key';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<NellobytesService>(NellobytesService);
    httpService = module.get<HttpService>(HttpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('buyAirtime', () => {
    it('should call the correct endpoint with correct parameters', async () => {
      const mockResponse = {
        data: {
          status: 'ORDER_RECEIVED',
        },
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(mockResponse as any));

      await service.buyAirtime({
        mobile_network: 'MTN',
        amount: 100,
        mobile_number: '08012345678',
        request_id: 'req-123',
      });

      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining('APIAirtimeV1.asp'),
      );
      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining('MobileNetwork=01'),
      );
      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining('Amount=100'),
      );
    });

    it('should throw error for invalid amount', async () => {
      await expect(
        service.buyAirtime({
          mobile_network: 'MTN',
          amount: 10, // Too low
          mobile_number: '08012345678',
        }),
      ).rejects.toThrow('Amount must be between 50 and 200,000');
    });
  });
});
