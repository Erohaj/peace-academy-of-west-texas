import { VolunteerRole } from '../types';

/**
 * The volunteer role vocabulary — single source of truth.
 *
 * The six values are fixed by a CHECK constraint on `shifts.role`, so this list
 * cannot drift without a migration. `shifts.role_es` is free text in the
 * database, which is exactly why the Spanish label belongs here: an admin
 * creating a shift picks a role, and the panel fills the translation in.
 * Left to a text box it would be spelled three different ways within a month,
 * and the portal's Spanish reader would see the difference.
 *
 * The Spanish wording matches what the seeded shifts already carry.
 */
export const VOLUNTEER_ROLES: readonly { value: VolunteerRole; labelEs: string }[] = [
  { value: 'Food Prep', labelEs: 'Preparación de Alimentos' },
  { value: 'Event Setup', labelEs: 'Montaje de Evento' },
  { value: 'Greeter', labelEs: 'Recepción' },
  { value: 'Translator', labelEs: 'Traductor' },
  { value: 'Distribution', labelEs: 'Distribución' },
  { value: 'General Support', labelEs: 'Apoyo General' }
];

/** Spanish label for a role, falling back to the English one it is derived from. */
export const roleLabelEs = (role: VolunteerRole): string =>
  VOLUNTEER_ROLES.find((entry) => entry.value === role)?.labelEs ?? role;
