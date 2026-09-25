import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TaskTypesService } from './task-types.service.js';
import { CreateTaskTypeDto } from './dto/create-task-type.dto.js';
import { UpdateTaskTypeDto } from './dto/update-task-type.dto.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@ApiTags('Task Types')
@Controller('task-types')
export class TaskTypesController {
  constructor(private readonly taskTypes: TaskTypesService) {}
  @Get() @ApiOkResponse() findAll() {
    return this.taskTypes.findAll();
  }

  @Get(':id')
  @ApiOkResponse()
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.taskTypes.findOne(id);
  }

  @Post()
  @Roles('ADMIN')
  @ApiCreatedResponse()
  create(@Body() dto: CreateTaskTypeDto) {
    return this.taskTypes.create(dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOkResponse()
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTaskTypeDto,
  ) {
    return this.taskTypes.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.taskTypes.remove(id);
  }
}

