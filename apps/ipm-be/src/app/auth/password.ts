import * as bcrypt from 'bcryptjs';

/** OWASP guidance for bcrypt is 12 or above. Raising this is safe: existing
 * hashes keep working and are upgraded on the owner's next successful login
 * (see AuthService.validateUser). */
export const PASSWORD_SALT_ROUNDS = 12;

export function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, PASSWORD_SALT_ROUNDS);
}

/** True when a stored hash predates the current cost factor. */
export function needsRehash(passwordHash: string): boolean {
  try {
    return bcrypt.getRounds(passwordHash) < PASSWORD_SALT_ROUNDS;
  } catch {
    // Unparseable hash — leave it alone rather than guessing.
    return false;
  }
}
