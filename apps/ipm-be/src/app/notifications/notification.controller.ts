import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { FilterNotificationDto } from './dto/filter-notification.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '@sebsa-pm-tool/shared-models';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async getUserNotifications(
    @CurrentUser() user: AuthUser,
    @Query() filter: FilterNotificationDto,
  ) {
    return this.notificationService.getUserNotifications(user.id, filter);
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: AuthUser) {
    return this.notificationService.getUnreadCount(user.id);
  }

  @Patch('read-all')
  async markAllAsRead(@CurrentUser() user: AuthUser) {
    return this.notificationService.markAllAsRead(user.id);
  }

  @Patch(':id/read')
  async markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notificationService.markAsRead(user.id, id);
  }

  @Delete(':id')
  async deleteNotification(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notificationService.deleteNotification(user.id, id);
  }
}
