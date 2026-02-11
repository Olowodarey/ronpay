import { IsString, IsNotEmpty, IsOptional, IsEthereumAddress } from 'class-validator';

export class NaturalLanguagePaymentDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsEthereumAddress()
  @IsNotEmpty()
  senderAddress: string;

  @IsOptional()
  @IsString()
  userWalletSignature?: string; // For wallet verification
}
