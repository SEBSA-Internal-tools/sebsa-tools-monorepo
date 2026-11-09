import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConfigOptionsService } from './config-options.service';
import { ConfigOptionsController } from './config-options.controller';

@Module({
  imports: [AuthModule],
  controllers: [ConfigOptionsController],
  providers: [ConfigOptionsService],
  exports: [ConfigOptionsService],
})
export class ConfigOptionsModule {}
