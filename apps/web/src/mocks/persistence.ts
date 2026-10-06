import { z } from 'zod';
import {
  checklistCategorySchema,
  checklistSubmissionSchema,
  customerSchema,
  generalCheckQuestionSchema,
  handoverSchema,
  issueResponseRecordSchema,
  notificationSchema,
  reviewSchema,
  taskAttachmentSchema,
  taskChecklistSchema,
  taskEventSchema,
  taskSchema,
  taskTypeRecordSchema,
  userSchema,
  systemAuditEventSchema,
} from '@sdp/contracts';
import { db, versionSequencesFromTasks } from './db.ts';

// Browser mock server state belongs to the demo database, not the signed-in
// user or the React tree. Keep it across reloads and developer/reviewer logins.
export const MOCK_DATABASE_KEY = 'sdp-mock-database-v1';
const databaseSchema = z.object({
  users: userSchema.array(),
  customers: customerSchema.array(),
  tasks: taskSchema.array(),
  notifications: notificationSchema.extend({ userId: z.string().min(1) }).array(),
  taskTypes: taskTypeRecordSchema.array(),
  checklistTemplate: checklistCategorySchema.array(),
  generalCheck: generalCheckQuestionSchema.array(),
  handovers: handoverSchema.array(),
  reviews: reviewSchema.array(),
  issueResponses: issueResponseRecordSchema.array(),
  attachments: taskAttachmentSchema.array(),
  checklists: taskChecklistSchema.array(),
  checklistSubmissions: checklistSubmissionSchema.array().default([]),
  events: taskEventSchema.array(),
  auditEvents: systemAuditEventSchema.array().default([]),
  sequences: z.record(z.string(), z.number()),
  versionSequences: z.record(z.string(), z.number()).default({}),
});

export function restoreDatabase(storage: Pick<Storage, 'getItem'>): void {
  const raw = storage.getItem(MOCK_DATABASE_KEY);
  if (!raw) return;
  try {
    const candidate = JSON.parse(raw) as Record<string, unknown>;
    // Browser mock data from the former question-owned applicability model is
    // migrated before schema validation, rather than discarded on upgrade.
    if (Array.isArray(candidate['checklistTemplate'])) {
      for (const category of candidate['checklistTemplate'] as Record<string, unknown>[]) {
        if (
          !Array.isArray(category['applicableTaskTypeIds']) &&
          Array.isArray(category['questions'])
        ) {
          category['applicableTaskTypeIds'] = [
            ...new Set(
              (category['questions'] as Record<string, unknown>[]).flatMap((question) =>
                Array.isArray(question['appliesTo'])
                  ? question['appliesTo'].filter(
                      (taskTypeId): taskTypeId is string => typeof taskTypeId === 'string',
                    )
                  : [],
              ),
            ),
          ];
        }
        for (const question of (category['questions'] ?? []) as Record<string, unknown>[]) {
          delete question['appliesTo'];
        }
      }
    }
    // Delivered was retired from the task lifecycle; older snapshots load as Approved.
    if (Array.isArray(candidate['tasks'])) {
      for (const task of candidate['tasks'] as Record<string, unknown>[]) {
        if (task['status'] === 'Delivered') task['status'] = 'Approved';
        task['reviewRound'] =
          task['reviewRound'] ?? task['historicalCycle'] ?? task['reviewCycle'] ?? 1;
        task['countedCycle'] = task['countedCycle'] ?? task['reviewCycle'] ?? 1;
      }
    }
    if (Array.isArray(candidate['reviews'])) {
      for (const review of candidate['reviews'] as Record<string, unknown>[]) {
        review['reviewRound'] = review['reviewRound'] ?? review['reviewCycle'] ?? 1;
        if (Array.isArray(review['comments'])) {
          for (const comment of review['comments'] as Record<string, unknown>[]) {
            comment['reviewRound'] = comment['reviewRound'] ?? comment['reviewCycle'] ?? 1;
          }
        }
      }
    }
    if (Array.isArray(candidate['issueResponses'])) {
      for (const response of candidate['issueResponses'] as Record<string, unknown>[]) {
        response['reviewRound'] = response['reviewRound'] ?? response['reviewCycle'] ?? 1;
      }
    }
    if (Array.isArray(candidate['events'])) {
      candidate['events'] = (candidate['events'] as Record<string, unknown>[])
        .filter((event) => event['kind'] !== 'Delivered')
        .map((event) => {
          event['reviewRound'] = event['reviewRound'] ?? event['reviewCycle'] ?? 1;
          return event;
        });
    }
    // Never hydrate a partial/incompatible snapshot over the seed database.
    const hydrated = databaseSchema.parse(candidate);

    const userIds = new Set(hydrated.users.map((user) => user.id));
    for (const user of db.users) {
      if (!userIds.has(user.id)) hydrated.users.push(user);
    }

    // Ensure newly seeded QA tasks, reviews, handovers, events, and notifications are preserved
    const taskIds = new Set(hydrated.tasks.map((t) => t.id));
    for (const t of db.tasks) {
      if (!taskIds.has(t.id)) hydrated.tasks.push(t);
    }

    const reviewIds = new Set(hydrated.reviews.map((r) => r.id));
    for (const r of db.reviews) {
      if (!reviewIds.has(r.id)) hydrated.reviews.push(r);
    }

    const handoverIds = new Set(hydrated.handovers.map((h) => h.id));
    for (const h of db.handovers) {
      if (!handoverIds.has(h.id)) hydrated.handovers.push(h);
    }

    const eventIds = new Set(hydrated.events.map((e) => e.id));
    for (const e of db.events) {
      if (!eventIds.has(e.id)) hydrated.events.push(e);
    }

    const notifIds = new Set(hydrated.notifications.map((n) => n.id));
    for (const n of db.notifications) {
      if (!notifIds.has(n.id)) hydrated.notifications.push(n);
    }

    // Merge seeded maxima so older snapshots and newly added QA fixtures cannot
    // make a previously issued identity move backwards.
    for (const [key, value] of Object.entries(db.versionSequences)) {
      hydrated.versionSequences[key] = Math.max(hydrated.versionSequences[key] ?? -1, value);
    }
    for (const [key, value] of Object.entries(versionSequencesFromTasks(hydrated.tasks))) {
      hydrated.versionSequences[key] = Math.max(hydrated.versionSequences[key] ?? -1, value);
    }
    Object.assign(db, hydrated);
  } catch (error) {
    console.warn('Could not restore the demo database.', error);
  }
}

export function persistDatabase(storage: Pick<Storage, 'setItem'>): void {
  storage.setItem(MOCK_DATABASE_KEY, JSON.stringify(db));
}
