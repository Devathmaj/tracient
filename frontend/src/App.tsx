import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { PageLoader, ErrorBoundary } from './components/common';
import { useAuth } from './hooks/useAuth';
import { ROUTES } from './utils/constants';

// Layouts
import DashboardLayout from './components/layout/DashboardLayout';
import AuthLayout from './components/layout/AuthLayout';

// Auth Pages
const Login = React.lazy(() => import('./pages/auth/Login'));
const Register = React.lazy(() => import('./pages/auth/Register'));
const ForgotPassword = React.lazy(() => import('./pages/auth/ForgotPassword'));

// Public Pages
const Home = React.lazy(() => import('./pages/Home'));
const NotFound = React.lazy(() => import('./pages/NotFound'));
const Unauthorized = React.lazy(() => import('./pages/Unauthorized'));

// Worker Pages
const WorkerDashboard = React.lazy(() => import('./pages/worker/Dashboard'));
const WageHistory = React.lazy(() => import('./pages/worker/WageHistory'));
const Welfare = React.lazy(() => import('./pages/worker/Welfare'));
const WorkerProfile = React.lazy(() => import('./pages/worker/Profile'));
const WorkerFamily = React.lazy(() => import('./pages/worker/Family'));
const WorkerFamilySurvey = React.lazy(() => import('./pages/worker/FamilySurvey'));
const WorkerUpdateFamily = React.lazy(() => import('./pages/worker/UpdateFamily'));
const BankAccounts = React.lazy(() => import('./pages/worker/BankAccounts'));
const GenerateQR = React.lazy(() => import('./pages/worker/GenerateQR'));
const ScanQR = React.lazy(() => import('./pages/worker/ScanQR'));

// Employer Pages
const EmployerDashboard = React.lazy(() => import('./pages/employer/Dashboard'));
const RecordWage = React.lazy(() => import('./pages/employer/RecordWage'));
const BulkUpload = React.lazy(() => import('./pages/employer/BulkUpload'));
const EmployerWorkers = React.lazy(() => import('./pages/employer/Workers'));
const PaymentHistory = React.lazy(() => import('./pages/employer/PaymentHistory'));
const EmployerFamily = React.lazy(() => import('./pages/employer/Family'));
const EmployerFamilySurvey = React.lazy(() => import('./pages/employer/FamilySurvey'));
const EmployerUpdateFamily = React.lazy(() => import('./pages/worker/UpdateFamily')); // Reuse worker component
const EmployerWelfare = React.lazy(() => import('./pages/employer/Welfare'));

// Government Pages
const GovDashboard = React.lazy(() => import('./pages/government/Dashboard'));
const Analytics = React.lazy(() => import('./pages/government/Analytics'));
const AnomalyAlerts = React.lazy(() => import('./pages/government/AnomalyAlerts'));
const PolicyConfig = React.lazy(() => import('./pages/government/PolicyConfig'));
const AuditLogs = React.lazy(() => import('./pages/government/AuditLogs'));
const WelfareSchemes = React.lazy(() => import('./pages/government/WelfareSchemes'));
const GovProfile = React.lazy(() => import('./pages/government/Profile'));

// Admin Pages
const AdminDashboard = React.lazy(() => import('./pages/admin/Dashboard'));
const UserManagement = React.lazy(() => import('./pages/admin/UserManagement'));
const SystemHealth = React.lazy(() => import('./pages/admin/SystemHealth'));
const Organizations = React.lazy(() => import('./pages/admin/Organizations'));
const NetworkTopology = React.lazy(() => import('./pages/admin/NetworkTopology'));
const Security = React.lazy(() => import('./pages/admin/Security'));
const AdminProfile = React.lazy(() => import('./pages/admin/Profile'));
const BlockchainTesting = React.lazy(() => import('./pages/admin/BlockchainTesting'));
const IdentityManagement = React.lazy(() => import('./pages/admin/IdentityManagement'));

// Employer Profile
const EmployerProfile = React.lazy(() => import('./pages/employer/Profile'));

// Protected Route Component
import ProtectedRoute from './components/auth/ProtectedRoute';

const App: React.FC = () => {
  const { isLoading } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes>
        {/* Public Routes */}
        <Route path={ROUTES.HOME} element={<Home />} />
        <Route path={ROUTES.UNAUTHORIZED} element={<Unauthorized />} />
        
        {/* Auth Routes */}
        <Route element={<AuthLayout />}>
          <Route path={ROUTES.LOGIN} element={<Login />} />
          <Route path={ROUTES.REGISTER} element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        </Route>

        {/* Worker Routes */}
        <Route
          path="/worker"
          element={
            <ProtectedRoute allowedRoles={['worker']}>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to={ROUTES.WORKER_DASHBOARD} replace />} />
          <Route path="dashboard" element={<WorkerDashboard />} />
          <Route path="wages" element={<WageHistory />} />
          <Route path="welfare" element={<Welfare />} />
          <Route path="family" element={<WorkerFamily />} />
          <Route path="family/survey" element={<WorkerFamilySurvey />} />
          <Route path="family/update" element={<WorkerUpdateFamily />} />
          <Route path="bank-accounts" element={<BankAccounts />} />
          <Route path="generate-qr" element={<GenerateQR />} />
          <Route path="profile" element={<WorkerProfile />} />
        </Route>

        {/* Public QR Payment Route (no auth needed) */}
        <Route path="/scan-qr" element={<ScanQR />} />

        {/* Employer Routes */}
        <Route
          path="/employer"
          element={
            <ProtectedRoute allowedRoles={['employer']}>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to={ROUTES.EMPLOYER_DASHBOARD} replace />} />
          <Route path="dashboard" element={<EmployerDashboard />} />
          <Route path="record-wage" element={<RecordWage />} />
          <Route path="bulk-upload" element={<BulkUpload />} />
          <Route path="workers" element={<EmployerWorkers />} />
          <Route path="family" element={<EmployerFamily />} />
          <Route path="family/survey" element={<EmployerFamilySurvey />} />
          <Route path="family/update" element={<EmployerUpdateFamily />} />
          <Route path="payments" element={<PaymentHistory />} />
          <Route path="welfare" element={<EmployerWelfare />} />
          <Route path="profile" element={<EmployerProfile />} />
        </Route>

        {/* Government Routes */}
        <Route
          path="/government"
          element={
            <ProtectedRoute allowedRoles={['government']}>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to={ROUTES.GOVERNMENT_DASHBOARD} replace />} />
          <Route path="dashboard" element={<GovDashboard />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="anomalies" element={<AnomalyAlerts />} />
          <Route path="policy" element={<PolicyConfig />} />
          <Route path="audit-logs" element={<AuditLogs />} />
          <Route path="welfare" element={<WelfareSchemes />} />
          <Route path="profile" element={<GovProfile />} />
        </Route>

        {/* Admin Routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to={ROUTES.ADMIN_DASHBOARD} replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="identity" element={<IdentityManagement />} />
          <Route path="system" element={<SystemHealth />} />
          <Route path="network" element={<NetworkTopology />} />
          <Route path="security" element={<Security />} />
          <Route path="organizations" element={<Organizations />} />
          <Route path="blockchain" element={<BlockchainTesting />} />
          <Route path="profile" element={<AdminProfile />} />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
    </ErrorBoundary>
  );
};

export default App;
