import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser, CreateUserResponse, UserAdminSummary, UserSummary } from '@sebsa-pm-tool/shared-models';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  search(@Query('search') search?: string): Promise<UserSummary[]> {
    return this.usersService.search(search);
  }

  @Get('pending')
  @Roles('ADMIN', 'SUPER_ADMIN')
  listPending(): Promise<UserAdminSummary[]> {
    return this.usersService.listPending();
  }

  @Get('all')
  @Roles('ADMIN', 'SUPER_ADMIN')
  listAll(): Promise<UserAdminSummary[]> {
    return this.usersService.listAll();
  }

  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN')
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: AuthUser,
  ): Promise<CreateUserResponse> {
    return this.usersService.create(dto, user);
  }

  @Patch(':id/approve')
  @Roles('ADMIN', 'SUPER_ADMIN')
  approve(@Param('id') id: string): Promise<UserAdminSummary> {
    return this.usersService.approve(id);
  }

  @Patch(':id/activate')
  @Roles('ADMIN', 'SUPER_ADMIN')
  activate(@Param('id') id: string): Promise<UserAdminSummary> {
    return this.usersService.setActive(id, true);
  }

  @Patch(':id/deactivate')
  @Roles('ADMIN', 'SUPER_ADMIN')
  deactivate(@Param('id') id: string): Promise<UserAdminSummary> {
    return this.usersService.setActive(id, false);
  }
}
