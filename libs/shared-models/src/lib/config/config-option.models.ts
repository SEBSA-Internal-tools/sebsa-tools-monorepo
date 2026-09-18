/** Mirrors the Prisma `ConfigScope` enum (prisma/schema.prisma). */
export type ConfigScope = 'GLOBAL' | 'CSO';

/** Mirrors the Prisma `ConfigKind` enum (prisma/schema.prisma). */
export type ConfigKind =
  | 'PROJECT_TYPE'
  | 'PROJECT_STATUS'
  | 'CASE_TYPE'
  | 'CASE_STATUS'
  | 'TASK_STATUS'
  | 'SUBTASK_STATUS'
  | 'TASK_TYPE'
  | 'SUBTASK_TYPE'
  | 'COMPLEXITY_LEVEL'
  | 'PRIORITY';

export interface ConfigOption {
  id: string;
  kind: ConfigKind;
  scope: ConfigScope;
  /** Stable identifier application logic matches on. Never changes. */
  key: string;
  /** Display text — this is what admins rename. */
  label: string;
  color: string | null;
  order: number;
  isActive: boolean;
  isDefault: boolean;
  isCompleted: boolean;
  isCancelled: boolean;
  /** Seeded rows are referenced by application logic: renameable, not deletable. */
  isSystem: boolean;
  /** Set on entries nested under another, e.g. a complexity level under its
   * task type. Null for top-level entries. */
  parentId: string | null;
}

export interface CreateConfigOptionRequest {
  kind: ConfigKind;
  scope: ConfigScope;
  label: string;
  /** Nests the new entry under an existing one. */
  parentId?: string;
  color?: string;
  isDefault?: boolean;
  isCompleted?: boolean;
  isCancelled?: boolean;
}

export interface UpdateConfigOptionRequest {
  label?: string;
  color?: string | null;
  isActive?: boolean;
  isDefault?: boolean;
  isCompleted?: boolean;
  isCancelled?: boolean;
}

/** Reordering is sent as one list so the whole ordering stays consistent. */
export interface ReorderConfigOptionsRequest {
  orderedIds: string[];
}
