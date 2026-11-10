import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrivilegeGroupsController } from './privilege-groups.controller';
import { PrivilegeGroupsService } from './privilege-groups.service';

@Module({
  imports: [AuthModule],
  controllers: [PrivilegeGroupsController],
  providers: [PrivilegeGroupsService],
})
export class PrivilegeGroupsModule {}
