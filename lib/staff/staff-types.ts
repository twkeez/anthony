/** Row shape for `public.staff` (classification uses a subset). */
export type StaffRow = {
  id: string;
  full_name: string;
  email: string;
  basecamp_id: string | null;
  basecamp_name_handle: string | null;
  writing_style_notes: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

/** Passed into communication author classification (active members only at sync time). */
export type StaffMemberForClassification = Pick<
  StaffRow,
  "email" | "basecamp_id" | "basecamp_name_handle" | "full_name" | "is_active"
>;
