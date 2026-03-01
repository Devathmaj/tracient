# Frontend-Backend-Blockchain Integration Examples

## Quick Reference: How to Use Blockchain from Frontend

### 1. Check Blockchain Status

```typescript
// In any React component
import { getBlockchainStatus } from '@/services/blockchainService';

const MyComponent = () => {
  const [blockchainStatus, setBlockchainStatus] = useState(null);

  useEffect(() => {
    const checkStatus = async () => {
      const status = await getBlockchainStatus();
      setBlockchainStatus(status);
      console.log('Blockchain connected:', status.connected);
    };
    checkStatus();
  }, []);

  return (
    <div>
      {blockchainStatus?.connected ? (
        <Badge variant="success">✓ Blockchain Connected</Badge>
      ) : (
        <Badge variant="error">✗ Disconnected</Badge>
      )}
    </div>
  );
};
```

---

### 2. Record Wage Payment (Auto-syncs to Blockchain)

```typescript
// When recording a new wage payment
import api from '@/services/api';

const recordWage = async (wageData) => {
  try {
    // This automatically records to both MongoDB AND blockchain
    const response = await api.post('/wages', {
      workerId: wageData.workerId,
      employerId: wageData.employerId,
      amount: wageData.amount,
      workDate: wageData.workDate,
      workType: wageData.workType
    });

    console.log('Wage recorded:', response.data);
    // Backend automatically syncs to blockchain in the background
    
    return response.data;
  } catch (error) {
    console.error('Error recording wage:', error);
  }
};
```

---

### 3. Verify Transaction on Blockchain

```typescript
import { verifyTransaction } from '@/services/blockchainService';

const VerifyButton = ({ transactionId }) => {
  const [verified, setVerified] = useState(false);
  const [details, setDetails] = useState(null);

  const handleVerify = async () => {
    const result = await verifyTransaction(transactionId);
    setVerified(result.verified);
    setDetails(result.data);
    
    if (result.verified) {
      alert('✓ Transaction verified on blockchain!');
    } else {
      alert('✗ Transaction not found on blockchain');
    }
  };

  return (
    <button onClick={handleVerify}>
      🔍 Verify on Blockchain
    </button>
  );
};
```

---

### 4. Get Worker's Wage History from Blockchain

```typescript
import { getWorkerWageHistory } from '@/services/blockchainService';

const WorkerWageHistory = ({ workerIdHash }) => {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const fetchHistory = async () => {
      const data = await getWorkerWageHistory(workerIdHash);
      setHistory(data.wages || []);
    };
    fetchHistory();
  }, [workerIdHash]);

  return (
    <div>
      <h3>Blockchain Wage History</h3>
      {history.map(wage => (
        <div key={wage.wageId}>
          <p>Amount: ₹{wage.amount}</p>
          <p>Date: {new Date(wage.timestamp).toLocaleDateString()}</p>
          <p>Employer: {wage.employerIdHash}</p>
        </div>
      ))}
    </div>
  );
};
```

---

### 5. Manual Blockchain Sync (Admin Only)

```typescript
import { syncPendingTransactions, forceSyncTransaction } from '@/services/blockchainService';

// Sync all pending transactions
const syncAll = async () => {
  const result = await syncPendingTransactions();
  console.log(`Synced ${result.processed} transactions`);
};

// Force sync a specific transaction
const syncSpecific = async (wageId) => {
  const result = await forceSyncTransaction(wageId);
  if (result.success) {
    alert('Transaction synced to blockchain');
  }
};
```

---

### 6. Get Blockchain Analytics Dashboard

```typescript
import { getBlockchainAnalytics } from '@/services/blockchainService';

const BlockchainDashboard = () => {
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      const data = await getBlockchainAnalytics();
      setAnalytics(data);
    };
    fetchAnalytics();
  }, []);

  return (
    <div className="grid grid-cols-4 gap-4">
      <StatCard 
        title="Total Transactions" 
        value={analytics?.totalTransactions} 
      />
      <StatCard 
        title="Synced to Blockchain" 
        value={analytics?.syncedTransactions} 
      />
      <StatCard 
        title="Pending Sync" 
        value={analytics?.pendingSync} 
      />
      <StatCard 
        title="Failed Syncs" 
        value={analytics?.failedSync} 
      />
    </div>
  );
};
```

---

### 7. Check Worker's Poverty Status (APL/BPL)

```typescript
import { checkPovertyStatus } from '@/services/blockchainService';

const PovertyStatusChecker = ({ workerIdHash }) => {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const checkStatus = async () => {
      const result = await checkPovertyStatus(workerIdHash);
      setStatus(result);
      console.log('Poverty Status:', result);
      // result.isAPL = true/false
      // result.annualIncome = number
      // result.lastUpdated = timestamp
    };
    checkStatus();
  }, [workerIdHash]);

  return (
    <div>
      {status?.isAPL ? (
        <Badge variant="success">APL - Above Poverty Line</Badge>
      ) : (
        <Badge variant="warning">BPL - Below Poverty Line</Badge>
      )}
      <p>Annual Income: ₹{status?.annualIncome?.toLocaleString()}</p>
    </div>
  );
};
```

---

### 8. Complete Blockchain Testing Page Example

Check the existing implementation at:
**`frontend/src/pages/admin/BlockchainTesting.tsx`**

This page includes:
- ✅ Connection status indicator
- ✅ Network health monitoring
- ✅ Transaction sync controls
- ✅ Sync statistics
- ✅ Manual sync options
- ✅ Blockchain analytics

To access:
1. Login as admin
2. Navigate to: **Admin Dashboard → Blockchain**
3. Test all blockchain operations

---

## Available Services

### Import from blockchainService.ts:

```typescript
import { 
  getBlockchainStatus,      // Get connection status
  getBlockchainHealth,       // Check network health
  getSyncStatus,             // Get sync status
  verifyTransaction,         // Verify single transaction
  getWorkerWageHistory,      // Get worker's wage history
  checkPovertyStatus,        // Check APL/BPL status
  syncPendingTransactions,   // Sync all pending
  retrySyncFailures,         // Retry failed syncs
  forceSyncTransaction,      // Force sync single transaction
  updateThresholds,          // Update BPL/APL thresholds
  getBlockchainAnalytics     // Get analytics dashboard
} from '@/services/blockchainService';
```

---

## API Endpoints (Backend)

All blockchain endpoints are protected and require authentication:

```typescript
// Add auth token to requests
const token = localStorage.getItem('authToken');
api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
```

### Available Endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/blockchain/status` | Connection status |
| GET | `/api/blockchain/health` | Network health |
| GET | `/api/blockchain/sync/status` | Sync status |
| GET | `/api/blockchain/transaction/:id` | Get transaction |
| GET | `/api/blockchain/worker/:hash/history` | Worker history |
| GET | `/api/blockchain/worker/:hash/poverty-status` | APL/BPL status |
| GET | `/api/blockchain/analytics` | Analytics data |
| POST | `/api/blockchain/sync` | Sync pending |
| POST | `/api/blockchain/sync/retry` | Retry failed |
| POST | `/api/blockchain/sync/force/:id` | Force sync |
| PUT | `/api/blockchain/thresholds` | Update thresholds |

---

## Environment Variables

### Frontend (.env)
```env
VITE_API_URL=http://localhost:5000/api
```

### Backend (.env)
```env
# Blockchain enabled
BLOCKCHAIN_ENABLED=true
FABRIC_ENABLED=true

# Network configuration
FABRIC_CHANNEL=mychannel
FABRIC_CHAINCODE=tracient
FABRIC_MSP_ID=Org1MSP
FABRIC_PEER_ENDPOINT=localhost:7051
FABRIC_PEER_HOST_ALIAS=peer0.org1.example.com

# Credentials path
FABRIC_CRYPTO_PATH=../blockchain/network/test-network/organizations
FABRIC_USER_NAME=Admin@org1.example.com
```

---

## Common Patterns

### 1. Error Handling

```typescript
try {
  const result = await getBlockchainStatus();
  if (result.connected) {
    // Blockchain is available
  } else {
    // Fallback to database only
    console.warn('Blockchain not connected, using database');
  }
} catch (error) {
  console.error('Blockchain error:', error);
  // Handle gracefully - show message to user
}
```

### 2. Loading States

```typescript
const [loading, setLoading] = useState(false);
const [data, setData] = useState(null);

const fetchData = async () => {
  setLoading(true);
  try {
    const result = await getWorkerWageHistory(workerId);
    setData(result);
  } catch (error) {
    console.error(error);
  } finally {
    setLoading(false);
  }
};
```

### 3. Real-time Updates

```typescript
// Poll for updates every 30 seconds
useEffect(() => {
  const interval = setInterval(async () => {
    const status = await getBlockchainStatus();
    setConnectionStatus(status);
  }, 30000);

  return () => clearInterval(interval);
}, []);
```

---

## Testing

### Quick Test Flow:

1. **Check Connection**
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
        http://localhost:5000/api/blockchain/status
   ```

2. **Record Test Wage** (via frontend form or API)
   ```typescript
   POST /api/wages
   {
     "workerId": "...",
     "employerId": "...",
     "amount": 5000
   }
   ```

3. **Verify it synced to blockchain**
   ```typescript
   GET /api/blockchain/transaction/:transactionId
   ```

4. **Check worker's history**
   ```typescript
   GET /api/blockchain/worker/:workerIdHash/history
   ```

---

## Troubleshooting

### Frontend can't connect to backend
```bash
# Check CORS in backend/.env
CORS_ORIGIN=http://localhost:3000,http://localhost:5173
```

### Transactions not syncing
```bash
# Check backend logs
tail -f backend/logs/combined.log

# Manually trigger sync
POST /api/blockchain/sync
```

### Blockchain status shows disconnected
```bash
# Restart blockchain network
cd blockchain
./fresh-start.sh

# Restart backend
cd ../backend
pkill -f "node.*server.js"
npm start
```

---

## Summary

✅ **Frontend connects to backend API** - NOT directly to Docker  
✅ **Backend handles all blockchain operations** - via Fabric SDK  
✅ **Transactions auto-sync** - when created through `/api/wages`  
✅ **Manual sync available** - for admin users  
✅ **Fully tested** - BlockchainTesting page in admin dashboard  

**The connection is already set up and working!** 🎉
