import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { PrivilegeGroup } from '@sebsa-pm-tool/shared-models';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreatePrivilegeGroupDto } from './dto/create-privilege-group.dto';
import { UpdatePrivilegeGroupDto } from './dto/update-privilege-group.dto';
import { PrivilegeGroupsService } from './privilege-groups.service';

@Controller('privilege-groups')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PrivilegeGroupsController {
  constructor(private readonly privilegeGroupsService: PrivilegeGroupsService) {}

  @Get()
  list(): Promise<PrivilegeGroup[]> {
    return this.privilegeGroupsService.list();
  }

  @Post()
  @Roles('SUPER_ADMIN')
  create(@Body() dto: CreatePrivilegeGroupDto): Promise<PrivilegeGroup> {
    return this.privilegeGroupsService.create(dto);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePrivilegeGroupDto,
  ): Promise<PrivilegeGroup> {
    return this.privilegeGroupsService.update(id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN')
  remove(@Param('id') id: string): Promise<void> {
    return this.privilegeGroupsService.remove(id);
  }
}
