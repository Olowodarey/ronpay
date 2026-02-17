import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

// Nellobytes Mobile Network Codes
export const NELLOBYTES_NETWORKS: Record<string, string> = {
  MTN: '01',
  GLO: '02',
  AIRTEL: '04',
  '9MOBILE': '03',
} as const;

export const NIGERIAN_NETWORK_PREFIXES = {
  MTN: ['0803', '0806', '0703', '0903', '0906', '0810', '0813', '0814', '0816', '0706', '07025', '07026', '0704'],
  GLO: ['0805', '0807', '0705', '0815', '0811', '0905'],
  AIRTEL: ['0802', '0808', '0708', '0812', '0701', '0902', '0907', '0901', '0904', '0912'],
  '9MOBILE': ['0809', '0818', '0817', '0909', '0908'],
};

@Injectable()
export class NellobytesService {
  private readonly logger = new Logger(NellobytesService.name);
  private userId: string;
  private apiKey: string;
  private baseUrl = 'https://www.nellobytesystems.com';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.userId = this.configService.get<string>('NELLOBYTES_USER_ID') || '';
    this.apiKey = this.configService.get<string>('NELLOBYTES_API_KEY') || '';

    if (!this.userId || !this.apiKey) {
      this.logger.warn('Nellobytes credentials not fully configured');
    }
  }

  /**
   * Buy Airtime
   * Endpoint: /APIAirtimeV1.asp
   */
  async buyAirtime(data: {
    mobile_network: string;
    amount: number;
    mobile_number: string;
    request_id?: string;
    callback_url?: string;
  }) {
    // Validate amount
    if (data.amount < 50 || data.amount > 200000) {
      throw new BadRequestException('Amount must be between 50 and 200,000');
    }

    let networkCode: string;

    try {
      networkCode = this.getNetworkCode(data.mobile_network);
    } catch {
      // Try to detect network from phone number
      const detectedNetwork = this.detectNetwork(data.mobile_number);
      
      if (detectedNetwork) {
        networkCode = NELLOBYTES_NETWORKS[detectedNetwork];
        this.logger.log(`Auto-detected network ${detectedNetwork} (${networkCode}) for ${data.mobile_number}`);
      } else {
        throw new BadRequestException(`Unable to determine mobile network for ${data.mobile_number}. Please specify explicitly.`);
      }
    }
    const callbackUrl =
      data.callback_url ||
      this.configService.get<string>('NELLOBYTES_CALLBACK_URL') ||
      '';

    const params = new URLSearchParams({
      UserID: this.userId,
      APIKey: this.apiKey,
      MobileNetwork: networkCode,
      Amount: data.amount.toString(),
      MobileNumber: data.mobile_number,
      RequestID: data.request_id || this.generateRequestId(),
      CallBackURL: callbackUrl,
    });

    console.log('params', params.toString());

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/APIAirtimeV1.asp?${params.toString()}`),
      );
      
      this.logger.log(`Nellobytes Airtime Response: ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Query Transaction
   * Endpoint: /APIQueryV1.asp
   */
  async queryTransaction(identifier: { orderId?: string; requestId?: string }) {
    if (!identifier.orderId && !identifier.requestId) {
      throw new BadRequestException('Either OrderID or RequestID is required');
    }

    const params = new URLSearchParams({
      UserID: this.userId,
      APIKey: this.apiKey,
    });

    if (identifier.orderId) {
      params.append('OrderID', identifier.orderId);
    } else if (identifier.requestId) {
      params.append('RequestID', identifier.requestId);
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/APIQueryV1.asp?${params.toString()}`),
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Cancel Transaction
   * Endpoint: /APICancelV1.asp
   */
  async cancelTransaction(orderId: string) {
    const params = new URLSearchParams({
      UserID: this.userId,
      APIKey: this.apiKey,
      OrderID: orderId,
    });

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/APICancelV1.asp?${params.toString()}`),
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Helper: Get Network Code from Name/ID
   */
  private getNetworkCode(network: string): string {
    const normalized = network.toUpperCase().trim();
    
    // Check if it's already a code
    if (Object.values(NELLOBYTES_NETWORKS).includes(network)) {
      return network;
    }

    const code = NELLOBYTES_NETWORKS[normalized];
    if (!code) {
      // Try fuzzy matching or return error
      // Common variations map
      if (normalized.includes('MTN')) return NELLOBYTES_NETWORKS.MTN;
      if (normalized.includes('GLO')) return NELLOBYTES_NETWORKS.GLO;
      if (normalized.includes('AIRTEL')) return NELLOBYTES_NETWORKS.AIRTEL;
      if (normalized.includes('9MOBILE') || normalized.includes('ETISALAT')) return NELLOBYTES_NETWORKS['9MOBILE'];

      throw new BadRequestException(
        `Unsupported network: ${network}. Supported: ${Object.keys(NELLOBYTES_NETWORKS).join(', ')}`,
      );
    }
    return code;
  }

  /**
   * Helper: Detect Network from Phone Number prefix
   */
  detectNetwork(phoneNumber: string): string | null {
    // Normalize: Remove +234 or 234 prefix, leaving 11 digits starting with 0
    let normalized = phoneNumber.replace(/\D/g, '');
    if (normalized.startsWith('234')) {
      normalized = '0' + normalized.substring(3);
    }
    
    // Check first 4 digits
    const prefix = normalized.substring(0, 4);
    
    // Check first 5 digits (for some MTN prefixes like 07025)
    const prefix5 = normalized.substring(0, 5);

    for (const [network, prefixes] of Object.entries(NIGERIAN_NETWORK_PREFIXES)) {
      if (prefixes.includes(prefix) || prefixes.includes(prefix5)) {
        return network; // Returns "MTN", "GLO", etc.
      }
    }
    
    return null;
  }

  /**
   * Helper: Generate Unique Request ID
   */
  private generateRequestId(): string {
    return `NB-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  private handleError(error: any) {
    this.logger.error(error.response?.data || error.message);
    throw new InternalServerErrorException(
      error.response?.data?.message || 'Nellobytes API Error',
    );
  }
}
