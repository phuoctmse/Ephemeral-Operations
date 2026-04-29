import { Module } from '@nestjs/common';
import { PolicyStoreService } from './policy-store.service';
import { PolicyRetrieverService } from './policy-retriever.service';
import { PolicyAdminController } from './policy-admin.controller';

@Module({
  controllers: [PolicyAdminController],
  providers: [PolicyStoreService, PolicyRetrieverService],
  exports: [PolicyRetrieverService],
})
export class PolicyModule {}
