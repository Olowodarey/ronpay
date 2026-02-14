import { LoggerService, Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import { logger } from './logger';

@Injectable()
export class WinstonLoggerAdapter implements LoggerService {
  private logger: Logger;

  constructor() {
    this.logger = logger;
  }

  log(message: any, ...optionalParams: any[]) {
    this.call('info', message, ...optionalParams);
  }

  error(message: any, ...optionalParams: any[]) {
    this.call('error', message, ...optionalParams);
  }

  warn(message: any, ...optionalParams: any[]) {
    this.call('warn', message, ...optionalParams);
  }

  debug(message: any, ...optionalParams: any[]) {
    this.call('debug', message, ...optionalParams);
  }

  verbose(message: any, ...optionalParams: any[]) {
    this.call('verbose', message, ...optionalParams);
  }

  fatal(message: any, ...optionalParams: any[]) {
    this.call('error', message, ...optionalParams);
  }

  private call(level: string, message: any, ...optionalParams: any[]) {
    const context = optionalParams[optionalParams.length - 1];
    const meta = optionalParams.slice(0, optionalParams.length - 1);
    
    // If the last param is a string, it's likely the context
    // NestJS conventions usually pass context as the last argument
    const contextStr = typeof context === 'string' ? context : undefined;
    
    // If context was extracted, remove it from meta
    const finalMeta = contextStr ? meta : optionalParams;

    this.logger.log({
      level,
      message: typeof message === 'string' ? message : JSON.stringify(message),
      context: contextStr,
      meta: finalMeta,
    });
  }
}
