import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import { UserProfileDto } from '@sebsa-pm-tool/shared-models';
import * as fs from 'fs';
import * as path from 'path';
import type { Multer } from 'multer';
import { UsersService } from './users.service';

export const AVATAR_URL_PREFIX = '/api/users/avatars/';
export const AVATAR_FILE_PATTERN = /^[0-9a-fA-F-]{36}-\d+\.(png|jpg|webp)$/;

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
  ) {
    fs.mkdirSync(AvatarService.avatarsDir(), { recursive: true });
  }

  /** Stored under <cwd>/uploads, which is a mounted volume in production. */
  static avatarsDir(): string {
    return path.join(process.cwd(), 'uploads', 'avatars');
  }

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

    const fileName = `${userId}-${Date.now()}.${extension}`;
    await fs.promises.writeFile(path.join(AvatarService.avatarsDir(), fileName), file.buffer);

    if (user.avatarUrl) {
      await this.deleteFile(user.avatarUrl);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: `${AVATAR_URL_PREFIX}${fileName}` },
    });

    return this.usersService.getProfile(userId);
  }

  async removeAvatar(userId: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found.');
    }

    if (user.avatarUrl) {
      await this.deleteFile(user.avatarUrl);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
    });

    return this.usersService.getProfile(userId);
  }

  private async deleteFile(avatarUrl: string): Promise<void> {
    if (!avatarUrl.startsWith(AVATAR_URL_PREFIX)) return;
    const fileName = avatarUrl.slice(AVATAR_URL_PREFIX.length);
    if (!AVATAR_FILE_PATTERN.test(fileName)) return;

    try {
      await fs.promises.unlink(path.join(AvatarService.avatarsDir(), fileName));
    } catch (error) {
      // Cleanup is best-effort — an orphaned file is preferable to failing
      // the user's upload/removal request over it.
      this.logger.warn(`Failed to delete old avatar file: ${(error as Error).message}`);
    }
  }
}
