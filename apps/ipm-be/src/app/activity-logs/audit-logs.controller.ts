import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActivityLogPage, AuditLogFilterOptions } from '@sebsa-pm-tool/shared-models';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ActivityLogsService } from './activity-logs.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

/**
 * The system-wide audit trail: every recorded action across every project,
 * unfiltered by project membership. Restricted to Super Admin at the class
 * level, so no route here can be added without that gate.
 */
@ApiTags('audit-logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly activityLogs: ActivityLogsService) {}

  @Get()
  @ApiOperation({ summary: 'Filtered, paginated view of the whole activity ledger.' })
  async findAll(@Query() query: QueryAuditLogsDto): Promise<ActivityLogPage> {
    return this.activityLogs.findAudit(query);
  }

  @Get('filters')
  @ApiOperation({
    summary: 'Actors, projects, entity types and actions available to filter on.',
  })
  async getFilterOptions(): Promise<AuditLogFilterOptions> {
    return this.activityLogs.getAuditFilterOptions();
  }
}
