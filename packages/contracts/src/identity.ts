import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';
import { roleSchema } from './enums.js';

/* -------------------------------------------------------------------------- */
/* User                                                                        */
/* -------------------------------------------------------------------------- */

export const userSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  email: z.string().email(),
  /** Additive — a user may be Developer AND Reviewer AND Admin at once. */
  roles: z.array(roleSchema).min(1),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
});
export type User = z.infer<typeof userSchema>;

/** The authenticated principal. Phase 1 mocks this; Phase 2 fills it from OIDC. */
export const currentUserSchema = userSchema.extend({
  /** Initials rendered in the header avatar chip. */
  initials: z.string().min(1).max(2),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

/** Admin "Add User" modal — screen 02. */
export const createUserInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().email('Enter a valid email address'),
  roles: z.array(roleSchema).min(1, 'Select at least one role'),
});
export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const updateUserInputSchema = createUserInputSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

/* -------------------------------------------------------------------------- */
/* Customer                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `code` is the short badge shown in grids (AASL, SEMCO, BLOM, AIM) and is the
 * prefix of every Task ID for that customer — see `taskCode` in task.ts.
 */
export const customerSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  code: z.string().min(1),
  description: z.string(),
  /** Hex colour chosen in the Add Customer modal (screen 03), used for the badge. */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Colour must be a 6-digit hex value'),
  isActive: z.boolean(),
});
export type Customer = z.infer<typeof customerSchema>;

export const createCustomerInputSchema = z.object({
  name: z.string().trim().min(1, 'Customer name is required'),
  description: z.string().trim().default(''),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Select a colour'),
});
export type CreateCustomerInput = z.infer<typeof createCustomerInputSchema>;

export const updateCustomerInputSchema = createCustomerInputSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateCustomerInput = z.infer<typeof updateCustomerInputSchema>;
