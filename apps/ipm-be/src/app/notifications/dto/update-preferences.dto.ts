import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, ValidateNested } from 'class-validator';
import { NotificationChannel, NotificationType } from '@prisma/client';

export class PreferenceItemDto {
  @ApiProperty({ enum: NotificationChannel })
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  eventType!: NotificationType;

  @ApiProperty()
  @IsBoolean()
  isEnabled!: boolean;
}

export class UpdateNotificationPreferencesDto {
  @ApiProperty({ type: [PreferenceItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreferenceItemDto)
  preferences!: PreferenceItemDto[];
}
