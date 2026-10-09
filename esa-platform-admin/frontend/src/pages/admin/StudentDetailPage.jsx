import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import ConfirmModal from '../../components/common/ConfirmModal';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import Modal from '../../components/common/Modal';
import adminService from '../../services/api/adminService';
import { PERMISSIONS } from '../../constants/permissions';
import { ROLES } from '../../constants/roles';
import { getNotificationConfig } from '../../utils/notificationIcons';

export default function StudentDetailPage() {
  const { division, id } = useParams();
  const { user } = useAuth();

  const [student, setStudent] = useState(null);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('profile');

  // Status toggle confirmation modal
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);

  // Edit Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');
  const [editForm, setEditForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    institution: '',
    major: '',
    academicYear: '',
    gpa: '',
    skills: '',
    bio: '',
  });

  // PDF Download State
  const [pdfLoading, setPdfLoading] = useState(false);

  // Permission Checks
  const isSuperAdmin = user?.role === ROLES.SUPER_ADMIN;
  const canManageStudents = isSuperAdmin || user?.permissions?.includes(PERMISSIONS.STUDENTS_MANAGE);
  const canViewFinance = isSuperAdmin || user?.permissions?.includes(PERMISSIONS.FINANCE_VIEW);
  const canViewApplications = isSuperAdmin || user?.permissions?.includes(PERMISSIONS.APPLICATIONS_VIEW);
  const canViewCertificates = isSuperAdmin || user?.permissions?.includes(PERMISSIONS.CERTIFICATES_VIEW);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Load student base profile
      const stdRes = await adminService.getStudent(id);
      const studentData = stdRes?.student || stdRes;
      setStudent(studentData);

      // Load full overview dossier
      try {
        const ovData = await adminService.getStudentOverview(id);
        setOverview(ovData);
      } catch (ovErr) {
        console.warn('Overview dossier fetch non-fatal error:', ovErr);
      }
    } catch (err) {
      setError(err.message || 'Failed to load student dossier');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open Edit Modal with current values
  const handleOpenEdit = () => {
    const u = student?.user || {};
    const sp = student?.studentProfile || {};
    setEditForm({
      fullName: u.fullName || '',
      email: u.email || '',
      phone: student?.phone || u.phone || '',
      institution: student?.institution || sp.institution || sp.university || '',
      major: student?.major || sp.major || sp.fieldOfStudy || '',
      academicYear: student?.academicYear || sp.academicYear || '',
      gpa: student?.gpa || sp.gpa || '',
      skills: Array.isArray(student?.skills) ? student.skills.join(', ') : (sp.skills?.join(', ') || ''),
      bio: student?.bio || sp.bio || '',
    });
    setEditError('');
    setIsEditOpen(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editForm.fullName.trim()) {
      setEditError('Full name is required');
      return;
    }

    setEditLoading(true);
    setEditError('');
    try {
      const skillsArray = editForm.skills
        ? editForm.skills.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      await adminService.updateStudent(id, {
        fullName: editForm.fullName.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim(),
        institution: editForm.institution.trim(),
        major: editForm.major.trim(),
        academicYear: editForm.academicYear ? Number(editForm.academicYear) : undefined,
        gpa: editForm.gpa ? Number(editForm.gpa) : undefined,
        skills: skillsArray,
        bio: editForm.bio.trim(),
      });

      setIsEditOpen(false);
      await loadData();
    } catch (err) {
      setEditError(err.response?.data?.message || err.message || 'Failed to update student profile');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      setPdfLoading(true);
      await adminService.downloadStudentReportPdf(id);
    } catch (err) {
      alert('Failed to download student dossier PDF: ' + (err.message || 'Server error'));
    } finally {
      setPdfLoading(false);
    }
  };

  const handleStatusToggle = async () => {
    if (!student) return;
    setStatusLoading(true);
    try {
      const newStatus = !student.user?.isActive;
      await adminService.updateStudentStatus(student._id, newStatus);
      setIsConfirmOpen(false);
      await loadData();
    } catch (err) {
      alert(err.message || 'Failed to update student status');
    } finally {
      setStatusLoading(false);
    }
  };

  if (loading) return <LoadingState message="Loading student dossier..." />;
  if (error) return <ErrorState message={error} onRetry={loadData} />;
  if (!student) return <ErrorState message="Student record not found" onRetry={loadData} />;

  const userObj = student.user || {};
  const profileObj = student.studentProfile || {};
  const isActive = userObj.isActive;

  const appCount = overview?.applications?.length || 0;
  const cohortCount = overview?.enrollments?.length || 0;
  const invoiceCount = overview?.invoices?.length || 0;
  const certCount = overview?.certificates?.length || 0;
  const evalCount = overview?.evaluations?.length || 0;
  const feedbackCount = overview?.feedback?.length || 0;

  return (
    <div className="container-fluid py-2" id="student-overview-page">
      <PageHeader
        title={userObj.fullName || 'Student Dossier'}
        subtitle={`ESA Academy Identity — Division: ${student.division?.replace(/_/g, ' ') || 'PRE-UNIVERSITY'}`}
        badge={<StatusBadge status={isActive ? 'ACTIVE' : 'INACTIVE'} />}
        actions={
          <div className="d-flex flex-wrap align-items-center gap-2">
            <Link
              to={division ? `/admin/${division}/students` : '/admin/students'}
              className="btn btn-outline-secondary btn-sm"
            >
              <i className="fa-solid fa-arrow-left me-1" aria-hidden="true"></i>Back to list
            </Link>

            {canManageStudents && (
              <button
                type="button"
                id="edit-student-btn"
                className="btn btn-primary btn-sm d-inline-flex align-items-center gap-1"
                onClick={handleOpenEdit}
              >
                <i className="fa-solid fa-user-pen" aria-hidden="true"></i>
                <span>Edit Student</span>
              </button>
            )}

            <button
              type="button"
              id="download-student-report-btn"
              className="btn btn-outline-info btn-sm d-inline-flex align-items-center gap-1"
              onClick={handleDownloadPdf}
              disabled={pdfLoading}
            >
              <i className={`fa-solid ${pdfLoading ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`} aria-hidden="true"></i>
              <span>{pdfLoading ? 'Generating PDF...' : 'Download Student Report PDF'}</span>
            </button>

            {canManageStudents && (
              <button
                type="button"
                className={`btn btn-sm ${isActive ? 'btn-outline-danger' : 'btn-outline-success'}`}
                onClick={() => setIsConfirmOpen(true)}
              >
                <i className={`fa-solid ${isActive ? 'fa-user-slash' : 'fa-user-check'} me-1`} aria-hidden="true"></i>
                {isActive ? 'Deactivate' : 'Activate'}
              </button>
            )}
          </div>
        }
      />

      {/* Top Metric Cards */}
      <div className="row g-3 mb-4">
        <div className="col-6 col-md-4 col-xl-2">
          <div className="card bg-dark border-secondary-subtle text-white h-100 p-3">
            <div className="text-secondary small fw-semibold text-uppercase">Applications</div>
            <div className="fs-3 fw-bold mt-1 text-primary">{appCount}</div>
            <div className="text-muted text-xs mt-1">Total submitted</div>
          </div>
        </div>
        <div className="col-6 col-md-4 col-xl-2">
          <div className="card bg-dark border-secondary-subtle text-white h-100 p-3">
            <div className="text-secondary small fw-semibold text-uppercase">Cohorts</div>
            <div className="fs-3 fw-bold mt-1 text-info">{cohortCount}</div>
            <div className="text-muted text-xs mt-1">Enrolled training</div>
          </div>
        </div>
        <div className="col-6 col-md-4 col-xl-2">
          <div className="card bg-dark border-secondary-subtle text-white h-100 p-3">
            <div className="text-secondary small fw-semibold text-uppercase">Invoices</div>
            <div className="fs-3 fw-bold mt-1 text-warning">{invoiceCount}</div>
            <div className="text-muted text-xs mt-1">Financial records</div>
          </div>
        </div>
        <div className="col-6 col-md-4 col-xl-2">
          <div className="card bg-dark border-secondary-subtle text-white h-100 p-3">
            <div className="text-secondary small fw-semibold text-uppercase">Evaluations</div>
            <div className="fs-3 fw-bold mt-1 text-purple" style={{ color: '#c084fc' }}>{evalCount}</div>
            <div className="text-muted text-xs mt-1">Assessment outcomes</div>
          </div>
        </div>
        <div className="col-6 col-md-4 col-xl-2">
          <div className="card bg-dark border-secondary-subtle text-white h-100 p-3">
            <div className="text-secondary small fw-semibold text-uppercase">Certificates</div>
            <div className="fs-3 fw-bold mt-1 text-success">{certCount}</div>
            <div className="text-muted text-xs mt-1">Earned credentials</div>
          </div>
        </div>
        <div className="col-6 col-md-4 col-xl-2">
          <div className="card bg-dark border-secondary-subtle text-white h-100 p-3">
            <div className="text-secondary small fw-semibold text-uppercase">Feedback</div>
            <div className="fs-3 fw-bold mt-1 text-light">{feedbackCount}</div>
            <div className="text-muted text-xs mt-1">Submitted ratings</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <ul className="nav nav-tabs border-secondary mb-4" id="student-dossier-tabs" role="tablist">
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${activeTab === 'profile' ? 'active bg-dark text-white border-secondary' : 'text-secondary'}`}
            onClick={() => setActiveTab('profile')}
          >
            <i className="fa-solid fa-id-card me-2"></i>Profile & Education
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${activeTab === 'applications' ? 'active bg-dark text-white border-secondary' : 'text-secondary'}`}
            onClick={() => setActiveTab('applications')}
          >
            <i className="fa-solid fa-file-signature me-2"></i>Applications ({appCount})
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${activeTab === 'cohorts' ? 'active bg-dark text-white border-secondary' : 'text-secondary'}`}
            onClick={() => setActiveTab('cohorts')}
          >
            <i className="fa-solid fa-user-graduate me-2"></i>Cohorts & Training ({cohortCount})
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${activeTab === 'finance' ? 'active bg-dark text-white border-secondary' : 'text-secondary'}`}
            onClick={() => setActiveTab('finance')}
          >
            <i className="fa-solid fa-receipt me-2"></i>Finance & Invoices ({invoiceCount})
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${activeTab === 'evaluations' ? 'active bg-dark text-white border-secondary' : 'text-secondary'}`}
            onClick={() => setActiveTab('evaluations')}
          >
            <i className="fa-solid fa-chart-pie me-2"></i>Evaluations ({evalCount})
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${activeTab === 'certificates' ? 'active bg-dark text-white border-secondary' : 'text-secondary'}`}
            onClick={() => setActiveTab('certificates')}
          >
            <i className="fa-solid fa-award me-2"></i>Certificates ({certCount})
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${activeTab === 'feedback' ? 'active bg-dark text-white border-secondary' : 'text-secondary'}`}
            onClick={() => setActiveTab('feedback')}
          >
            <i className="fa-solid fa-comments me-2"></i>Feedback ({feedbackCount})
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${activeTab === 'notifications' ? 'active bg-dark text-white border-secondary' : 'text-secondary'}`}
            onClick={() => setActiveTab('notifications')}
          >
            <i className="fa-solid fa-bell me-2"></i>Notifications ({overview?.notifications?.length || 0})
          </button>
        </li>
      </ul>

      {/* Tab 1: Profile & Education */}
      {activeTab === 'profile' && (
        <div className="card bg-dark border-secondary-subtle text-white shadow-sm">
          <div className="card-header bg-dark-eval border-secondary-subtle py-3 d-flex justify-content-between align-items-center">
            <span className="fw-semibold text-uppercase text-secondary text-xs">Official Student Record</span>
            {canManageStudents && (
              <button type="button" className="btn btn-outline-primary btn-sm" onClick={handleOpenEdit}>
                <i className="fa-solid fa-pen-to-square me-1"></i>Edit Profile
              </button>
            )}
          </div>
          <div className="card-body p-4">
            <div className="row g-4">
              <div className="col-md-6">
                <h6 className="text-primary fw-bold mb-3 border-bottom border-secondary pb-2">
                  <i className="fa-solid fa-user me-2"></i>Personal & Contact
                </h6>
                <dl className="row mb-0 gy-2">
                  <dt className="col-sm-4 text-secondary">Full Name</dt>
                  <dd className="col-sm-8 fw-semibold text-white">{userObj.fullName || '—'}</dd>
                  <dt className="col-sm-4 text-secondary">Email Address</dt>
                  <dd className="col-sm-8 font-monospace">{userObj.email || '—'}</dd>
                  <dt className="col-sm-4 text-secondary">Phone Number</dt>
                  <dd className="col-sm-8">{student.phone || userObj.phone || '—'}</dd>
                  <dt className="col-sm-4 text-secondary">Division</dt>
                  <dd className="col-sm-8">
                    <span className="badge bg-secondary-subtle text-light border border-secondary">
                      {student.division?.replace(/_/g, ' ') || 'PRE-UNIVERSITY'}
                    </span>
                  </dd>
                  <dt className="col-sm-4 text-secondary">Account Status</dt>
                  <dd className="col-sm-8"><StatusBadge status={isActive ? 'ACTIVE' : 'INACTIVE'} /></dd>
                  <dt className="col-sm-4 text-secondary">Member Since</dt>
                  <dd className="col-sm-8 text-muted">
                    {userObj.createdAt ? new Date(userObj.createdAt).toLocaleDateString() : '—'}
                  </dd>
                </dl>
              </div>

              <div className="col-md-6">
                <h6 className="text-info fw-bold mb-3 border-bottom border-secondary pb-2">
                  <i className="fa-solid fa-graduation-cap me-2"></i>Academic & Background
                </h6>
                <dl className="row mb-0 gy-2">
                  <dt className="col-sm-4 text-secondary">Institution</dt>
                  <dd className="col-sm-8 fw-semibold text-white">
                    {student.institution || profileObj.institution || profileObj.university || '—'}
                  </dd>
                  <dt className="col-sm-4 text-secondary">Major / Field</dt>
                  <dd className="col-sm-8">{student.major || profileObj.major || profileObj.fieldOfStudy || '—'}</dd>
                  <dt className="col-sm-4 text-secondary">Academic Year</dt>
                  <dd className="col-sm-8">{student.academicYear || profileObj.academicYear || '—'}</dd>
                  <dt className="col-sm-4 text-secondary">Cumulative GPA</dt>
                  <dd className="col-sm-8 fw-semibold text-light">{student.gpa || profileObj.gpa || '—'}</dd>
                  <dt className="col-sm-4 text-secondary">Skills & Focus</dt>
                  <dd className="col-sm-8">
                    {student.skills && student.skills.length > 0 ? (
                      <div className="d-flex flex-wrap gap-1">
                        {student.skills.map((s, idx) => (
                          <span key={idx} className="badge bg-dark-eval border border-secondary text-info text-xs">
                            {s}
                          </span>
                        ))}
                      </div>
                    ) : (
                      '—'
                    )}
                  </dd>
                  <dt className="col-sm-4 text-secondary">National ID</dt>
                  <dd className="col-sm-8 font-monospace">{student.nationalId || '—'}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Applications */}
      {activeTab === 'applications' && (
        <div className="card bg-dark border-secondary-subtle text-white shadow-sm">
          <div className="card-header bg-dark-eval border-secondary-subtle py-3">
            <span className="fw-semibold text-uppercase text-secondary text-xs">Application History</span>
          </div>
          <div className="card-body p-0">
            {overview?.applications && overview.applications.length > 0 ? (
              <div className="table-responsive">
                <table className="table table-dark table-hover mb-0 align-middle">
                  <thead className="table-dark text-secondary text-xs text-uppercase">
                    <tr>
                      <th className="ps-4">Program</th>
                      <th>Division</th>
                      <th>Applied Date</th>
                      <th>Status</th>
                      <th>Readiness Score</th>
                      <th className="text-end pe-4">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.applications.map((app) => (
                      <tr key={app._id}>
                        <td className="ps-4 fw-semibold text-white">{app.program?.title || 'Program'}</td>
                        <td>
                          <span className="badge bg-secondary-subtle text-light border border-secondary text-xs">
                            {app.division?.replace(/_/g, ' ') || 'PRE-UNIVERSITY'}
                          </span>
                        </td>
                        <td className="text-muted text-xs">
                          {app.submittedAt ? new Date(app.submittedAt).toLocaleDateString() : '—'}
                        </td>
                        <td><StatusBadge status={app.status} /></td>
                        <td>
                          {app.readinessScore !== undefined ? (
                            <span className="fw-bold text-info">{app.readinessScore}%</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="text-end pe-4">
                          <span className="badge bg-dark-eval border border-secondary text-xs">
                            {app.decision || 'PENDING'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 text-center text-muted">No applications recorded for this student.</div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Cohorts & Training */}
      {activeTab === 'cohorts' && (
        <div className="card bg-dark border-secondary-subtle text-white shadow-sm">
          <div className="card-header bg-dark-eval border-secondary-subtle py-3">
            <span className="fw-semibold text-uppercase text-secondary text-xs">Training & Cohorts Enrolled</span>
          </div>
          <div className="card-body p-0">
            {overview?.enrollments && overview.enrollments.length > 0 ? (
              <div className="table-responsive">
                <table className="table table-dark table-hover mb-0 align-middle">
                  <thead className="table-dark text-secondary text-xs text-uppercase">
                    <tr>
                      <th className="ps-4">Program</th>
                      <th>Cohort Identifier</th>
                      <th>Instructor</th>
                      <th>Dates</th>
                      <th>Enrollment Status</th>
                      <th className="text-end pe-4">Enrolled At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.enrollments.map((enr) => (
                      <tr key={enr._id}>
                        <td className="ps-4 fw-semibold text-white">{enr.program?.title || 'Program'}</td>
                        <td>
                          <span className="badge bg-dark-eval border border-secondary text-info text-xs">
                            {enr.cohort?.cohortNumber || 'Active Cohort'}
                          </span>
                        </td>
                        <td>{enr.cohort?.instructor?.fullName || 'Assigned Instructor'}</td>
                        <td className="text-muted text-xs">
                          {enr.cohort?.startDate ? new Date(enr.cohort.startDate).toLocaleDateString() : '—'} –{' '}
                          {enr.cohort?.endDate ? new Date(enr.cohort.endDate).toLocaleDateString() : '—'}
                        </td>
                        <td><StatusBadge status={enr.status} /></td>
                        <td className="text-end pe-4 text-muted text-xs">
                          {enr.enrolledAt ? new Date(enr.enrolledAt).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 text-center text-muted">No cohort enrollments recorded for this student.</div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Finance & Invoices */}
      {activeTab === 'finance' && (
        <div className="card bg-dark border-secondary-subtle text-white shadow-sm">
          <div className="card-header bg-dark-eval border-secondary-subtle py-3">
            <span className="fw-semibold text-uppercase text-secondary text-xs">Invoices & Financial Ledger</span>
          </div>
          <div className="card-body p-0">
            {overview?.invoices && overview.invoices.length > 0 ? (
              <div className="table-responsive">
                <table className="table table-dark table-hover mb-0 align-middle">
                  <thead className="table-dark text-secondary text-xs text-uppercase">
                    <tr>
                      <th className="ps-4">Invoice #</th>
                      <th>Program</th>
                      <th>Amount</th>
                      <th>Paid</th>
                      <th>Balance</th>
                      <th>Status</th>
                      <th className="text-end pe-4">Due Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.invoices.map((inv) => (
                      <tr key={inv._id}>
                        <td className="ps-4 font-monospace text-primary">{inv.invoiceNumber}</td>
                        <td className="fw-semibold text-white">{inv.program?.title || 'Program'}</td>
                        <td>{inv.amount} EGP</td>
                        <td className="text-success">{inv.paidAmount || 0} EGP</td>
                        <td className="text-danger">{(inv.amount || 0) - (inv.paidAmount || 0)} EGP</td>
                        <td><StatusBadge status={inv.status} /></td>
                        <td className="text-end pe-4 text-muted text-xs">
                          {inv.dueAt ? new Date(inv.dueAt).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 text-center text-muted">No invoices found for this student.</div>
            )}
          </div>
        </div>
      )}

      {/* Tab 5: Evaluations */}
      {activeTab === 'evaluations' && (
        <div className="card bg-dark border-secondary-subtle text-white shadow-sm">
          <div className="card-header bg-dark-eval border-secondary-subtle py-3">
            <span className="fw-semibold text-uppercase text-secondary text-xs">Assessment Outcomes & Learning Gain</span>
          </div>
          <div className="card-body p-0">
            {overview?.evaluations && overview.evaluations.length > 0 ? (
              <div className="table-responsive">
                <table className="table table-dark table-hover mb-0 align-middle">
                  <thead className="table-dark text-secondary text-xs text-uppercase">
                    <tr>
                      <th className="ps-4">Program</th>
                      <th>Cohort</th>
                      <th>Attendance</th>
                      <th>Average Score</th>
                      <th>Outcome</th>
                      <th className="text-end pe-4">Evaluated Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.evaluations.map((ev) => (
                      <tr key={ev._id}>
                        <td className="ps-4 fw-semibold text-white">{ev.program?.title || 'Program'}</td>
                        <td>{ev.cohort?.cohortNumber || 'Cohort'}</td>
                        <td className="text-info">{ev.attendanceRate}%</td>
                        <td className="fw-bold text-light">{ev.averageScore}%</td>
                        <td><StatusBadge status={ev.outcome} /></td>
                        <td className="text-end pe-4 text-muted text-xs">
                          {ev.evaluatedAt ? new Date(ev.evaluatedAt).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 text-center text-muted">No evaluation records found for this student.</div>
            )}
          </div>
        </div>
      )}

      {/* Tab 6: Certificates */}
      {activeTab === 'certificates' && (
        <div className="card bg-dark border-secondary-subtle text-white shadow-sm">
          <div className="card-header bg-dark-eval border-secondary-subtle py-3">
            <span className="fw-semibold text-uppercase text-secondary text-xs">Issued Digital Credentials</span>
          </div>
          <div className="card-body p-0">
            {overview?.certificates && overview.certificates.length > 0 ? (
              <div className="table-responsive">
                <table className="table table-dark table-hover mb-0 align-middle">
                  <thead className="table-dark text-secondary text-xs text-uppercase">
                    <tr>
                      <th className="ps-4">Serial Number</th>
                      <th>Program</th>
                      <th>Status</th>
                      <th>Issued At</th>
                      <th>Verification Token</th>
                      <th className="text-end pe-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.certificates.map((cert) => (
                      <tr key={cert._id}>
                        <td className="ps-4 font-monospace text-warning fw-bold">{cert.serialNumber}</td>
                        <td className="fw-semibold text-white">{cert.program?.title || 'Program'}</td>
                        <td><StatusBadge status={cert.status} /></td>
                        <td className="text-muted text-xs">
                          {cert.issuedAt ? new Date(cert.issuedAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="font-monospace text-xs text-muted">
                          {cert.verificationToken ? `${cert.verificationToken.slice(0, 12)}...` : '—'}
                        </td>
                        <td className="text-end pe-4">
                          <a
                            href={`/api/admin/certificates/${cert._id}/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-outline-info btn-xs py-1 px-2 text-xs"
                          >
                            <i className="fa-solid fa-file-pdf me-1"></i>View PDF
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 text-center text-muted">No certificates issued yet for this student.</div>
            )}
          </div>
        </div>
      )}

      {/* Tab 7: Feedback */}
      {activeTab === 'feedback' && (
        <div className="card bg-dark border-secondary-subtle text-white shadow-sm">
          <div className="card-header bg-dark-eval border-secondary-subtle py-3">
            <span className="fw-semibold text-uppercase text-secondary text-xs">Feedback Submissions</span>
          </div>
          <div className="card-body p-4">
            {overview?.feedback && overview.feedback.length > 0 ? (
              <div className="d-flex flex-column gap-3">
                {overview.feedback.map((f) => (
                  <div key={f._id} className="border border-secondary-subtle rounded p-3 bg-dark-eval">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <div className="d-flex align-items-center gap-2">
                        <span className="badge bg-warning text-dark fw-bold">
                          ★ {f.rating} / 5
                        </span>
                        <span className="badge bg-secondary-subtle text-light border border-secondary text-xs">
                          {f.feedbackType}
                        </span>
                        <span className={`badge text-xs ${f.sentiment === 'POSITIVE' ? 'bg-success-subtle text-success' : f.sentiment === 'NEGATIVE' ? 'bg-danger-subtle text-danger' : 'bg-secondary-subtle text-secondary'}`}>
                          {f.sentiment}
                        </span>
                      </div>
                      <span className="text-muted text-xs">
                        {f.submittedAt ? new Date(f.submittedAt).toLocaleDateString() : '—'}
                      </span>
                    </div>
                    <p className="mb-2 text-white">{f.comments}</p>
                    {f.strengths && (
                      <p className="mb-1 text-xs text-success">
                        <strong>Strengths:</strong> {f.strengths}
                      </p>
                    )}
                    {f.improvements && (
                      <p className="mb-0 text-xs text-warning">
                        <strong>Suggested Improvements:</strong> {f.improvements}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted">No feedback submitted by this student.</div>
            )}
          </div>
        </div>
      )}

      {/* Tab 8: Notifications */}
      {activeTab === 'notifications' && (
        <div className="card bg-dark border-secondary-subtle text-white shadow-sm">
          <div className="card-header bg-dark-eval border-secondary-subtle py-3">
            <span className="fw-semibold text-uppercase text-secondary text-xs">Delivered Notifications & Notices</span>
          </div>
          <div className="card-body p-4">
            {overview?.notifications && overview.notifications.length > 0 ? (
              <div className="d-flex flex-column gap-3">
                {overview.notifications.map((n) => {
                  const cfg = getNotificationConfig(n.type);
                  return (
                    <div key={n._id} className="border border-secondary-subtle rounded p-3 bg-dark-eval d-flex gap-3 align-items-start">
                      <div
                        className="rounded p-2 text-center"
                        style={{ backgroundColor: `${cfg.accentColor}20`, color: cfg.accentColor, minWidth: 36 }}
                      >
                        <i className={`fa-solid ${cfg.icon}`}></i>
                      </div>
                      <div className="flex-grow-1">
                        <div className="d-flex justify-content-between align-items-center">
                          <h6 className="mb-1 text-white fs-6">{n.title}</h6>
                          <span className="text-muted text-xs">
                            {n.createdAt ? new Date(n.createdAt).toLocaleDateString() : '—'}
                          </span>
                        </div>
                        <p className="mb-0 text-secondary text-xs">{n.message}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-muted">No notifications sent to this student yet.</div>
            )}
          </div>
        </div>
      )}

      {/* Edit Student Modal */}
      {isEditOpen && (
        <Modal
          title={`Edit Student Profile — ${userObj.fullName || 'Student'}`}
          isOpen={isEditOpen}
          onClose={() => !editLoading && setIsEditOpen(false)}
        >
          <form onSubmit={handleSaveEdit}>
            {editError && <div className="alert alert-danger py-2 mb-3 text-sm">{editError}</div>}

            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label text-secondary small">Full Name *</label>
                <input
                  type="text"
                  className="form-control form-control-sm bg-dark text-white border-secondary"
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  required
                />
              </div>

              <div className="col-md-6">
                <label className="form-label text-secondary small">Email Address</label>
                <input
                  type="email"
                  className="form-control form-control-sm bg-dark text-white border-secondary"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  required
                />
              </div>

              <div className="col-md-6">
                <label className="form-label text-secondary small">Phone Number</label>
                <input
                  type="text"
                  className="form-control form-control-sm bg-dark text-white border-secondary"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </div>

              <div className="col-md-6">
                <label className="form-label text-secondary small">Institution / University</label>
                <input
                  type="text"
                  className="form-control form-control-sm bg-dark text-white border-secondary"
                  value={editForm.institution}
                  onChange={(e) => setEditForm({ ...editForm, institution: e.target.value })}
                />
              </div>

              <div className="col-md-6">
                <label className="form-label text-secondary small">Major / Field of Study</label>
                <input
                  type="text"
                  className="form-control form-control-sm bg-dark text-white border-secondary"
                  value={editForm.major}
                  onChange={(e) => setEditForm({ ...editForm, major: e.target.value })}
                />
              </div>

              <div className="col-md-3">
                <label className="form-label text-secondary small">Academic Year</label>
                <input
                  type="number"
                  min="1"
                  max="6"
                  className="form-control form-control-sm bg-dark text-white border-secondary"
                  value={editForm.academicYear}
                  onChange={(e) => setEditForm({ ...editForm, academicYear: e.target.value })}
                />
              </div>

              <div className="col-md-3">
                <label className="form-label text-secondary small">Cumulative GPA</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="4"
                  className="form-control form-control-sm bg-dark text-white border-secondary"
                  value={editForm.gpa}
                  onChange={(e) => setEditForm({ ...editForm, gpa: e.target.value })}
                />
              </div>

              <div className="col-12">
                <label className="form-label text-secondary small">Skills (comma separated)</label>
                <input
                  type="text"
                  placeholder="e.g. Python, Orbit Dynamics, ADCS, Electronics"
                  className="form-control form-control-sm bg-dark text-white border-secondary"
                  value={editForm.skills}
                  onChange={(e) => setEditForm({ ...editForm, skills: e.target.value })}
                />
              </div>

              <div className="col-12">
                <label className="form-label text-secondary small">Biography & Profile Information</label>
                <textarea
                  rows="3"
                  className="form-control form-control-sm bg-dark text-white border-secondary"
                  value={editForm.bio}
                  onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                ></textarea>
              </div>
            </div>

            <div className="d-flex justify-content-end gap-2 mt-4 pt-3 border-top border-secondary">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => setIsEditOpen(false)}
                disabled={editLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                id="save-student-edit-btn"
                className="btn btn-primary btn-sm d-inline-flex align-items-center gap-1"
                disabled={editLoading}
              >
                {editLoading && <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>}
                <span>Save Changes</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Confirmation Modal for Activate/Deactivate */}
      <ConfirmModal
        isOpen={isConfirmOpen}
        title={isActive ? 'Deactivate Student' : 'Activate Student'}
        message={`Are you sure you want to ${isActive ? 'deactivate' : 'activate'} this student account?`}
        confirmText={isActive ? 'Deactivate' : 'Activate'}
        confirmVariant={isActive ? 'danger' : 'success'}
        loading={statusLoading}
        onConfirm={handleStatusToggle}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </div>
  );
}
