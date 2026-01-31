/**
 * Seed Employers Script
 * Creates employer users and their employer profiles for major tech companies
 * 
 * Run: node seed-employers.js
 * To force reset: node seed-employers.js --force
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from './models/User.js';
import { Employer } from './models/Employer.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tracient';

const employerData = [
  // Meta
  {
    users: [
      { email: 'hr@meta.com', name: 'Meta HR Team', contactPerson: 'HR Manager' },
      { email: 'recruiter@meta.com', name: 'Meta Recruiting', contactPerson: 'Senior Recruiter' }
    ],
    company: {
      companyName: 'Meta Platforms Inc.',
      companyType: 'public_ltd',
      registrationNumber: 'META-REG-001',
      gstin: '29AABCM1234H1Z5',
      panNumber: 'AABCM1234H',
      website: 'https://meta.com',
      industry: 'Technology',
      sector: 'services',
      address: {
        street: '1 Hacker Way',
        city: 'Menlo Park',
        state: 'California',
        pincode: '94025',
        district: 'San Mateo'
      }
    }
  },
  // Microsoft
  {
    users: [
      { email: 'hr@microsoft.com', name: 'Microsoft HR Team', contactPerson: 'HR Director' },
      { email: 'talent@microsoft.com', name: 'Microsoft Talent', contactPerson: 'Talent Acquisition Lead' }
    ],
    company: {
      companyName: 'Microsoft Corporation',
      companyType: 'public_ltd',
      registrationNumber: 'MSFT-REG-002',
      gstin: '29AABCM5678G1Z3',
      panNumber: 'AABCM5678G',
      website: 'https://microsoft.com',
      industry: 'Technology',
      sector: 'services',
      address: {
        street: 'One Microsoft Way',
        city: 'Redmond',
        state: 'Washington',
        pincode: '98052',
        district: 'King'
      }
    }
  },
  // Amazon
  {
    users: [
      { email: 'hr@amazon.com', name: 'Amazon HR Team', contactPerson: 'People Operations' },
      { email: 'recruiting@amazon.com', name: 'Amazon Recruiting', contactPerson: 'Recruiting Manager' }
    ],
    company: {
      companyName: 'Amazon.com Inc.',
      companyType: 'public_ltd',
      registrationNumber: 'AMZN-REG-003',
      gstin: '29AABCA9012F1Z1',
      panNumber: 'AABCA9012F',
      website: 'https://amazon.com',
      industry: 'E-Commerce & Technology',
      sector: 'retail',
      address: {
        street: '410 Terry Ave N',
        city: 'Seattle',
        state: 'Washington',
        pincode: '98109',
        district: 'King'
      }
    }
  },
  // Nvidia
  {
    users: [
      { email: 'hr@nvidia.com', name: 'Nvidia HR Team', contactPerson: 'HR Business Partner' },
      { email: 'careers@nvidia.com', name: 'Nvidia Careers', contactPerson: 'Talent Manager' }
    ],
    company: {
      companyName: 'NVIDIA Corporation',
      companyType: 'public_ltd',
      registrationNumber: 'NVDA-REG-004',
      gstin: '29AABCN3456D1Z7',
      panNumber: 'AABCN3456D',
      website: 'https://nvidia.com',
      industry: 'Semiconductors',
      sector: 'manufacturing',
      address: {
        street: '2788 San Tomas Expressway',
        city: 'Santa Clara',
        state: 'California',
        pincode: '95051',
        district: 'Santa Clara'
      }
    }
  },
  // Google
  {
    users: [
      { email: 'hr@google.com', name: 'Google HR Team', contactPerson: 'People Operations Lead' },
      { email: 'talent@google.com', name: 'Google Talent', contactPerson: 'Staffing Manager' }
    ],
    company: {
      companyName: 'Google LLC (Alphabet Inc.)',
      companyType: 'public_ltd',
      registrationNumber: 'GOOG-REG-005',
      gstin: '29AABCG7890E1Z9',
      panNumber: 'AABCG7890E',
      website: 'https://google.com',
      industry: 'Technology',
      sector: 'services',
      address: {
        street: '1600 Amphitheatre Parkway',
        city: 'Mountain View',
        state: 'California',
        pincode: '94043',
        district: 'Santa Clara'
      }
    }
  }
];

const DEFAULT_PASSWORD = 'employer123';

async function seedEmployers() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const args = process.argv.slice(2);
    const forceReset = args.includes('--force');

    // Check for existing employer users
    const existingEmails = employerData.flatMap(e => e.users.map(u => u.email));
    const existingUsers = await User.find({ email: { $in: existingEmails } });

    if (existingUsers.length > 0 && !forceReset) {
      console.log(`⚠️  Found ${existingUsers.length} existing employer users.`);
      console.log('   Use --force flag to delete and recreate all employers.');
      await mongoose.disconnect();
      process.exit(0);
    }

    if (forceReset) {
      console.log('🗑️  Removing existing employer data (--force flag detected)...');
      
      // Get all employer user IDs to delete their employer profiles
      const employerUserIds = existingUsers.map(u => u._id);
      
      // Delete employer profiles
      const deletedEmployers = await Employer.deleteMany({ userId: { $in: employerUserIds } });
      console.log(`   Deleted ${deletedEmployers.deletedCount} employer profiles`);
      
      // Delete employer users
      const deletedUsers = await User.deleteMany({ email: { $in: existingEmails } });
      console.log(`   Deleted ${deletedUsers.deletedCount} employer users`);
    }

    // Hash password once
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    console.log('\n🌱 Creating employers...\n');

    let totalUsersCreated = 0;
    let totalEmployersCreated = 0;

    for (const data of employerData) {
      console.log(`📦 ${data.company.companyName}`);

      for (const userData of data.users) {
        try {
          // Create user
          const user = await User.create({
            email: userData.email,
            password: hashedPassword,
            role: 'employer',
            name: userData.name,
            phone: '9876543210',
            isActive: true,
            isVerified: true
          });

          console.log(`   ✅ User: ${userData.email}`);
          totalUsersCreated++;

          // Create employer profile
          const employer = await Employer.create({
            userId: user._id,
            companyName: data.company.companyName,
            companyType: data.company.companyType,
            registrationNumber: data.company.registrationNumber,
            gstin: data.company.gstin,
            panNumber: data.company.panNumber,
            contactPerson: userData.contactPerson,
            email: userData.email,
            phone: '9876543210',
            website: data.company.website,
            address: data.company.address,
            industry: data.company.industry,
            sector: data.company.sector,
            verificationStatus: 'verified',
            isActive: true,
            totalWorkers: 0,
            activeWorkers: 0,
            totalWagesPaid: 0,
            totalTransactions: 0
          });

          console.log(`   ✅ Employer profile created (ID: ${employer._id})`);
          totalEmployersCreated++;

        } catch (err) {
          console.error(`   ❌ Error creating ${userData.email}:`, err.message);
        }
      }
      console.log('');
    }

    console.log('='.repeat(50));
    console.log('✅ Seeding Complete!');
    console.log(`   - Users created: ${totalUsersCreated}`);
    console.log(`   - Employer profiles created: ${totalEmployersCreated}`);
    console.log('='.repeat(50));
    console.log('\n📋 Login Credentials:');
    console.log('   Password for all accounts: employer123');
    console.log('\n   Meta:');
    console.log('     • hr@meta.com');
    console.log('     • recruiter@meta.com');
    console.log('\n   Microsoft:');
    console.log('     • hr@microsoft.com');
    console.log('     • talent@microsoft.com');
    console.log('\n   Amazon:');
    console.log('     • hr@amazon.com');
    console.log('     • recruiting@amazon.com');
    console.log('\n   Nvidia:');
    console.log('     • hr@nvidia.com');
    console.log('     • careers@nvidia.com');
    console.log('\n   Google:');
    console.log('     • hr@google.com');
    console.log('     • talent@google.com');

    await mongoose.disconnect();
    console.log('\n👋 Database connection closed');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error seeding employers:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

seedEmployers();
