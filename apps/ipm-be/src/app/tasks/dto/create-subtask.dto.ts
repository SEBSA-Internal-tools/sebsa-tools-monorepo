import { OmitType } from '@nestjs/swagger';
import { CreateTaskDto } from './create-task.dto';

/** projectId/parentTaskId are derived from the parent task server-side
 * (see TaskService.createSubtask), so the request body must not require
 * them — reusing CreateTaskDto directly would 400 on every call. */
export class CreateSubtaskDto extends OmitType(CreateTaskDto, [
  'projectId',
  'parentTaskId',
] as const) {}
