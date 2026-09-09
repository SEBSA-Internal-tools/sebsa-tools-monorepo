import { PartialType } from '@nestjs/swagger';
import { CreateSubtaskTypeDto } from './create-subtask-type.dto';

export class UpdateSubtaskTypeDto extends PartialType(CreateSubtaskTypeDto) {}
