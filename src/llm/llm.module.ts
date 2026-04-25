import { Module } from '@nestjs/common';
import { OllamaService } from './ollama.service';
import { PricingModule } from '../pricing/pricing.module';
import { PolicyModule } from '../policy/policy.module';

@Module({
  imports: [PricingModule, PolicyModule],
  providers: [OllamaService],
  exports: [OllamaService],
})
export class LlmModule {}
