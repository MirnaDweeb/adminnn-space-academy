import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import LoadingState from '../components/common/LoadingState';

// Blocks unauthenticated access to any nested route. This is a UX
// convenience only — the backend independently rejects unauthenticated
// requests with 401, so hiding the route here never substitutes for
// real authorization.
export default function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <LoadingState fullPage message="Checking your session..." />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;

  return <Outlet />;
}
