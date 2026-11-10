import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CreateUserResponse, UserAdminSummary, UserProfileDto, UserSummary } from '@sebsa-pm-tool/shared-models';
import type { Multer } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateUserDepartmentDto } from './dto/update-user-department.dto';
import { UsersService } from './users.service';
import { AvatarService } from './avatar.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly avatarService: AvatarService,
  ) {}

  @Get('profile')
  getProfile(@CurrentUser() user: AuthUser): Promise<UserProfileDto> {
    return this.usersService.getProfile(user.id);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfileDto> {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Post('profile/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a profile picture, stored on local disk' })
  uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Multer.File,
  ): Promise<UserProfileDto> {
    return this.avatarService.uploadAvatar(user.id, file);
  }

  @Delete('profile/avatar')
  @ApiOperation({ summary: 'Remove the current profile picture' })
  removeAvatar(@CurrentUser() user: AuthUser): Promise<UserProfileDto> {
    return this.avatarService.removeAvatar(user.id);
  }

  @Post('change-password')
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ success: boolean; message: string }> {
    return this.usersService.changePassword(user.id, dto);
  }

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

  @Patch(':id/department')
  @Roles('ADMIN', 'SUPER_ADMIN')
  updateDepartment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDepartmentDto,
  ): Promise<UserAdminSummary> {
    return this.usersService.updateDepartment(id, dto.departmentId);
  }
}
