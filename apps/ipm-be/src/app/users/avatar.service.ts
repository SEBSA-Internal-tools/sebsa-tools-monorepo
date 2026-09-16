import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@sebsa-pm-tool/core';
import { UserProfileDto } from '@sebsa-pm-tool/shared-models';
import { put, del } from '@vercel/blob';
import type { Multer } from 'multer';
import { UsersService } from './users.service';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  async uploadAvatar(userId: string, file: Multer.File): Promise<UserProfileDto> {
    if (!file) {
      throw new BadRequestException('No file was uploaded.');
    }

    const extension = ALLOWED_MIME_TYPES[file.mimetype];
    if (!extension) {
      throw new BadRequestException('Only PNG, JPEG, or WEBP images are allowed.');
    }
    if (file.size > MAX_AVATAR_BYTES) {
      throw new BadRequestException('Image must be 5MB or smaller.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found.');
    }

    const token = this.configService.get<string>('BLOB_READ_WRITE_TOKEN');
    const blob = await put(`avatars/${userId}-${Date.now()}.${extension}`, file.buffer, {
      access: 'public',
      contentType: file.mimetype,
      token,
    });

    if (user.avatarUrl) {
      await this.deleteBlob(user.avatarUrl, token);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: blob.url },
    });

    return this.usersService.getProfile(userId);
  }

  async removeAvatar(userId: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found.');
    }

    if (user.avatarUrl) {
      const token = this.configService.get<string>('BLOB_READ_WRITE_TOKEN');
      await this.deleteBlob(user.avatarUrl, token);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
    });

    return this.usersService.getProfile(userId);
  }

  private async deleteBlob(url: string, token?: string): Promise<void> {
    try {
      await del(url, { token });
    } catch (error) {
      // Cleanup is best-effort — an orphaned blob is preferable to failing
      // the user's upload/removal request over it.
      this.logger.warn(`Failed to delete old avatar blob: ${(error as Error).message}`);
    }
  }
}
