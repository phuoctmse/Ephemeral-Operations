import { Module } from '@nestjs/common';
import { OllamaService } from './ollama.service';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [PricingModule],
  providers: [OllamaService],
  exports: [OllamaService],
})
export class LlmModule {}
