import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserSummary } from '@sebsa-pm-tool/shared-models';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  search(@Query('search') search?: string): Promise<UserSummary[]> {
    return this.usersService.search(search);
  }
}
