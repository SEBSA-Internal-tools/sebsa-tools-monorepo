import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AssignUserRoleDto } from './dto/assign-user-role.dto.js';
import { UserRolesService } from './user-roles.service.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { ReplaceUserRolesDto } from './dto/replace-user-roles.dto.js';

@ApiTags('User Roles')
@Controller('users/:userId/roles')
@Roles('ADMIN')
export class UserRoleAssignmentsController {
  constructor(private readonly userRoles: UserRolesService) {}

  @Get()
  @ApiOkResponse()
  findForUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.userRoles.findForUser(userId);
  }

  @Post()
  @ApiCreatedResponse()
  assign(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AssignUserRoleDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.userRoles.create({ userId, ...dto, grantedBy: admin.id });
  }

  @Put()
  @ApiOkResponse()
  replace(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ReplaceUserRolesDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.userRoles.replaceForUser(userId, dto.roles, admin.id);
  }

  @Delete(':roleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('roleId', ParseIntPipe) roleId: number,
  ) {
    return this.userRoles.remove(userId, roleId);
  }
}

