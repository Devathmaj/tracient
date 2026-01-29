/**
 * Simulate 12 Months of Worker Transactions
 * Creates transaction history for 2 workers:
 * - Worker 1: Normal transaction patterns
 * - Worker 2: Normal pattern with one large anomalous deposit
 * 
 * Usage: node simulate-worker-transactions.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Worker, WageRecord, UPITransaction } from './models/index.js';
import { PAYMENT_STATUS, TRANSACTION_TYPES } from './config/constants.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tracient';

// Helper function to generate random number in range
function randomInRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Helper function to generate random float in range
function randomFloat(min, max, decimals = 2) {
  const value = Math.random() * (max - min) + min;
  return parseFloat(value.toFixed(decimals));
}

// Helper to get random employer names
function getRandomEmployer() {
  const employers = [
    'ABC Construction Ltd',
    'XYZ Builders',
    'City Corporation',
    'Private Contractor',
    'Mumbai Municipal Corp',
    'Daily Wage Work',
    'Local Factory',
    'Retail Shop'
  ];
  return employers[randomInRange(0, employers.length - 1)];
}

// Generate normal transaction pattern for a month
function generateNormalMonthlyTransactions(worker, monthOffset, isAnomalous = false) {
  const transactions = [];
  const baseDate = new Date();
  baseDate.setMonth(baseDate.getMonth() - monthOffset);
  
  // Normal worker gets 15-25 transactions per month (weekly/bi-weekly payments)
  const numTransactions = randomInRange(15, 25);
  
  for (let i = 0; i < numTransactions; i++) {
    // Random day in the month
    const dayOfMonth = randomInRange(1, 28);
    const transactionDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), dayOfMonth);
    
    // Add random hours (mostly during work hours)
    const hour = randomInRange(8, 20);
    const minute = randomInRange(0, 59);
    transactionDate.setHours(hour, minute, 0, 0);
    
    // Normal wage: 300-800 INR per day
    const amount = randomFloat(300, 800);
    const employer = getRandomEmployer();
    
    transactions.push({
      worker,
      amount,
      employer,
      date: transactionDate,
      isVerified: Math.random() > 0.1, // 90% verified
      hour,
      isWeekend: transactionDate.getDay() === 0 || transactionDate.getDay() === 6
    });
  }
  
  // Add anomalous transaction for Worker 2 in month 6
  if (isAnomalous && monthOffset === 6) {
    const anomalyDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), 15);
    anomalyDate.setHours(2, 30, 0, 0); // Late night
    
    transactions.push({
      worker,
      amount: 150000, // Large amount: 1.5 Lakh INR
      employer: 'Unknown Source',
      date: anomalyDate,
      isVerified: false, // Unverified
      hour: 2,
      isWeekend: true,
      isAnomaly: true
    });
  }
  
  return transactions;
}

// Create wage record and UPI transaction
async function createTransaction(txData) {
  const { worker, amount, employer, date, isVerified, isAnomaly } = txData;
  
  // Generate unique reference
  const refNumber = `TX${Date.now()}${randomInRange(1000, 9999)}`;
  const txId = `UPI${Date.now()}${randomInRange(1000, 9999)}`;
  
  // Create Wage Record
  const wageRecord = await WageRecord.create({
    workerId: worker._id,
    workerIdHash: worker.idHash,
    amount,
    currency: 'INR',
    transactionType: TRANSACTION_TYPES.WAGE,
    description: `Payment from ${employer}`,
    paymentMethod: 'upi',
    referenceNumber: refNumber,
    status: PAYMENT_STATUS.COMPLETED,
    incomeSource: employer,
    isVerified,
    initiatedAt: date,
    completedAt: date,
    createdAt: date,
    updatedAt: date,
    source: isVerified ? 'employer' : 'self_declared',
    statusHistory: [{
      status: PAYMENT_STATUS.COMPLETED,
      timestamp: date,
      note: 'Transaction completed'
    }]
  });
  
  // Create UPI Transaction
  const upiTransaction = await UPITransaction.create({
    txId,
    workerId: worker._id,
    wageRecordId: wageRecord._id,
    workerHash: worker.idHash,
    workerName: worker.name,
    workerAccount: worker.bankAccounts?.[0]?.accountNumber || 'XXXX1234',
    amount,
    currency: 'INR',
    senderName: employer,
    senderPhone: `${randomInRange(6000000000, 9999999999)}`,
    transactionRef: refNumber,
    upiRef: `UPI${randomInRange(100000000, 999999999)}`,
    status: PAYMENT_STATUS.COMPLETED,
    mode: 'UPI',
    timestamp: date,
    initiatedAt: date,
    completedAt: date,
    createdAt: date,
    updatedAt: date,
    statusHistory: [{
      status: PAYMENT_STATUS.COMPLETED,
      timestamp: date,
      note: 'Payment successful'
    }]
  });
  
  // Update worker's bank account balance
  if (worker.bankAccounts && worker.bankAccounts.length > 0) {
    worker.bankAccounts[0].balance += amount;
    worker.bankAccounts[0].monthlyIncome += amount;
    worker.bankAccounts[0].balanceLastUpdated = date;
    worker.bankAccounts[0].blockchainMetadata.totalTransactionCount += 1;
    await worker.save();
  }
  
  return { wageRecord, upiTransaction, isAnomaly };
}

async function simulateTransactions() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');
    
    // Fetch 2 workers from database
    console.log('Fetching workers from database...');
    const workers = await Worker.find({ isActive: true })
      .limit(2)
      .populate('userId');
    
    if (workers.length < 2) {
      console.error('✗ Error: Need at least 2 workers in database');
      console.log('Please create workers first using the seed script or registration');
      await mongoose.disconnect();
      process.exit(1);
    }
    
    const worker1 = workers[0];
    const worker2 = workers[1];
    
    console.log('✓ Found workers:');
    console.log(`  Worker 1: ${worker1.name} (${worker1.idHash})`);
    console.log(`  Worker 2: ${worker2.name} (${worker2.idHash})\n`);
    
    // Generate transactions for Worker 1 (Normal Pattern)
    console.log('='.repeat(70));
    console.log('WORKER 1: Simulating NORMAL transaction pattern');
    console.log('='.repeat(70));
    
    let totalNormalTransactions = 0;
    let totalNormalAmount = 0;
    
    for (let month = 0; month < 12; month++) {
      const transactions = generateNormalMonthlyTransactions(worker1, month, false);
      
      console.log(`\nMonth ${12 - month} (${month} months ago):`);
      console.log(`  Generating ${transactions.length} transactions...`);
      
      for (const txData of transactions) {
        await createTransaction(txData);
        totalNormalAmount += txData.amount;
        totalNormalTransactions++;
      }
      
      console.log(`  ✓ Created ${transactions.length} transactions`);
    }
    
    console.log('\n' + '-'.repeat(70));
    console.log(`Worker 1 Summary:`);
    console.log(`  Total Transactions: ${totalNormalTransactions}`);
    console.log(`  Total Amount: ₹${totalNormalAmount.toFixed(2)}`);
    console.log(`  Average per Transaction: ₹${(totalNormalAmount / totalNormalTransactions).toFixed(2)}`);
    console.log(`  Pattern: NORMAL (Regular daily wages, verified payments)`);
    console.log('-'.repeat(70));
    
    // Generate transactions for Worker 2 (With Anomaly)
    console.log('\n' + '='.repeat(70));
    console.log('WORKER 2: Simulating pattern with ANOMALOUS large deposit');
    console.log('='.repeat(70));
    
    let totalAnomalousTransactions = 0;
    let totalAnomalousAmount = 0;
    let anomalyFound = false;
    
    for (let month = 0; month < 12; month++) {
      const isAnomalousMonth = (month === 6);
      const transactions = generateNormalMonthlyTransactions(worker2, month, true);
      
      console.log(`\nMonth ${12 - month} (${month} months ago):`);
      console.log(`  Generating ${transactions.length} transactions...`);
      
      for (const txData of transactions) {
        const result = await createTransaction(txData);
        totalAnomalousAmount += txData.amount;
        totalAnomalousTransactions++;
        
        if (result.isAnomaly) {
          anomalyFound = true;
          console.log(`  ⚠️  ANOMALY DETECTED!`);
          console.log(`     Amount: ₹${txData.amount.toFixed(2)}`);
          console.log(`     Time: ${txData.date.toLocaleString()}`);
          console.log(`     Source: ${txData.employer} (Unverified)`);
        }
      }
      
      console.log(`  ✓ Created ${transactions.length} transactions`);
    }
    
    console.log('\n' + '-'.repeat(70));
    console.log(`Worker 2 Summary:`);
    console.log(`  Total Transactions: ${totalAnomalousTransactions}`);
    console.log(`  Total Amount: ₹${totalAnomalousAmount.toFixed(2)}`);
    console.log(`  Average per Transaction: ₹${(totalAnomalousAmount / totalAnomalousTransactions).toFixed(2)}`);
    console.log(`  Pattern: ANOMALOUS (Contains 1 large unverified deposit)`);
    console.log(`  Anomaly Detected: ${anomalyFound ? 'YES ⚠️' : 'NO'}`);
    console.log('-'.repeat(70));
    
    // Final Summary
    console.log('\n' + '='.repeat(70));
    console.log('SIMULATION COMPLETE');
    console.log('='.repeat(70));
    console.log('\nSummary:');
    console.log(`✓ Worker 1: ${totalNormalTransactions} normal transactions created`);
    console.log(`✓ Worker 2: ${totalAnomalousTransactions} transactions (including anomaly) created`);
    console.log(`\nTotal Transactions Created: ${totalNormalTransactions + totalAnomalousTransactions}`);
    console.log(`Total Amount Processed: ₹${(totalNormalAmount + totalAnomalousAmount).toFixed(2)}`);
    console.log('\nNext Steps:');
    console.log('- Run anomaly detection model to identify suspicious patterns');
    console.log('- Check dashboard analytics for income distribution');
    console.log('- Review Worker 2\'s transaction history for the anomaly');
    console.log('='.repeat(70) + '\n');
    
    await mongoose.disconnect();
    console.log('✓ Disconnected from MongoDB');
    process.exit(0);
    
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    console.error(error);
    
    try {
      await mongoose.disconnect();
    } catch (e) {
      // Ignore
    }
    
    process.exit(1);
  }
}

// Run the simulation
simulateTransactions();
