import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AvatarService } from './avatar.service';
import { AvatarFilesController } from './avatar-files.controller';

@Module({
  imports: [AuthModule],
  controllers: [UsersController, AvatarFilesController],
  providers: [UsersService, AvatarService],
})
export class UsersModule {}
