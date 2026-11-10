import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import type { Multer } from 'multer';

/**
 * Local file storage for development/testing.
 * Stores files in /uploads folder (not committed to Git).
 * Folder structure: uploads/{tasks|cases}/{entityId}/{fileName}
 */
@Injectable()
export class LocalStorageService {
  private readonly uploadsDir: string;

  constructor(private readonly configService: ConfigService) {
    this.uploadsDir = path.join(process.cwd(), 'uploads');
    this.ensureDir(this.uploadsDir);
  }

  async uploadFile(
    file: Multer.File,
    folderPrefix: 'tasks' | 'cases',
    entityId: string,
  ): Promise<{ filePath: string; localPath: string }> {
    const entityDir = path.join(this.uploadsDir, folderPrefix, entityId);
    this.ensureDir(entityDir);

    const fileName = this.sanitizeFileName(file.originalname);
    const localPath = path.join(entityDir, fileName);
    const filePath = `${folderPrefix}/${entityId}/${fileName}`;

    // Write file to disk
    fs.writeFileSync(localPath, file.buffer);

    return {
      filePath,
      localPath,
    };
  }

  async deleteFile(filePath: string): Promise<void> {
    const localPath = path.join(this.uploadsDir, filePath);

    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);

      // Clean up empty directories
      this.removeEmptyDirs(path.dirname(localPath));
    }
  }

  getFileUrl(filePath: string): string {
    return `/api/attachments/download/${encodeURIComponent(filePath)}`;
  }

  getFileContent(filePath: string): Buffer {
    const localPath = path.join(this.uploadsDir, filePath);

    if (!fs.existsSync(localPath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    return fs.readFileSync(localPath);
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private removeEmptyDirs(dir: string): void {
    try {
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir);
        this.removeEmptyDirs(path.dirname(dir));
      }
    } catch {
      // Ignore errors when removing directories
    }
  }

  private sanitizeFileName(fileName: string): string {
    // Remove special characters but keep extension
    return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  }
}
