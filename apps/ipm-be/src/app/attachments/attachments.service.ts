import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import { AuthUser } from '@sebsa-pm-tool/shared-models';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import type { Multer } from 'multer';
import { SharePointService } from './sharepoint.service';
import { LocalStorageService } from './local-storage.service';

interface AttachmentTarget {
  projectId: string;
  entityType: 'TASK' | 'CASE' | 'COMMENT';
  entityId: string;
}

@Injectable()
export class AttachmentsService {
  private useLocalStorage: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sharePoint: SharePointService,
    private readonly localStorage: LocalStorageService,
    private readonly configService: ConfigService,
  ) {
    // Use local storage if SharePoint is not configured
    const clientId = this.configService.get('SHAREPOINT_CLIENT_ID');
    this.useLocalStorage = !clientId;
  }

  async uploadAttachment(
    file: Multer.File,
    targetType: 'TASK' | 'CASE',
    targetId: string,
    commentId?: string,
    user?: AuthUser,
  ): Promise<any> {
    if (targetType === 'TASK') {
      const task = await this.prisma.task.findUnique({ where: { id: targetId } });
      if (!task) throw new NotFoundException('Task not found');
    } else {
      const kase = await this.prisma.case.findUnique({ where: { id: targetId } });
      if (!kase) throw new NotFoundException('Case not found');
    }

    const folderPrefix = targetType === 'TASK' ? 'tasks' : 'cases';

    // Upload to local storage or SharePoint based on configuration
    const { filePath } = this.useLocalStorage
      ? await this.localStorage.uploadFile(file, folderPrefix, targetId)
      : await this.sharePoint.uploadFile(file, folderPrefix, targetId);

    // The attachments table has a CHECK constraint requiring exactly one of
    // caseId/taskId/commentId — so when a comment is attached, link the
    // attachment to the comment (not the task/case) and reach the parent via
    // the comment's own taskId/caseId relation when listing its attachments.
    const attachment = await this.prisma.attachment.create({
      data: {
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        filePath,
        ...(commentId
          ? { commentId }
          : targetType === 'TASK'
            ? { taskId: targetId }
            : { caseId: targetId }),
        uploadedById: user?.id || '',
      },
      include: {
        uploadedBy: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    return {
      id: attachment.id,
      fileName: attachment.fileName,
      fileSize: attachment.fileSize,
      mimeType: attachment.mimeType,
      filePath: attachment.filePath,
      uploadedBy: attachment.uploadedBy,
      createdAt: attachment.createdAt.toISOString(),
    };
  }

  async getAttachmentsByTask(taskId: string): Promise<any[]> {
    // Attachments live either directly on the task (legacy) or on one of its
    // comments — the exactly-one-parent constraint means a comment upload
    // never has taskId set directly, so both paths must be queried.
    const attachments = await this.prisma.attachment.findMany({
      where: {
        OR: [{ taskId }, { comment: { taskId } }],
      },
      include: {
        uploadedBy: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      fileSize: a.fileSize,
      mimeType: a.mimeType,
      filePath: a.filePath,
      uploadedBy: a.uploadedBy,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  async getAttachmentsByCase(caseId: string): Promise<any[]> {
    // Same reasoning as getAttachmentsByTask: a comment-linked attachment
    // reaches its case through the comment's own caseId relation.
    const attachments = await this.prisma.attachment.findMany({
      where: {
        OR: [{ caseId }, { comment: { caseId } }],
      },
      include: {
        uploadedBy: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      fileSize: a.fileSize,
      mimeType: a.mimeType,
      filePath: a.filePath,
      uploadedBy: a.uploadedBy,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  async getAttachmentsByComment(commentId: string): Promise<any[]> {
    const attachments = await this.prisma.attachment.findMany({
      where: { commentId },
      include: {
        uploadedBy: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      fileSize: a.fileSize,
      mimeType: a.mimeType,
      filePath: a.filePath,
      uploadedBy: a.uploadedBy,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  async getFileForDownload(
    filePath: string,
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const attachment = await this.prisma.attachment.findFirst({ where: { filePath } });
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    if (!this.useLocalStorage) {
      throw new BadRequestException(
        'This file is stored in SharePoint — open it there instead of downloading directly.',
      );
    }

    const buffer = this.localStorage.getFileContent(filePath);
    return { buffer, fileName: attachment.fileName, mimeType: attachment.mimeType };
  }

  async deleteAttachment(attachmentId: string, user: AuthUser): Promise<void> {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    // Only allow the uploader or admin to delete
    if (attachment.uploadedById !== user.id && user.systemRole !== 'ADMIN' && user.systemRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException('You cannot delete this attachment');
    }

    // Delete from storage (local or SharePoint)
    if (this.useLocalStorage) {
      await this.localStorage.deleteFile(attachment.filePath);
    }
    // Note: SharePoint deletion can be added if needed

    await this.prisma.attachment.delete({
      where: { id: attachmentId },
    });
  }
}
