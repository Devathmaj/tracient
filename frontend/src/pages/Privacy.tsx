import React from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '@/utils/constants';

const Privacy: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mt-2">Last updated: May 4, 2026</p>

          <div className="mt-8 space-y-6 text-gray-700">
            <section>
              <h2 className="text-xl font-semibold text-gray-900">1. Information We Collect</h2>
              <p className="mt-2">
                We collect identity and contact data needed to manage wage records, including name,
                phone number, email, and government identifiers. Employers may submit worker payment
                details.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900">2. How We Use Data</h2>
              <p className="mt-2">
                Data is used to verify identities, record payments, detect anomalies, and support
                program reporting. Blockchain records are immutable once submitted.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900">3. Sharing</h2>
              <p className="mt-2">
                We share data only with authorized government or program administrators and only for
                legitimate operational or compliance purposes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900">4. Security</h2>
              <p className="mt-2">
                We use access controls, audit logs, and encryption where applicable. Users should
                keep their credentials secure and report suspicious activity.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900">5. Your Choices</h2>
              <p className="mt-2">
                You can review and update your profile details. Some ledger entries cannot be
                altered once recorded.
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

export default Privacy;
