import { PartialType } from '@nestjs/swagger';
import { CreateComplexityLevelDto } from './create-complexity-level.dto';

export class UpdateComplexityLevelDto extends PartialType(CreateComplexityLevelDto) {}
