import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SubtaskTypesController } from './subtask-types.controller';
import { SubtaskTypesService } from './subtask-types.service';

@Module({
  imports: [AuthModule],
  controllers: [SubtaskTypesController],
  providers: [SubtaskTypesService],
  exports: [SubtaskTypesService],
})
export class SubtaskTypesModule {}
