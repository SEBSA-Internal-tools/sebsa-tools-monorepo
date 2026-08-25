import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CaseService } from './case.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { UpdateCaseDto } from './dto/update-case.dto';
import { AuthUser } from '@sebsa-pm-tool/shared-models';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { FilterCaseDto } from './dto/filter-case.dto';
import { CaseAssigneesDto } from './dto/assign-case.dto';
import { CaseLabelsDto } from './dto/case-label.dto';

@ApiTags('cases')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cases')
export class CaseController {
  constructor(private readonly caseService: CaseService) {}

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateCaseDto) {
    return this.caseService.create(dto, user);
  }

  @Get()
  async findAll(@Query() filter: FilterCaseDto, @CurrentUser() user: AuthUser) {
    return this.caseService.findAll(filter, user);
  }

  @Get('my-assigned')
  async getMyAssignedCases(@CurrentUser() user: AuthUser) {
    return this.caseService.getMyAssignedCases(user);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.caseService.findOne(id, user);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCaseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.caseService.update(id, dto, user);
  }

  @Delete(':id')
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.caseService.delete(id, user);
  }

  // --- Assignment Endpoints ---

  @Post(':id/assignees')
  async assignUsers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CaseAssigneesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.caseService.assignUsers(id, dto.assigneeIds, user);
  }

  @Delete(':id/assignees/:userId')
  async unassignUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.caseService.unassignUser(id, userId, user);
  }

  @Get(':id/assignees')
  async getAssignees(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.caseService.getAssignees(id, user);
  }

  // --- Label Endpoints ---

  @Post(':id/labels')
  async attachLabels(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CaseLabelsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.caseService.attachLabels(id, dto.labelIds, user);
  }

  @Delete(':id/labels/:labelId')
  async detachLabel(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('labelId', ParseUUIDPipe) labelId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.caseService.detachLabel(id, labelId, user);
  }

  // --- History ---

  @Get(':id/status-history')
  async getStatusHistory(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.caseService.getStatusHistory(id, user);
  }

  @Get(':id/category-history')
  async getCategoryHistory(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.caseService.getCategoryHistory(id, user);
  }
}
