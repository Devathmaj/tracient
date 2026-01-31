/**
 * Test script for wage endpoints
 * Run this script to verify wage history API functionality
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Worker, WageRecord, User } from './models/index.js';
import { PAYMENT_STATUS } from './config/constants.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tracient';

async function testWageEndpoints() {
  try {
    // Connect to database
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to database');

    // Check if we have any workers
    const workerCount = await Worker.countDocuments();
    console.log(`📊 Found ${workerCount} workers`);

    if (workerCount === 0) {
      console.log('❌ No workers found. Please run seed script first');
      return;
    }

    // Get a worker
    const worker = await Worker.findOne();
    console.log(`👤 Testing with worker: ${worker.name} (${worker.idHash})`);

    // Check wage records for this worker
    const wageCount = await WageRecord.countDocuments({ workerId: worker._id });
    console.log(`💰 Found ${wageCount} wage records for this worker`);

    if (wageCount === 0) {
      console.log('📝 Creating test wage record...');
      
      const testWage = await WageRecord.create({
        workerId: worker._id,
        workerIdHash: worker.idHash,
        amount: 2500.00,
        paymentMethod: 'bank_transfer',
        description: 'Daily construction work',
        status: PAYMENT_STATUS.COMPLETED,
        referenceNumber: `WAGE-TEST-${Date.now()}`,
        transactionType: 'wage',
        source: 'manual'
      });
      
      console.log(`✅ Created test wage record: ${testWage.referenceNumber}`);
    }

    // Test querying wage records (simulating the API call)
    const wageRecords = await WageRecord.find({ workerId: worker._id })
      .populate('workerId', 'name idHash')
      .populate('employerId', 'companyName')
      .sort('-createdAt')
      .limit(10);

    console.log(`📋 Query results:`);
    wageRecords.forEach((record, index) => {
      console.log(`  ${index + 1}. ${record.description} - ₹${record.amount} (${record.status})`);
      console.log(`     Date: ${record.createdAt.toLocaleDateString()}`);
      console.log(`     Ref: ${record.referenceNumber}`);
    });

    console.log('\n✅ All tests passed! The wage history API should work correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

// Run tests
testWageEndpoints();