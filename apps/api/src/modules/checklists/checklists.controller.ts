import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ChecklistsService } from './checklists.service.js';
import { ChecklistQueryDto } from './dto/checklist-query.dto.js';

@ApiTags('Developer Checklist')
@Controller(['developer-checklist', 'developer-checklists'])
export class ChecklistsController {
  constructor(private readonly checklists: ChecklistsService) {}
  @Get() @ApiOkResponse() find(@Query() query: ChecklistQueryDto) {
    return this.checklists.findForTaskTypes(query.taskTypeIds);
  }

  @Get('questions')
  @ApiOkResponse()
  findQuestions(@Query() query: ChecklistQueryDto) {
    return this.checklists.findForTaskTypes(query.taskTypeIds);
  }
}

@ApiTags('Developer Checklist')
@Controller('checklist-template')
export class ChecklistTemplateController {
  constructor(private readonly checklists: ChecklistsService) {}

  @Get()
  @ApiOkResponse()
  findTemplate(@Query('scope') scope?: string) {
    return this.checklists.findTemplate(scope === 'all');
  }
}
