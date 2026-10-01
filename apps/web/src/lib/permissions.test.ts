import { describe, expect, it } from 'vitest';
import type { Role } from '@sdp/contracts';
import {
  accessibleWorkspaces,
  canAccessWorkspace,
  hasCapability,
  hasNoWorkspaceAccess,
  isPrivilegedRoleSet,
} from './permissions.ts';

const DEVELOPER: Role[] = ['Developer'];
const REVIEWER: Role[] = ['Reviewer'];
const ADMIN: Role[] = ['Admin'];
const MULTI: Role[] = ['Developer', 'Reviewer', 'Admin'];

describe('canAccessWorkspace', () => {
  it('grants a developer only the developer workspace', () => {
    expect(canAccessWorkspace(DEVELOPER, 'developer')).toBe(true);
    expect(canAccessWorkspace(DEVELOPER, 'reviewer')).toBe(false);
    expect(canAccessWorkspace(DEVELOPER, 'admin')).toBe(false);
  });

  it('grants a reviewer only the reviewer workspace', () => {
    expect(canAccessWorkspace(REVIEWER, 'reviewer')).toBe(true);
    expect(canAccessWorkspace(REVIEWER, 'developer')).toBe(false);
    expect(canAccessWorkspace(REVIEWER, 'admin')).toBe(false);
  });

  it('grants an admin the admin workspace without implicitly granting developer or reviewer workspaces', () => {
    expect(canAccessWorkspace(ADMIN, 'admin')).toBe(true);
    expect(canAccessWorkspace(ADMIN, 'developer')).toBe(false);
    expect(canAccessWorkspace(ADMIN, 'reviewer')).toBe(false);
  });
});

describe('accessibleWorkspaces', () => {
  it('returns workspaces in home-page order', () => {
    expect(accessibleWorkspaces(MULTI)).toEqual(['developer', 'reviewer', 'admin']);
  });

  it('unions the roles rather than picking a single highest one', () => {
    expect(accessibleWorkspaces(['Developer', 'Reviewer'])).toEqual(['developer', 'reviewer']);
  });

  it('returns nothing for a user with no roles', () => {
    expect(accessibleWorkspaces([])).toEqual([]);
  });
});

describe('hasNoWorkspaceAccess', () => {
  it('flags an account with no roles configured', () => {
    expect(hasNoWorkspaceAccess([])).toBe(true);
  });

  it('does not flag an account with any role', () => {
    expect(hasNoWorkspaceAccess(DEVELOPER)).toBe(false);
  });
});

describe('hasCapability', () => {
  it('keeps daily operations with Admin and privileged governance with SuperAdmin', () => {
    expect(hasCapability(['Admin'], 'tasks.manage')).toBe(true);
    expect(hasCapability(['Admin'], 'users.manage.standard')).toBe(true);
    expect(hasCapability(['Admin'], 'users.manage.privileged')).toBe(false);
    expect(hasCapability(['Admin'], 'records.purge')).toBe(false);
    expect(hasCapability(['Admin', 'SuperAdmin'], 'users.manage.privileged')).toBe(true);
    expect(hasCapability(['Admin', 'SuperAdmin'], 'records.purge')).toBe(true);
  });

  it('does not grant Developer or Reviewer workspaces through SuperAdmin alone', () => {
    expect(canAccessWorkspace(['SuperAdmin'], 'developer')).toBe(false);
    expect(canAccessWorkspace(['SuperAdmin'], 'reviewer')).toBe(false);
  });
});

describe('isPrivilegedRoleSet', () => {
  it('treats Admin or SuperAdmin as privileged', () => {
    expect(isPrivilegedRoleSet(['Developer', 'Reviewer'])).toBe(false);
    expect(isPrivilegedRoleSet(['Admin'])).toBe(true);
    expect(isPrivilegedRoleSet(['SuperAdmin'])).toBe(true);
  });
});
