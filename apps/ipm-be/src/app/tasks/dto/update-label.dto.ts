import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateLabelDto } from './create-label.dto';

export class UpdateLabelDto extends PartialType(
  OmitType(CreateLabelDto, ['projectId'] as const),
) {}
