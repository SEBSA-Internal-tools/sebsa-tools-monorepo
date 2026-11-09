/** A subtask type as the subtask screens consume it — a view over the
 * `SUBTASK_TYPE` entries in the shared configuration table. */
export interface SubtaskType {
  id: string;
  name: string;
  description: string | null;
  order: number;
  isActive: boolean;
}
