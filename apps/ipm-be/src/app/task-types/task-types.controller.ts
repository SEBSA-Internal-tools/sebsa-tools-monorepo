import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TaskComplexityLevel, TaskType } from '@sebsa-pm-tool/shared-models';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TaskTypesService } from './task-types.service';
import { CreateTaskTypeDto } from './dto/create-task-type.dto';
import { UpdateTaskTypeDto } from './dto/update-task-type.dto';
import { CreateComplexityLevelDto } from './dto/create-complexity-level.dto';
import { UpdateComplexityLevelDto } from './dto/update-complexity-level.dto';

@ApiTags('task-types')
@ApiBearerAuth()
@Controller('task-types')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TaskTypesController {
  constructor(private readonly taskTypesService: TaskTypesService) {}

  @Get()
  list(): Promise<TaskType[]> {
    return this.taskTypesService.list();
  }

  @Post()
  @Roles('SUPER_ADMIN')
  create(@Body() dto: CreateTaskTypeDto): Promise<TaskType> {
    return this.taskTypesService.create(dto);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateTaskTypeDto): Promise<TaskType> {
    return this.taskTypesService.update(id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN')
  remove(@Param('id') id: string): Promise<void> {
    return this.taskTypesService.remove(id);
  }

  @Post(':id/complexity-levels')
  @Roles('SUPER_ADMIN')
  createComplexityLevel(
    @Param('id') id: string,
    @Body() dto: CreateComplexityLevelDto,
  ): Promise<TaskComplexityLevel> {
    return this.taskTypesService.createComplexityLevel(id, dto);
  }

  @Patch(':id/complexity-levels/:levelId')
  @Roles('SUPER_ADMIN')
  updateComplexityLevel(
    @Param('id') id: string,
    @Param('levelId') levelId: string,
    @Body() dto: UpdateComplexityLevelDto,
  ): Promise<TaskComplexityLevel> {
    return this.taskTypesService.updateComplexityLevel(id, levelId, dto);
  }

  @Delete(':id/complexity-levels/:levelId')
  @Roles('SUPER_ADMIN')
  removeComplexityLevel(@Param('id') id: string, @Param('levelId') levelId: string): Promise<void> {
    return this.taskTypesService.removeComplexityLevel(id, levelId);
  }
}
