import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SubtaskType } from '@sebsa-pm-tool/shared-models';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SubtaskTypesService } from './subtask-types.service';
import { CreateSubtaskTypeDto } from './dto/create-subtask-type.dto';
import { UpdateSubtaskTypeDto } from './dto/update-subtask-type.dto';

@ApiTags('subtask-types')
@ApiBearerAuth()
@Controller('subtask-types')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubtaskTypesController {
  constructor(private readonly subtaskTypesService: SubtaskTypesService) {}

  @Get()
  list(): Promise<SubtaskType[]> {
    return this.subtaskTypesService.list();
  }

  @Post()
  @Roles('SUPER_ADMIN')
  create(@Body() dto: CreateSubtaskTypeDto): Promise<SubtaskType> {
    return this.subtaskTypesService.create(dto);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateSubtaskTypeDto): Promise<SubtaskType> {
    return this.subtaskTypesService.update(id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN')
  remove(@Param('id') id: string): Promise<void> {
    return this.subtaskTypesService.remove(id);
  }
}
