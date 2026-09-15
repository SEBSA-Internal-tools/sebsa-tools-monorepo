import { Module } from '@nestjs/common';
import { ChecklistSectionsController } from './checklist-sections.controller.js';
import { ChecklistSectionsService } from './checklist-sections.service.js';

@Module({
  controllers: [ChecklistSectionsController],
  providers: [ChecklistSectionsService],
})
export class ChecklistSectionsModule {}

