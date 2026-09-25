import { PartialType } from '@nestjs/swagger';
import { CreateChecklistQuestionDto } from './create-checklist-question.dto.js';

export class UpdateChecklistQuestionDto extends PartialType(
  CreateChecklistQuestionDto,
) {}

