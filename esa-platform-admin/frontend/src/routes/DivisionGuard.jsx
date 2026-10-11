import { Navigate, Outlet, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ROLES } from '../constants/roles';
import { ROLE_TO_DIVISION } from '../constants/divisions';

// Prevents a division admin from navigating to /admin/:division for a
// division other than their own. Super Admin passes through freely.
// The backend's enforceDivisionParam middleware is the real boundary;
// this guard only avoids showing the page before the API call fails.
export default function DivisionGuard() {
  const { user } = useAuth();
  const { division } = useParams();

  const norm = (str) => (str || '').replace(/-/g, '_').toUpperCase();

  if (user?.role === ROLES.SUPER_ADMIN) {
    const validDivisions = ['PRE_UNIVERSITY', 'UNIVERSITY'];
    if (!division || !validDivisions.includes(norm(division))) {
      return <Navigate to="/admin" replace />;
    }
    return <Outlet />;
  }

  const ownDivision = ROLE_TO_DIVISION[user?.role];
  if (!ownDivision || norm(ownDivision) !== norm(division)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}
