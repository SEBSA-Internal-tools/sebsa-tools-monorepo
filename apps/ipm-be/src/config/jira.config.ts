import { registerAs } from '@nestjs/config';

/** Optional — the app runs fine with Jira sync disabled (JiraClientService
 *  checks isConfigured() before doing anything) so devs without a Jira
 *  token aren't blocked. */
export default registerAs('jira', () => ({
  baseUrl: process.env.JIRA_BASE_URL,
  email: process.env.JIRA_EMAIL,
  apiToken: process.env.JIRA_API_TOKEN,
  projectKey: process.env.JIRA_PROJECT_KEY,
  cloudId: process.env.JIRA_CLOUD_ID,
  // Off by default — see JiraPollService for why. Set to the literal string
  // "true" to opt in once broad polling of the linked Jira project's
  // recent changes is actually wanted.
  pollingEnabled: process.env.JIRA_POLLING_ENABLED,
}));
