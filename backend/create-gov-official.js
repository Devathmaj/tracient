/**
 * Create Government Official User
 * Run this script to create a government official account for testing
 * Usage: node create-gov-official.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User, GovOfficial } from './models/index.js';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tracient';

// Default government official credentials
const GOV_OFFICIAL_CREDENTIALS = {
  email: 'official@gov.in',
  password: 'GovOfficial@123',
  name: 'Ramesh Kumar',
  role: 'government',
  phone: '9876543210',
  
  // Official details
  designation: 'District Welfare Officer',
  employeeId: 'DWO-2024-001',
  department: 'Department of Labour and Employment',
  ministry: 'Ministry of Labour & Employment',
  
  // Jurisdiction
  jurisdiction: {
    level: 'district',
    state: 'Maharashtra',
    district: 'Mumbai',
    block: null,
    villages: []
  },
  
  // Office address
  officeAddress: {
    building: 'District Collectorate',
    street: 'CST Road',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001'
  }
};

async function createGovOfficial() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    // Check if government official already exists
    const existingUser = await User.findOne({ email: GOV_OFFICIAL_CREDENTIALS.email });
    
    if (existingUser) {
      console.log('\n⚠️  Government official user already exists!');
      console.log('Email:', GOV_OFFICIAL_CREDENTIALS.email);
      console.log('\nTo reset, delete the user and run this script again.');
      
      // Show current official info
      const officialProfile = await GovOfficial.findOne({ userId: existingUser._id });
      if (officialProfile) {
        console.log('\nCurrent Government Official Details:');
        console.log('- Name:', existingUser.name);
        console.log('- Email:', existingUser.email);
        console.log('- Designation:', officialProfile.designation);
        console.log('- Employee ID:', officialProfile.employeeId);
        console.log('- Department:', officialProfile.department);
        console.log('- Jurisdiction:', `${officialProfile.jurisdiction.level} - ${officialProfile.jurisdiction.state}${officialProfile.jurisdiction.district ? ', ' + officialProfile.jurisdiction.district : ''}`);
        console.log('- Status:', officialProfile.isActive ? 'Active' : 'Inactive');
        console.log('- Verified:', officialProfile.isVerified ? 'Yes' : 'No');
      }
      
      await mongoose.disconnect();
      process.exit(0);
    }

    // Create government official user
    console.log('\nCreating government official user...');
    const govUser = await User.create({
      email: GOV_OFFICIAL_CREDENTIALS.email,
      password: GOV_OFFICIAL_CREDENTIALS.password,
      name: GOV_OFFICIAL_CREDENTIALS.name,
      role: GOV_OFFICIAL_CREDENTIALS.role,
      phone: GOV_OFFICIAL_CREDENTIALS.phone,
      isActive: true,
      isVerified: true
    });

    console.log('✓ Government official user created');

    // Create government official profile
    const govProfile = await GovOfficial.create({
      userId: govUser._id,
      name: GOV_OFFICIAL_CREDENTIALS.name,
      designation: GOV_OFFICIAL_CREDENTIALS.designation,
      employeeId: GOV_OFFICIAL_CREDENTIALS.employeeId,
      department: GOV_OFFICIAL_CREDENTIALS.department,
      ministry: GOV_OFFICIAL_CREDENTIALS.ministry,
      jurisdiction: GOV_OFFICIAL_CREDENTIALS.jurisdiction,
      email: GOV_OFFICIAL_CREDENTIALS.email,
      phone: GOV_OFFICIAL_CREDENTIALS.phone,
      officeAddress: GOV_OFFICIAL_CREDENTIALS.officeAddress,
      permissions: {
        canVerifyWorkers: true,
        canVerifyEmployers: true,
        canApproveSchemes: true,
        canViewAnalytics: true,
        canGenerateReports: true,
        canManageAnomalies: true
      },
      isActive: true,
      isVerified: true,
      lastActiveAt: new Date()
    });

    console.log('✓ Government official profile created');

    // Display success message with credentials
    console.log('\n' + '='.repeat(60));
    console.log('✓ GOVERNMENT OFFICIAL CREATED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log('\nLogin Credentials:');
    console.log('─'.repeat(60));
    console.log('Email:      ', GOV_OFFICIAL_CREDENTIALS.email);
    console.log('Password:   ', GOV_OFFICIAL_CREDENTIALS.password);
    console.log('Role:       ', 'Government Official');
    console.log('─'.repeat(60));
    console.log('\nOfficial Details:');
    console.log('─'.repeat(60));
    console.log('Name:       ', GOV_OFFICIAL_CREDENTIALS.name);
    console.log('Employee ID:', GOV_OFFICIAL_CREDENTIALS.employeeId);
    console.log('Designation:', GOV_OFFICIAL_CREDENTIALS.designation);
    console.log('Department: ', GOV_OFFICIAL_CREDENTIALS.department);
    console.log('Ministry:   ', GOV_OFFICIAL_CREDENTIALS.ministry);
    console.log('─'.repeat(60));
    console.log('\nJurisdiction:');
    console.log('─'.repeat(60));
    console.log('Level:      ', GOV_OFFICIAL_CREDENTIALS.jurisdiction.level);
    console.log('State:      ', GOV_OFFICIAL_CREDENTIALS.jurisdiction.state);
    console.log('District:   ', GOV_OFFICIAL_CREDENTIALS.jurisdiction.district);
    console.log('─'.repeat(60));
    console.log('\nPermissions:');
    console.log('─'.repeat(60));
    console.log('✓ Can Verify Workers');
    console.log('✓ Can Verify Employers');
    console.log('✓ Can Approve Schemes');
    console.log('✓ Can View Analytics');
    console.log('✓ Can Generate Reports');
    console.log('✓ Can Manage Anomalies');
    console.log('─'.repeat(60));
    console.log('\n⚠️  Please change the password after first login!');
    console.log('='.repeat(60) + '\n');

    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('✓ Disconnected from MongoDB');
    
    process.exit(0);

  } catch (error) {
    console.error('\n✗ Error creating government official:', error.message);
    console.error(error);
    
    // Cleanup on error
    try {
      await mongoose.disconnect();
    } catch (disconnectError) {
      // Ignore disconnect errors
    }
    
    process.exit(1);
  }
}

// Run the script
createGovOfficial();
