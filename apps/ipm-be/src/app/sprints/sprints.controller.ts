import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, Sprint, SprintSummary } from '@sebsa-pm-tool/shared-models';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SprintsService } from './sprints.service';
import { CreateSprintDto } from './dto/create-sprint.dto';
import { UpdateSprintDto } from './dto/update-sprint.dto';

@ApiTags('sprints')
@ApiBearerAuth()
@Controller('projects/:projectId/sprints')
@UseGuards(JwtAuthGuard)
export class SprintsController {
  constructor(private readonly sprintsService: SprintsService) {}

  @Post()
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateSprintDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Sprint> {
    return this.sprintsService.create(projectId, dto, user);
  }

  @Get()
  findAll(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<SprintSummary[]> {
    return this.sprintsService.findByProject(projectId, user);
  }

  @Get(':id')
  findOne(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<Sprint> {
    return this.sprintsService.findOne(id, projectId, user);
  }

  @Patch(':id')
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSprintDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Sprint> {
    return this.sprintsService.update(id, projectId, dto, user);
  }

  @Delete(':id')
  remove(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.sprintsService.remove(id, projectId, user);
  }
}
