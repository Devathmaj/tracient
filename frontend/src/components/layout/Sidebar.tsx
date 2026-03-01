import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Wallet, 
  FileText, 
  Users, 
  Upload, 
  BarChart3,
  AlertTriangle,
  Settings,
  Shield,
  Building2,
  Server,
  Activity,
  UserCog,
  QrCode,
  History,
  BadgeCheck,
  Heart,
  X,
  UsersRound,
  CreditCard,
  Database
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/utils/helpers';
import { UserRole } from '@/types';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  badge?: string | number;
}

const getNavItems = (role: UserRole): NavItem[] => {
  switch (role) {
    case 'worker':
      return [
        { label: 'Dashboard', icon: LayoutDashboard, path: '/worker/dashboard' },
        { label: 'Wage History', icon: History, path: '/worker/wages' },
        { label: 'Bank Accounts', icon: CreditCard, path: '/worker/bank-accounts' },
        { label: 'Welfare Eligibility', icon: BadgeCheck, path: '/worker/welfare' },
        { label: 'Family', icon: UsersRound, path: '/worker/family' },
        { label: 'Payments', icon: QrCode, path: '/worker/generate-qr' },
        { label: 'Profile', icon: UserCog, path: '/worker/profile' },
      ];
    case 'employer':
      return [
        { label: 'Dashboard', icon: LayoutDashboard, path: '/employer/dashboard' },
        { label: 'Record Wage', icon: Wallet, path: '/employer/record-wage' },
        { label: 'Bulk Upload', icon: Upload, path: '/employer/bulk-upload' },
        { label: 'Workers', icon: Users, path: '/employer/workers' },
        { label: 'Family', icon: UsersRound, path: '/employer/family' },
        { label: 'Payment History', icon: History, path: '/employer/payments' },
        { label: 'Welfare Schemes', icon: Heart, path: '/employer/welfare' },
        { label: 'Send Payment', icon: QrCode, path: '/scan-qr' },
        { label: 'Reports', icon: FileText, path: '/employer/reports' },
      ];
    case 'government':
      return [
        { label: 'Dashboard', icon: LayoutDashboard, path: '/government/dashboard' },
        { label: 'Analytics', icon: BarChart3, path: '/government/analytics' },
        { label: 'Anomaly Alerts', icon: AlertTriangle, path: '/government/anomalies', badge: 3 },
        { label: 'Policy Config', icon: Settings, path: '/government/policy' },
        { label: 'Welfare Schemes', icon: Heart, path: '/government/welfare' },
        { label: 'Audit Logs', icon: FileText, path: '/government/audit-logs' },
      ];
    case 'admin':
      return [
        { label: 'Dashboard', icon: LayoutDashboard, path: '/admin/dashboard' },
        { label: 'User Management', icon: Users, path: '/admin/users' },
        { label: 'Identity & Access', icon: Shield, path: '/admin/identity' },
        { label: 'Organizations', icon: Building2, path: '/admin/organizations' },
        { label: 'System Health', icon: Server, path: '/admin/system' },
        { label: 'Network Topology', icon: Activity, path: '/admin/network' },
        { label: 'Blockchain', icon: Database, path: '/admin/blockchain' },
        { label: 'Security', icon: Settings, path: '/admin/security' },
        { label: 'Send Payment', icon: QrCode, path: '/scan-qr' },
      ];
    default:
      return [];
  }
};

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const location = useLocation();
  const navItems = user ? getNavItems(user.role) : [];

  const getRoleColor = (role: UserRole): string => {
    switch (role) {
      case 'worker':
        return 'from-blue-600 to-blue-700';
      case 'employer':
        return 'from-green-600 to-green-700';
      case 'government':
        return 'from-purple-600 to-purple-700';
      case 'admin':
        return 'from-red-600 to-red-700';
      default:
        return 'from-gray-600 to-gray-700';
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200 transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-auto',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo Section */}
        <div className={cn('h-16 flex items-center justify-between px-4 bg-gradient-to-r', user ? getRoleColor(user.role) : 'from-gray-600 to-gray-700')}>
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">Tracient</span>
          </Link>
          <button
            onClick={onClose}
            className="p-1 text-white/80 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1 overflow-y-auto h-[calc(100vh-4rem)]">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )}
              >
                <Icon className={cn('h-5 w-5', isActive ? 'text-primary-600' : 'text-gray-400')} />
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-gray-500">Blockchain Connected</span>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
