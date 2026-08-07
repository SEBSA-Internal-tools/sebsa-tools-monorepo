import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateLabelDto } from './create-label.dto';

export class UpdateLabelDto extends PartialType(
  OmitType(CreateLabelDto, ['projectId'] as const),
) {}
