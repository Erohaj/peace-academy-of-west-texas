import type { Tables, TablesUpdate } from '../database.types';
import { requireSupabase } from '../supabaseClient';

export type ApplicationRow = Tables<'volunteer_applications'>;

export interface SubmitApplicationInput {
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string; // ISO date, YYYY-MM-DD
  addressLine: string;
  city: string;
  state: string;
  postalCode: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelation: string;
  skills: string;
  availability: string;
  languages: string;
  interestedInYouthPrograms: boolean;
  motivation: string;
}

/** Whole-year age on a given date — the ordinary "have they had this year's birthday yet" rule. */
export function ageOn(dateOfBirth: string, on: Date = new Date()): number {
  const dob = new Date(`${dateOfBirth}T00:00:00`);
  let age = on.getFullYear() - dob.getFullYear();
  const hadBirthdayThisYear =
    on.getMonth() > dob.getMonth() ||
    (on.getMonth() === dob.getMonth() && on.getDate() >= dob.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

/**
 * Submits an application, freezing whether the applicant was a minor on the
 * day they applied.
 *
 * `was_minor_at_submission` is computed here rather than derived later from
 * `date_of_birth` at read time on purpose: whether a guardian's consent was
 * required is a fact about the day the application was made, not something
 * that should quietly flip to "no" once the volunteer turns 18. Whoever
 * reads this record next — an auditor, an attorney — needs to know what the
 * rule required at the time, not what it would require today.
 */
export async function submitApplication(
  userId: string,
  input: SubmitApplicationInput
): Promise<ApplicationRow> {
  const { data, error } = await requireSupabase()
    .from('volunteer_applications')
    .insert({
      user_id: userId,
      full_name: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim() || null,
      date_of_birth: input.dateOfBirth,
      was_minor_at_submission: ageOn(input.dateOfBirth) < 18,
      address_line: input.addressLine.trim() || null,
      city: input.city.trim() || null,
      state: input.state.trim() || null,
      postal_code: input.postalCode.trim() || null,
      emergency_name: input.emergencyName.trim(),
      emergency_phone: input.emergencyPhone.trim(),
      emergency_relation: input.emergencyRelation.trim() || null,
      skills: input.skills.trim() || null,
      availability: input.availability.trim() || null,
      languages: input.languages.trim() || null,
      interested_in_youth_programs: input.interestedInYouthPrograms,
      motivation: input.motivation.trim() || null
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** The signed-in volunteer's most recent application, if any. */
export async function fetchMyApplication(userId: string): Promise<ApplicationRow | null> {
  const { data, error } = await requireSupabase()
    .from('volunteer_applications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/** Every application, for the admin review queue. */
export async function fetchAllApplicationsForAdmin(): Promise<ApplicationRow[]> {
  const { data, error } = await requireSupabase()
    .from('volunteer_applications')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/**
 * Moves an application through review.
 *
 * `reviewed_by` is stamped with the acting admin — the caller passes it
 * rather than the function assuming a session, matching how service_log and
 * volunteer_certificates attribute their own actions.
 */
export async function reviewApplication(
  id: string,
  patch: Pick<TablesUpdate<'volunteer_applications'>, 'status' | 'review_note'>,
  reviewedBy: string
): Promise<ApplicationRow> {
  const { data, error } = await requireSupabase()
    .from('volunteer_applications')
    .update({ ...patch, reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}
