export const profileTabs = ['Overview', 'Joining', 'Address & Contacts', 'Personal Details', 'Profile'] as const;
export type ProfileTab = typeof profileTabs[number];
export const employeeDetailFields = [
  {
    "key": "firstName",
    "column": "first_name",
    "label": "First Name",
    "tab": "Overview",
    "type": "text"
  },
  {
    "key": "lastName",
    "column": "last_name",
    "label": "Last Name",
    "tab": "Overview",
    "type": "text"
  },
  {
    "key": "displayName",
    "column": "display_name",
    "label": "Display Name",
    "tab": "Overview",
    "type": "text"
  },
  {
    "key": "company",
    "column": "company",
    "label": "Company",
    "tab": "Overview",
    "type": "text"
  },
  {
    "key": "employeeGroup",
    "column": "employee_group",
    "label": "Employee Group",
    "tab": "Overview",
    "type": "text"
  },
  {
    "key": "employmentType",
    "column": "employment_type",
    "label": "Employment Type",
    "tab": "Overview",
    "type": "text"
  },
  {
    "key": "employeeSubType",
    "column": "employee_sub_type",
    "label": "Employee Sub Type",
    "tab": "Overview",
    "type": "text"
  },
  {
    "key": "dateOfJoining",
    "column": "date_of_joining",
    "label": "Date of Joining",
    "tab": "Joining",
    "type": "date"
  },
  {
    "key": "probationStartDate",
    "column": "probation_start_date",
    "label": "Probation Start Date",
    "tab": "Joining",
    "type": "date"
  },
  {
    "key": "noticeDays",
    "column": "notice_days",
    "label": "Notice Days",
    "tab": "Joining",
    "type": "number"
  },
  {
    "key": "dateOfRetirement",
    "column": "date_of_retirement",
    "label": "Date of Retirement",
    "tab": "Joining",
    "type": "date"
  },
  {
    "key": "epfContractNo",
    "column": "epf_contract_no",
    "label": "EPF/Contract No.",
    "tab": "Joining",
    "type": "text"
  },
  {
    "key": "mobile",
    "column": "mobile",
    "label": "Mobile",
    "tab": "Address & Contacts",
    "type": "tel"
  },
  {
    "key": "personalEmail",
    "column": "personal_email",
    "label": "Personal Email",
    "tab": "Address & Contacts",
    "type": "email"
  },
  {
    "key": "companyEmail",
    "column": "company_email",
    "label": "Company Email",
    "tab": "Address & Contacts",
    "type": "email"
  },
  {
    "key": "preferredContactEmail",
    "column": "preferred_contact_email",
    "label": "Preferred Contact Email",
    "tab": "Address & Contacts",
    "type": "email"
  },
  {
    "key": "preferredEmail",
    "column": "preferred_email",
    "label": "Preferred Email",
    "tab": "Address & Contacts",
    "type": "email"
  },
  {
    "key": "emergencyContactName",
    "column": "emergency_contact_name",
    "label": "Emergency Contact Name",
    "tab": "Address & Contacts",
    "type": "text"
  },
  {
    "key": "emergencyPhone",
    "column": "emergency_phone",
    "label": "Emergency Phone",
    "tab": "Address & Contacts",
    "type": "tel"
  },
  {
    "key": "relation",
    "column": "relation",
    "label": "Relation",
    "tab": "Address & Contacts",
    "type": "text"
  },
  {
    "key": "secondaryEmergencyContact",
    "column": "secondary_emergency_contact",
    "label": "Secondary Emergency Contact",
    "tab": "Address & Contacts",
    "type": "text"
  },
  {
    "key": "secondaryEmergencyPhone",
    "column": "secondary_emergency_phone",
    "label": "Secondary Emergency Phone",
    "tab": "Address & Contacts",
    "type": "tel"
  },
  {
    "key": "secondaryRelation",
    "column": "secondary_relation",
    "label": "Secondary Relation",
    "tab": "Address & Contacts",
    "type": "text"
  },
  {
    "key": "gender",
    "column": "gender",
    "label": "Gender",
    "tab": "Personal Details",
    "type": "text"
  },
  {
    "key": "dateOfBirth",
    "column": "date_of_birth",
    "label": "Date of Birth",
    "tab": "Personal Details",
    "type": "date"
  },
  {
    "key": "nic",
    "column": "nic",
    "label": "NIC",
    "tab": "Personal Details",
    "type": "text"
  }
] as const;
export type EmployeeDetails = { [K in typeof employeeDetailFields[number]['key']]?: K extends 'noticeDays' ? number | null : string | null };
/** Omission preserves stored values; blank values clear optional fields. */
export function normalizeEmployeeDetails(input: EmployeeDetails): EmployeeDetails {
  const result: Record<string, string | number | null> = {};
  for (const field of employeeDetailFields) {
    const raw = input[field.key];
    if (raw === undefined) continue;
    if (raw === null || raw === '') { result[field.key] = null; continue; }
    if (field.type === 'number') {
      if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > 2147483647) throw new Error(field.label + ' must be a non-negative whole number.');
      result[field.key] = raw;
    } else {
      if (typeof raw !== 'string') throw new Error(field.label + ' must be text.');
      const value = raw.trim();
      if (value && field.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value)) throw new Error(field.label + ' must be a valid date.');
      if (value && field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error(field.label + ' must be a valid email address.');
      result[field.key] = value || null;
    }
  }
  return result as EmployeeDetails;
}
export function employeeDetailsFromRow(row: Record<string, unknown>): EmployeeDetails {
  return Object.fromEntries(employeeDetailFields.map(f => [f.key, row[f.column] ?? null])) as EmployeeDetails;
}
export function pickEmployeeDetails(employee: EmployeeDetails): EmployeeDetails {
  return Object.fromEntries(employeeDetailFields.map(f => [f.key, employee[f.key] ?? null])) as EmployeeDetails;
}
