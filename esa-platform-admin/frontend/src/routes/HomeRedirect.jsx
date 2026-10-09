import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ROLES } from '../constants/roles';
import LoadingState from '../components/common/LoadingState';

// Sends an authenticated user to the right landing page for their role.
export default function HomeRedirect() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <LoadingState fullPage />;
  if (!user) return <Navigate to="/login" replace />;

  if (user.role === ROLES.SUPER_ADMIN) return <Navigate to="/admin" replace />;
  if (user.role === ROLES.PRE_UNIVERSITY_ADMIN) return <Navigate to="/admin/PRE_UNIVERSITY" replace />;
  if (user.role === ROLES.UNIVERSITY_ADMIN) return <Navigate to="/admin/UNIVERSITY" replace />;
  return <Navigate to="/dashboard" replace />;
}
