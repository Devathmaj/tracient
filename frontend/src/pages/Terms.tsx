import React from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '@/utils/constants';

const Terms: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h1 className="text-3xl font-bold text-gray-900">Terms of Service</h1>
          <p className="text-sm text-gray-500 mt-2">Last updated: May 4, 2026</p>

          <div className="mt-8 space-y-6 text-gray-700">
            <section>
              <h2 className="text-xl font-semibold text-gray-900">1. Overview</h2>
              <p className="mt-2">
                TRACIENT provides a secure platform for recording wage payments, verifying worker
                identities, and supporting welfare distribution with blockchain-backed records. By
                using the service, you agree to these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900">2. Eligibility</h2>
              <p className="mt-2">
                You must provide accurate registration details. Employers and workers must be
                authorized to use the platform. Government and admin accounts are provisioned by
                system administrators.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900">3. Acceptable Use</h2>
              <p className="mt-2">
                You agree not to misuse the service, attempt unauthorized access, or submit false
                wage or identity information. Abuse may lead to account suspension.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900">4. Data Integrity</h2>
              <p className="mt-2">
                Wage entries and related records may be stored on an immutable ledger. You are
                responsible for verifying details before submission.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900">5. Availability</h2>
              <p className="mt-2">
                We strive for high availability, but service interruptions may occur due to
                maintenance or network issues. TRACIENT is not liable for indirect damages.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900">6. Contact</h2>
              <p className="mt-2">
                For support, contact your system administrator or program office.
              </p>
            </section>
          </div>

          <div className="mt-10">
            <Link to={ROUTES.REGISTER} className="text-primary-600 hover:text-primary-500">
              Back to Registration
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Terms;
