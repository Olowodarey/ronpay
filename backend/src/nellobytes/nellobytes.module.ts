import { Module } from '@nestjs/common';
import { NellobytesService } from './nellobytes.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [NellobytesService],
  exports: [NellobytesService],
})
export class NellobytesModule {}
