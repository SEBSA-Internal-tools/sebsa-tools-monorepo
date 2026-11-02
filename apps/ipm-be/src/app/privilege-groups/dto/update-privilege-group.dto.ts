import { PartialType } from '@nestjs/mapped-types';
import { ApiExtraModels } from '@nestjs/swagger';
import { CreatePrivilegeGroupDto } from './create-privilege-group.dto';

/** Every field optional — derived from the create DTO so a new flag only has to
 * be declared once. */
@ApiExtraModels()
export class UpdatePrivilegeGroupDto extends PartialType(CreatePrivilegeGroupDto) {}
