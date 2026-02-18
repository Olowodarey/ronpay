import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClaudeService } from './claude.service';
import { GeminiService } from './gemini.service';
import { AiService } from './ai.service';

@Module({
  imports: [ConfigModule],
  providers: [
    ClaudeService,
    GeminiService,
    {
      provide: AiService,
      useFactory: (
        claudeService: ClaudeService,
        geminiService: GeminiService,
        configService: ConfigService,
      ) => {
        const provider = configService.get<string>('AI_PROVIDER') || 'gemini';
        Logger.log(`Using AI Provider: ${provider}`, 'AiModule');
        return provider === 'claude' ? claudeService : geminiService;
      },
      inject: [ClaudeService, GeminiService, ConfigService],
    },
  ],
  exports: [AiService, ClaudeService, GeminiService],
})
export class AiModule {}
