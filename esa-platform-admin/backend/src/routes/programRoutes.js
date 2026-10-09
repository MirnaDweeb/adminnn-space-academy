const express = require('express');
const {
  createProgram,
  listPrograms,
  getProgramById,
  updateProgram,
  updateProgramStatus,
  deleteOrArchiveProgram,
} = require('../controllers/programController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { requirePermission } = require('../middleware/permission');
const { PERMISSIONS } = require('../constants/permissions');
const { resolveDivisionScope } = require('../middleware/divisionScope');
const { ROLES } = require('../constants/roles');

const router = express.Router();

const ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.PRE_UNIVERSITY_ADMIN, ROLES.UNIVERSITY_ADMIN];

// Anyone authenticated can browse programs (students/instructors need to see them to apply);
// scope is still applied so division admins only see their own division's programs.
router.get('/', protect, resolveDivisionScope, listPrograms);
router.get('/:id', protect, resolveDivisionScope, getProgramById);

// Only admins can create/update/archive programs.
router.post('/', protect, authorize(...ADMIN_ROLES), requirePermission(PERMISSIONS.PROGRAMS_MANAGE), resolveDivisionScope, createProgram);
router.put('/:id', protect, authorize(...ADMIN_ROLES), requirePermission(PERMISSIONS.PROGRAMS_MANAGE), resolveDivisionScope, updateProgram);
router.patch('/:id/status', protect, authorize(...ADMIN_ROLES), requirePermission(PERMISSIONS.PROGRAMS_MANAGE), resolveDivisionScope, updateProgramStatus);
router.delete('/:id', protect, authorize(...ADMIN_ROLES), requirePermission(PERMISSIONS.PROGRAMS_MANAGE), resolveDivisionScope, deleteOrArchiveProgram);

module.exports = router;
