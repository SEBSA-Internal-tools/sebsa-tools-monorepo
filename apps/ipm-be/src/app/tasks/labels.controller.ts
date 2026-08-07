import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '@sebsa-pm-tool/shared-models';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';
import { LabelsService } from './labels.service';

@ApiTags('labels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('labels')
export class LabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  @Post()
  async create(@Body() dto: CreateLabelDto, @CurrentUser() user: AuthUser) {
    return this.labelsService.create(dto, user);
  }

  @Get()
  async findAllByProject(
    @Query('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.labelsService.findAllByProject(projectId, user);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.labelsService.findOne(id, user);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLabelDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.labelsService.update(id, dto, user);
  }

  @Delete(':id')
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.labelsService.delete(id, user);
  }
}
