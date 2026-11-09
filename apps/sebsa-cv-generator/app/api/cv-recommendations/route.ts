import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, canEditProfilesAndCvs } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getEmployeeById } from '@/services/employee-service';
import { recommendCvContent } from '@/lib/cv-recommendations';

export const runtime = 'nodejs';

const requestSchema = z.object({
  employeeId: z.string().uuid(),
  requiredSkills: z.string().trim().min(1).max(5_000),
  skillsDescription: z.string().trim().max(20_000).default(''),
}).strict();

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  if (!canEditProfilesAndCvs(user.role)) {
    return NextResponse.json({ error: 'You do not have permission to generate CV recommendations.' }, { status: 403 });
  }

  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Employee, required skills, and a valid request are required.' }, { status: 400 });
  }

  const employee = await getEmployeeById(await createClient(), input.employeeId);
  if (!employee || employee.status !== 'published') {
    return NextResponse.json({ error: 'Employee profile was not found.' }, { status: 404 });
  }

  return NextResponse.json(recommendCvContent(employee, input.requiredSkills, input.skillsDescription));
}
