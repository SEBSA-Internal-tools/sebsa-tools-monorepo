import { Module } from '@nestjs/common';
import { PrismaModule } from '@sebsa-pm-tool/core';
import { AuthModule } from '../auth/auth.module';
import { AttachmentsService } from './attachments.service';
import { AttachmentsController } from './attachments.controller';
import { SharePointService } from './sharepoint.service';
import { LocalStorageService } from './local-storage.service';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [AttachmentsService, SharePointService, LocalStorageService],
  controllers: [AttachmentsController],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
