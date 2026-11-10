/** Mirrors the Prisma `ProjectStatus` enum (prisma/schema.prisma). */
export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED';

/** Mirrors the Prisma `ProjectType` enum (prisma/schema.prisma). */
export type ProjectType =
  | 'IFS_IMPLEMENTATION'
  | 'IFS_SUPPORT'
  | 'INTERNAL'
  | 'CUSTOMIZATION'
  | 'UPGRADE'
  | 'CONFIGURATION'
  | 'CUSTOM';
