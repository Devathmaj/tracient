/**
 * Create Test Accounts for All Roles
 * Creates one test user per role: worker, employer, government, admin
 * Usage: node create-test-accounts.js
 */

import mongoose from 'mongoose';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { User, Worker, Employer, GovOfficial, Admin } from './models/index.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tracient';

const TEST_ACCOUNTS = [
  {
    role: 'worker',
    user: {
      email: 'worker@test.com',
      password: 'Worker@123',
      name: 'Test Worker',
      role: 'worker',
      phone: '9876500001',
      isActive: true,
      isVerified: true,
    },
    profile: {
      aadhaarLast4: '1234',
      bankAccount: 'TRCNT-TEST-W001',
      employmentType: 'informal',
      isFarmer: false,
    },
  },
  {
    role: 'employer',
    user: {
      email: 'employer@test.com',
      password: 'Employer@123',
      name: 'Test Employer',
      role: 'employer',
      phone: '9876500002',
      isActive: true,
      isVerified: true,
    },
    profile: {
      companyName: 'Test Corp Pvt Ltd',
      contactPerson: 'Test Employer',
      email: 'employer@test.com',
      phone: '9876500002',
      companyType: 'pvt_ltd',
      panNumber: 'ABCDE1234F',
      gstin: '22ABCDE1234F1Z5',
    },
  },
  {
    role: 'government',
    user: {
      email: 'govt@test.com',
      password: 'Govt@123',
      name: 'Test Official',
      role: 'government',
      phone: '9876500003',
      isActive: true,
      isVerified: true,
    },
    profile: {
      designation: 'District Welfare Officer',
      employeeId: 'GOV-TEST-001',
      department: 'Department of Labour and Employment',
      ministry: 'Ministry of Labour & Employment',
      email: 'govt@test.com',
      phone: '9876500003',
      jurisdiction: {
        level: 'state',
        state: 'Maharashtra',
      },
      isVerified: true,
      permissions: {
        canVerifyWorkers: true,
        canVerifyEmployers: true,
        canApproveSchemes: true,
        canViewAnalytics: true,
        canGenerateReports: true,
        canManageAnomalies: true,
      },
    },
  },
  {
    role: 'admin',
    user: {
      email: 'admin@test.com',
      password: 'Admin@123',
      name: 'Test Admin',
      role: 'admin',
      phone: '9876500004',
      isActive: true,
      isVerified: true,
    },
    profile: {
      employeeId: 'ADMIN-TEST-001',
      email: 'admin@test.com',
      phone: '9876500004',
      adminLevel: 'super',
      permissions: {
        manageUsers: true,
        manageWorkers: true,
        manageEmployers: true,
        manageGovOfficials: true,
        manageAdmins: true,
        manageSchemes: true,
        managePolicies: true,
        viewAnalytics: true,
        viewAuditLogs: true,
        manageBlockchain: true,
        systemSettings: true,
      },
    },
  },
];

async function createTestAccounts() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    for (const account of TEST_ACCOUNTS) {
      const { role, user: userData, profile: profileData } = account;

      // Check if user already exists
      const existing = await User.findOne({ email: userData.email });
      if (existing) {
        console.log(`⚠️  ${role.toUpperCase()} already exists (${userData.email}) — skipping`);
        continue;
      }

      // Generate idHash
      const idHash = crypto.createHash('sha256').update(`${userData.email}-test`).digest('hex');

      // Create user
      const user = await User.create({ ...userData, idHash });
      console.log(`✓ Created ${role} user: ${userData.email}`);

      // Create role-specific profile
      switch (role) {
        case 'worker':
          await Worker.create({
            userId: user._id,
            idHash,
            name: userData.name,
            phone: userData.phone,
            ...profileData,
          });
          break;

        case 'employer':
          await Employer.create({
            userId: user._id,
            ...profileData,
          });
          break;

        case 'government':
          await GovOfficial.create({
            userId: user._id,
            name: userData.name,
            ...profileData,
          });
          break;

        case 'admin':
          await Admin.create({
            userId: user._id,
            name: userData.name,
            ...profileData,
          });
          break;
      }
      console.log(`  ✓ Created ${role} profile`);
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('  TEST ACCOUNTS READY');
    console.log('='.repeat(60));
    console.log('');
    console.log('  Role          Email                Password');
    console.log('  ──────────    ───────────────────   ─────────────');
    console.log('  Worker        worker@test.com       Worker@123');
    console.log('  Employer      employer@test.com     Employer@123');
    console.log('  Government    govt@test.com         Govt@123');
    console.log('  Admin         admin@test.com        Admin@123');
    console.log('');
    console.log('  Login at: http://localhost:5173/login');
    console.log('='.repeat(60));

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

createTestAccounts();
