export interface PasswordRequirement {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

/** Shared across signup, invitation activation, and password recovery. */
export const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { id: 'length', label: '8–64 characters', test: (pw) => pw.length >= 8 && pw.length <= 64 },
  { id: 'uppercase', label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'lowercase', label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { id: 'number', label: 'One number', test: (pw) => /[0-9]/.test(pw) },
  { id: 'special', label: 'One special character', test: (pw) => /[^A-Za-z0-9\s]/.test(pw) },
  { id: 'spaces', label: 'No spaces', test: (pw) => !/\s/.test(pw) },
];

export function isPasswordValid(password: string): boolean {
  return PASSWORD_REQUIREMENTS.every((req) => req.test(password));
}
