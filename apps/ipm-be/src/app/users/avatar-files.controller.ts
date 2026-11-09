import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { AVATAR_FILE_PATTERN, AvatarService } from './avatar.service';

/**
 * Serves profile pictures. Deliberately unauthenticated: <img src> cannot send a
 * bearer token. File names embed the user id and an upload timestamp, and the
 * pattern check below keeps lookups confined to the avatars directory.
 */
@ApiTags('users')
@Controller('users/avatars')
export class AvatarFilesController {
  @Get(':fileName')
  @ApiOperation({ summary: 'Download a profile picture' })
  getAvatar(@Param('fileName') fileName: string, @Res() res: Response): void {
    if (!AVATAR_FILE_PATTERN.test(fileName)) {
      throw new NotFoundException();
    }

    const filePath = path.join(AvatarService.avatarsDir(), fileName);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException();
    }

    // Each upload gets a new file name, so a given URL never changes content.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.sendFile(filePath);
  }
}
