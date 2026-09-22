import { Global, Module } from '@nestjs/common';
import { ProjectAccessService } from './project-access.service';

/** Global so every domain module gets the same permission logic without each
 * one importing it. */
@Global()
@Module({
  providers: [ProjectAccessService],
  exports: [ProjectAccessService],
})
export class CommonModule {}
