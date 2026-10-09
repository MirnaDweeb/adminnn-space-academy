// Academy divisions. Every division-scoped resource (students, programs,
// applications) carries one of these so access can be restricted per admin.
const DIVISIONS = Object.freeze({
  PRE_UNIVERSITY: 'PRE_UNIVERSITY',
  UNIVERSITY: 'UNIVERSITY',
});

const ALL_DIVISIONS = [DIVISIONS.PRE_UNIVERSITY, DIVISIONS.UNIVERSITY];

// Maps a division-admin role to the single division it is allowed to touch.
const ROLE_TO_DIVISION = {
  PRE_UNIVERSITY_ADMIN: DIVISIONS.PRE_UNIVERSITY,
  UNIVERSITY_ADMIN: DIVISIONS.UNIVERSITY,
};

module.exports = { DIVISIONS, ALL_DIVISIONS, ROLE_TO_DIVISION };
