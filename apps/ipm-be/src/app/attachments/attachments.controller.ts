import {
  BadRequestException,
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiConsumes } from '@nestjs/swagger';
import { AuthUser } from '@sebsa-pm-tool/shared-models';
import type { Multer } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AttachmentsService } from './attachments.service';

@ApiTags('attachments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a file attachment to a task or a case' })
  async uploadFile(
    @UploadedFile() file: Multer.File,
    @Query('taskId') taskId?: string,
    @Query('caseId') caseId?: string,
    @Query('commentId') commentId?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    if (taskId) {
      return this.attachments.uploadAttachment(file, 'TASK', taskId, commentId, user);
    }
    if (caseId) {
      return this.attachments.uploadAttachment(file, 'CASE', caseId, commentId, user);
    }
    throw new BadRequestException('Either taskId or caseId is required');
  }

  @Get('task/:taskId')
  @ApiOperation({ summary: 'Get all attachments for a task' })
  async getTaskAttachments(@Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.attachments.getAttachmentsByTask(taskId);
  }

  @Get('case/:caseId')
  @ApiOperation({ summary: 'Get all attachments for a case' })
  async getCaseAttachments(@Param('caseId', ParseUUIDPipe) caseId: string) {
    return this.attachments.getAttachmentsByCase(caseId);
  }

  @Delete(':attachmentId')
  @ApiOperation({ summary: 'Delete an attachment' })
  async deleteAttachment(
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ message: string }> {
    await this.attachments.deleteAttachment(attachmentId, user);
    return { message: 'Attachment deleted successfully' };
  }
}
