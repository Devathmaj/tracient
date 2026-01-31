/**
 * Seed Transactions Script
 * Populates WageRecords and UPITransactions for workers using existing employers
 * 
 * Creates 24 months of income data for:
 * - tw1@tracient.com
 * - coconut@gmail.com
 * 
 * Run: node seed-transactions.js
 * To force reset: node seed-transactions.js --force
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { User } from './models/User.js';
import { Worker } from './models/Worker.js';
import { Employer } from './models/Employer.js';
import { WageRecord } from './models/WageRecord.js';
import { UPITransaction } from './models/UPITransaction.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tracient';

// Worker emails to populate
const WORKER_EMAILS = ['tw1@tracient.com', 'coconut@gmail.com'];

// Employer emails mapping
const EMPLOYER_EMAILS = {
  meta: ['hr@meta.com', 'recruiter@meta.com'],
  microsoft: ['hr@microsoft.com', 'talent@microsoft.com'],
  amazon: ['hr@amazon.com', 'recruiting@amazon.com'],
  nvidia: ['hr@nvidia.com', 'careers@nvidia.com'],
  google: ['hr@google.com', 'talent@google.com']
};

// Helper to generate reference numbers
function generateReferenceNumber(prefix = 'TXN') {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

// Helper to generate UPI transaction ID
function generateUpiTxId() {
  return `UPI${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

// Generate random amount within range
function randomAmount(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Get random item from array
function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Generate date in past months
function dateInPastMonths(monthsAgo) {
  const date = new Date();
  date.setMonth(date.getMonth() - monthsAgo);
  date.setDate(Math.floor(Math.random() * 28) + 1); // Random day 1-28
  date.setHours(Math.floor(Math.random() * 12) + 8); // Random hour 8-20
  date.setMinutes(Math.floor(Math.random() * 60));
  return date;
}

// Job descriptions for variety
const JOB_DESCRIPTIONS = [
  'Monthly Salary',
  'Project Bonus',
  'Overtime Payment',
  'Performance Bonus',
  'Contract Work',
  'Freelance Work',
  'Consulting Fee',
  'Commission',
  'Daily Wage',
  'Weekly Wage',
  'Festival Bonus',
  'Incentive Payment'
];

// UPI sender names for unverified payments
const UPI_SENDERS = [
  { name: 'Local Shop Owner', phone: '9876543001' },
  { name: 'Neighbor - Ramesh', phone: '9876543002' },
  { name: 'Friend Payment', phone: '9876543003' },
  { name: 'Private Client', phone: '9876543004' },
  { name: 'Freelance Client', phone: '9876543005' },
  { name: 'Market Stall Work', phone: '9876543006' },
  { name: 'Construction Site', phone: '9876543007' },
  { name: 'Farm Work Payment', phone: '9876543008' },
  { name: 'Household Help Payment', phone: '9876543009' },
  { name: 'Delivery Tip', phone: '9876543010' }
];

async function seedTransactions() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const args = process.argv.slice(2);
    const forceReset = args.includes('--force');

    // Find workers
    console.log('🔍 Finding workers...');
    const workers = [];
    for (const email of WORKER_EMAILS) {
      const user = await User.findOne({ email });
      if (!user) {
        console.log(`   ⚠️  User not found: ${email}`);
        continue;
      }
      const worker = await Worker.findOne({ userId: user._id });
      if (!worker) {
        console.log(`   ⚠️  Worker profile not found for: ${email}`);
        continue;
      }
      workers.push({ user, worker, email });
      console.log(`   ✅ Found: ${email} (Worker ID: ${worker._id})`);
    }

    if (workers.length === 0) {
      console.log('\n❌ No workers found. Please ensure the worker accounts exist.');
      await mongoose.disconnect();
      process.exit(1);
    }

    // Find employers
    console.log('\n🔍 Finding employers...');
    const employers = [];
    for (const [company, emails] of Object.entries(EMPLOYER_EMAILS)) {
      for (const email of emails) {
        const user = await User.findOne({ email });
        if (!user) {
          console.log(`   ⚠️  Employer user not found: ${email}`);
          continue;
        }
        const employer = await Employer.findOne({ userId: user._id });
        if (!employer) {
          console.log(`   ⚠️  Employer profile not found for: ${email}`);
          continue;
        }
        employers.push({ user, employer, email, company });
        console.log(`   ✅ Found: ${employer.companyName} (${email})`);
      }
    }

    if (employers.length === 0) {
      console.log('\n❌ No employers found. Please run seed-employers.js first.');
      await mongoose.disconnect();
      process.exit(1);
    }

    // Delete existing transactions for these workers if force flag
    if (forceReset) {
      console.log('\n🗑️  Removing existing transactions (--force flag)...');
      const workerIds = workers.map(w => w.worker._id);
      
      const deletedWages = await WageRecord.deleteMany({ workerId: { $in: workerIds } });
      console.log(`   Deleted ${deletedWages.deletedCount} wage records`);
      
      const workerHashes = workers.map(w => w.worker.idHash);
      const deletedUpi = await UPITransaction.deleteMany({ workerHash: { $in: workerHashes } });
      console.log(`   Deleted ${deletedUpi.deletedCount} UPI transactions`);
    }

    console.log('\n🌱 Creating transactions for 24 months...\n');

    let totalWageRecords = 0;
    let totalUpiTransactions = 0;
    let totalVerified = 0;
    let totalUnverified = 0;

    for (const { worker, email } of workers) {
      console.log(`\n📋 Processing: ${email}`);
      console.log(`   Worker ID Hash: ${worker.idHash}`);

      // Generate transactions for each month (24 months back)
      for (let monthsAgo = 0; monthsAgo < 24; monthsAgo++) {
        const monthDate = dateInPastMonths(monthsAgo);
        const monthName = monthDate.toLocaleString('default', { month: 'short', year: 'numeric' });

        // 2-4 transactions per month
        const numTransactions = Math.floor(Math.random() * 3) + 2;

        for (let i = 0; i < numTransactions; i++) {
          const isEmployerPayment = Math.random() > 0.35; // 65% employer, 35% UPI

          if (isEmployerPayment && employers.length > 0) {
            // Verified employer payment
            const { employer } = randomItem(employers);
            const txDate = new Date(monthDate);
            txDate.setDate(txDate.getDate() + Math.floor(Math.random() * 7));

            const amount = randomAmount(15000, 85000);
            const description = randomItem(JOB_DESCRIPTIONS);

            const wageRecord = await WageRecord.create({
              workerId: worker._id,
              employerId: employer._id,
              workerIdHash: worker.idHash,
              amount,
              currency: 'INR',
              transactionType: 'wage',
              description,
              workPeriod: {
                startDate: new Date(txDate.getFullYear(), txDate.getMonth(), 1),
                endDate: new Date(txDate.getFullYear(), txDate.getMonth() + 1, 0),
                daysWorked: Math.floor(Math.random() * 10) + 20
              },
              paymentMethod: randomItem(['bank_transfer', 'upi', 'cheque']),
              referenceNumber: generateReferenceNumber('WAGE'),
              status: 'completed',
              completedAt: txDate,
              source: 'employer',
              incomeSource: employer.companyName,
              isVerified: true,
              verifiedOnChain: Math.random() > 0.3,
              blockchainTxId: Math.random() > 0.3 ? `BC-${generateReferenceNumber('TX')}` : null,
              syncedToBlockchain: Math.random() > 0.3,
              statusHistory: [{
                status: 'pending',
                timestamp: new Date(txDate.getTime() - 86400000),
                note: 'Payment initiated'
              }, {
                status: 'completed',
                timestamp: txDate,
                note: 'Payment completed successfully'
              }],
              createdAt: new Date(txDate.getTime() - 86400000),
              updatedAt: txDate
            });

            // Update employer stats
            await Employer.findByIdAndUpdate(employer._id, {
              $inc: { totalWagesPaid: amount, totalTransactions: 1 }
            });

            totalWageRecords++;
            totalVerified++;

          } else {
            // Unverified UPI/QR payment
            const sender = randomItem(UPI_SENDERS);
            const txDate = new Date(monthDate);
            txDate.setDate(txDate.getDate() + Math.floor(Math.random() * 7));

            const amount = randomAmount(500, 8000);
            const txId = generateUpiTxId();
            const transactionRef = generateReferenceNumber('UPI');

            // Create UPI Transaction
            const upiTx = await UPITransaction.create({
              txId,
              workerId: worker._id,
              workerHash: worker.idHash,
              workerName: worker.name || 'Worker',
              workerAccount: worker.bankAccount || 'XXXX1234',
              workerUPI: worker.upiId || 'worker@upi',
              amount,
              currency: 'INR',
              senderName: sender.name,
              senderPhone: sender.phone,
              senderUPI: `${sender.phone}@upi`,
              transactionRef,
              upiRef: `UPI${Date.now()}`,
              status: 'completed',
              mode: Math.random() > 0.5 ? 'QR_SCAN' : 'UPI',
              timestamp: txDate,
              initiatedAt: new Date(txDate.getTime() - 60000),
              completedAt: txDate,
              verifiedOnChain: false,
              remarks: 'Informal sector payment',
              statusHistory: [{
                status: 'pending',
                timestamp: new Date(txDate.getTime() - 60000),
                note: 'UPI payment initiated'
              }, {
                status: 'completed',
                timestamp: txDate,
                note: 'Payment received'
              }],
              createdAt: new Date(txDate.getTime() - 60000),
              updatedAt: txDate
            });

            // Create corresponding wage record
            await WageRecord.create({
              workerId: worker._id,
              workerIdHash: worker.idHash,
              amount,
              currency: 'INR',
              transactionType: 'wage',
              description: `UPI Payment - ${sender.name}`,
              paymentMethod: 'upi',
              referenceNumber: transactionRef,
              upiTransactionId: upiTx._id,
              status: 'completed',
              completedAt: txDate,
              source: Math.random() > 0.5 ? 'qr_scan' : 'self_declared',
              incomeSource: sender.name,
              isVerified: false,
              verifiedOnChain: false,
              syncedToBlockchain: false,
              statusHistory: [{
                status: 'pending',
                timestamp: new Date(txDate.getTime() - 60000),
                note: 'Payment initiated'
              }, {
                status: 'completed',
                timestamp: txDate,
                note: 'Payment completed'
              }],
              createdAt: new Date(txDate.getTime() - 60000),
              updatedAt: txDate
            });

            totalUpiTransactions++;
            totalWageRecords++;
            totalUnverified++;
          }
        }

        if (monthsAgo % 6 === 0) {
          console.log(`   📅 ${monthName}: Generated transactions`);
        }
      }

      // Update worker income stats
      const totalIncome = await WageRecord.aggregate([
        { $match: { workerId: worker._id, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      if (totalIncome.length > 0) {
        await Worker.findByIdAndUpdate(worker._id, {
          totalIncome: totalIncome[0].total
        });
      }

      console.log(`   ✅ Completed: ${email}`);
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ SEEDING COMPLETE!');
    console.log('='.repeat(60));
    console.log(`\n📊 Summary:`);
    console.log(`   • Total Wage Records: ${totalWageRecords}`);
    console.log(`   • Total UPI Transactions: ${totalUpiTransactions}`);
    console.log(`   • Verified (Employer) Payments: ${totalVerified}`);
    console.log(`   • Unverified (UPI/QR) Payments: ${totalUnverified}`);

    console.log(`\n📋 Workers with data:`);
    for (const { email, worker } of workers) {
      const wageCount = await WageRecord.countDocuments({ workerId: worker._id });
      const wageSum = await WageRecord.aggregate([
        { $match: { workerId: worker._id, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      const total = wageSum.length > 0 ? wageSum[0].total : 0;
      console.log(`   • ${email}: ${wageCount} transactions, ₹${total.toLocaleString('en-IN')} total`);
    }

    console.log(`\n📋 Employer payment breakdown:`);
    for (const { employer } of employers) {
      const empWages = await WageRecord.countDocuments({ employerId: employer._id });
      if (empWages > 0) {
        const empSum = await WageRecord.aggregate([
          { $match: { employerId: employer._id, status: 'completed' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const total = empSum.length > 0 ? empSum[0].total : 0;
        console.log(`   • ${employer.companyName}: ${empWages} payments, ₹${total.toLocaleString('en-IN')}`);
      }
    }

    await mongoose.disconnect();
    console.log('\n👋 Database connection closed');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error seeding transactions:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

seedTransactions();
