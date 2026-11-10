import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigKind, ConfigScope } from '@prisma/client';
import { ConfigOption } from '@sebsa-pm-tool/shared-models';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ConfigOptionsService } from './config-options.service';
import {
  CreateConfigOptionDto, FilterConfigOptionsDto, ReorderConfigOptionsDto, UpdateConfigOptionDto,
} from './dto/config-option.dto';

/**
 * The configurable lists behind project/case/task dropdowns and status badges.
 *
 * Reads are open to any authenticated user because the whole UI renders from
 * them; every write is Super Admin only.
 */
@ApiTags('config-options')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('config-options')
export class ConfigOptionsController {
  constructor(private readonly configOptions: ConfigOptionsService) {}

  @Get()
  @ApiOperation({ summary: 'Configurable lists for a scope, ordered as configured.' })
  async findAll(@Query() filter: FilterConfigOptionsDto): Promise<ConfigOption[]> {
    return this.configOptions.findAll(filter);
  }

  @Post()
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Add an entry to a list. Appended to the end.' })
  async create(@Body() dto: CreateConfigOptionDto): Promise<ConfigOption> {
    return this.configOptions.create(dto);
  }

  @Patch('reorder/:kind/:scope')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Replace the ordering of one list.' })
  async reorder(
    @Param('kind') kind: ConfigKind,
    @Param('scope') scope: ConfigScope,
    @Body() dto: ReorderConfigOptionsDto,
  ): Promise<ConfigOption[]> {
    return this.configOptions.reorder(kind, scope, dto);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Rename, recolour, or change the flags on an entry.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConfigOptionDto,
  ): Promise<ConfigOption> {
    return this.configOptions.update(id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Delete an admin-created entry. Built-in entries cannot be deleted.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.configOptions.remove(id);
  }
}
