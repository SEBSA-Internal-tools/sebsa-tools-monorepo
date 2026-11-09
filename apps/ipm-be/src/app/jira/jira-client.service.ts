import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: unknown;
    status: { name: string };
    priority: { name: string } | null;
    assignee: { emailAddress: string; displayName: string } | null;
    updated: string;
    issuetype: { name: string };
  };
}

/**
 * Thin wrapper around the Jira Cloud REST API v3. Scoped API tokens (as
 * opposed to classic all-access tokens) only work when called through the
 * Atlassian API gateway (api.atlassian.com/ex/jira/{cloudId}/...) — calling
 * the site URL directly authenticates fine but silently returns empty
 * results instead of an error, which is easy to mistake for "no data"
 * rather than "wrong routing". See JIRA_CLOUD_ID in .env.example for how
 * the cloud ID is obtained.
 */
@Injectable()
export class JiraClientService {
  // Read-only by construction: the integration is one-way (Jira -> here), so
  // no create/update/transition call exists to be reached by mistake.
  private readonly logger = new Logger(JiraClientService.name);
  private readonly http: AxiosInstance | null;

  constructor(private readonly config: ConfigService) {
    const baseUrl = this.config.get<string>('jira.baseUrl');
    const email = this.config.get<string>('jira.email');
    const apiToken = this.config.get<string>('jira.apiToken');
    const cloudId = this.config.get<string>('jira.cloudId');

    if (!baseUrl || !email || !apiToken || !cloudId) {
      this.http = null;
      return;
    }

    this.http = axios.create({
      baseURL: `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3`,
      auth: { username: email, password: apiToken },
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      timeout: 10_000,
    });
  }

  isConfigured(): boolean {
    return this.http !== null;
  }

  private client(): AxiosInstance {
    if (!this.http) {
      throw new InternalServerErrorException('Jira integration is not configured.');
    }
    return this.http;
  }

  async getIssue(issueKey: string): Promise<JiraIssue> {
    const { data } = await this.client().get<JiraIssue>(`/issue/${issueKey}`, {
      params: { fields: 'summary,description,status,priority,assignee,updated,issuetype' },
    });
    return data;
  }

  /** The project's available top-level (non-subtask) issue types — e.g. a
   *  Jira Software project typically has Task/Bug/Story, while a Service
   *  Desk project has request types like "Submit a request or incident"
   *  instead. There's no universal "Task" type to assume. */
  async getProjectIssueTypes(projectKey: string): Promise<{ id: string; name: string }[]> {
    const { data } = await this.client().get<{ issueTypes?: { id: string; name: string; subtask: boolean }[] }>(
      `/project/${projectKey}`,
      { params: { expand: 'issueTypes' } },
    );
    return (data.issueTypes ?? []).filter((t) => !t.subtask).map((t) => ({ id: t.id, name: t.name }));
  }

  /** JQL search, used by the polling fallback. GET /search was deprecated
   *  and removed by Atlassian (returns 410 Gone); /search/jql replaces it. */
  async searchIssues(jql: string): Promise<JiraIssue[]> {
    const { data } = await this.client().post<{ issues: JiraIssue[] }>('/search/jql', {
      jql,
      fields: ['summary', 'description', 'status', 'priority', 'assignee', 'updated', 'issuetype'],
      maxResults: 50,
    });
    return data.issues;
  }
}
