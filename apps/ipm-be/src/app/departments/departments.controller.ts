import { Controller, Get } from '@nestjs/common';
import { Department } from '@sebsa-pm-tool/shared-models';
import { DepartmentsService } from './departments.service';

/** Public — needed so the signup form can populate a department picker
 * before the user has an account. */
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  list(): Promise<Department[]> {
    return this.departmentsService.list();
  }
}
