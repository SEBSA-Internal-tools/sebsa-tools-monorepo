import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Multer } from 'multer';

interface SharePointConfig {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  siteId: string;
  driveId: string;
}

@Injectable()
export class SharePointService {
  private config: SharePointConfig;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      clientId: this.configService.get('SHAREPOINT_CLIENT_ID') || '',
      clientSecret: this.configService.get('SHAREPOINT_CLIENT_SECRET') || '',
      tenantId: this.configService.get('SHAREPOINT_TENANT_ID') || '',
      siteId: this.configService.get('SHAREPOINT_SITE_ID') || '',
      driveId: this.configService.get('SHAREPOINT_DRIVE_ID') || '',
    };
  }

  /**
   * Upload a file to SharePoint in an entity-specific folder.
   * Folder structure: /{tasks|cases}/{entityId}/{fileName}
   */
  async uploadFile(
    file: Multer.File,
    folderPrefix: 'tasks' | 'cases',
    entityId: string,
  ): Promise<{ filePath: string; driveItemId: string }> {
    const token = await this.getAccessToken();
    const fileName = file.originalname;
    const folderPath = `${folderPrefix}/${entityId}`;

    // Ensure folder exists
    await this.ensureFolder(folderPath, token);

    // Upload file to SharePoint
    const uploadUrl = `https://graph.microsoft.com/v1.0/drives/${this.config.driveId}/root:/${folderPath}/${fileName}:/content`;

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': file.mimetype,
      },
      body: file.buffer,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload file to SharePoint: ${response.statusText}`);
    }

    const data = await response.json();
    const filePath = `${folderPath}/${fileName}`;

    return {
      filePath,
      driveItemId: data.id,
    };
  }

  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const tokenUrl = `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`;

    const params = new URLSearchParams();
    params.append('client_id', this.config.clientId);
    params.append('client_secret', this.config.clientSecret);
    params.append('scope', 'https://graph.microsoft.com/.default');
    params.append('grant_type', 'client_credentials');

    const response = await fetch(tokenUrl, {
      method: 'POST',
      body: params,
    });

    if (!response.ok) {
      throw new Error(`Failed to get SharePoint access token: ${response.statusText}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000; // Refresh 5 min before expiry

    return this.accessToken;
  }

  private async ensureFolder(folderPath: string, token: string): Promise<void> {
    const parts = folderPath.split('/');
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      const checkUrl = `https://graph.microsoft.com/v1.0/drives/${this.config.driveId}/root:/${currentPath}`;

      const checkResponse = await fetch(checkUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (checkResponse.status === 404) {
        // Folder doesn't exist, create it
        const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
        const folderName = currentPath.substring(currentPath.lastIndexOf('/') + 1);

        const createUrl = `https://graph.microsoft.com/v1.0/drives/${this.config.driveId}/root${parentPath ? ':/' + parentPath : ''}:/children`;

        const createResponse = await fetch(createUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: folderName,
            folder: {},
            '@microsoft.graph.conflictBehavior': 'ignore',
          }),
        });

        if (!createResponse.ok && createResponse.status !== 409) {
          throw new Error(`Failed to create SharePoint folder: ${createResponse.statusText}`);
        }
      }
    }
  }
}
