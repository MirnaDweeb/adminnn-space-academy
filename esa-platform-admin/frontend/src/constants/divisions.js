export const DIVISIONS = Object.freeze({
  PRE_UNIVERSITY: 'PRE_UNIVERSITY',
  UNIVERSITY: 'UNIVERSITY',
});

export const DIVISION_LABELS = {
  PRE_UNIVERSITY: 'Pre-University',
  UNIVERSITY: 'University',
};

// Maps a division-admin role to the single division it owns; used by the
// frontend DivisionGuard as a client-side mirror of the backend rule.
export const ROLE_TO_DIVISION = {
  PRE_UNIVERSITY_ADMIN: DIVISIONS.PRE_UNIVERSITY,
  UNIVERSITY_ADMIN: DIVISIONS.UNIVERSITY,
};
