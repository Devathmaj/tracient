# Blockchain Connection Guide

## ✅ STATUS: CONNECTED

Your backend is successfully connected to the Hyperledger Fabric blockchain running in Docker!

---

## 🔗 Connection Details

### Docker Containers Running
```
✓ orderer.example.com (ports: 7050, 7053, 9443)
✓ peer0.org1.example.com (ports: 7051, 9444)
✓ peer0.org2.example.com (ports: 9051, 9445)
✓ ca_org1 (ports: 7054, 17054)
✓ ca_org2 (ports: 8054, 18054)
✓ ca_orderer (ports: 9054, 19054)
✓ Chaincode: tracient_2.0
```

### Backend Configuration
**File:** `backend/.env`
```env
BLOCKCHAIN_ENABLED=true
FABRIC_ENABLED=true
FABRIC_CHANNEL=mychannel
FABRIC_CHAINCODE=tracient
FABRIC_MSP_ID=Org1MSP
FABRIC_PEER_ENDPOINT=localhost:7051
FABRIC_PEER_HOST_ALIAS=peer0.org1.example.com
FABRIC_CRYPTO_PATH=../blockchain/network/test-network/organizations
FABRIC_USER_NAME=Admin@org1.example.com
```

---

## 📡 How Frontend Connects

The frontend **does NOT connect directly** to Docker containers. Instead:

```
┌─────────────┐         HTTP/REST API         ┌─────────────┐
│             │  ←────────────────────────→   │             │
│  Frontend   │    http://localhost:5000/api  │   Backend   │
│ (React App) │                                │  (Node.js)  │
│             │                                │             │
└─────────────┘                                └──────┬──────┘
                                                      │ gRPC
                                                      │
                                               ┌──────▼──────┐
                                               │  Blockchain │
                                               │   (Docker)  │
                                               └─────────────┘
```

### Frontend Uses Backend API Endpoints

#### 1. **Check Blockchain Status**
```typescript
GET /api/blockchain/status
Headers: { Authorization: "Bearer <token>" }

Response:
{
  "success": true,
  "data": {
    "connected": true,
    "channel": "mychannel",
    "chaincode": "tracient",
    "mspId": "Org1MSP"
  }
}
```

#### 2. **Record Wage Payment on Blockchain**
```typescript
POST /api/wages
{
  "workerId": "...",
  "employerId": "...",
  "amount": 5000,
  "workDate": "2026-03-01"
}

// Backend automatically records this on blockchain
```

#### 3. **Get Blockchain Transaction History**
```typescript
GET /api/blockchain/transactions?workerId=<id>
Headers: { Authorization: "Bearer <token>" }

Response:
{
  "success": true,
  "data": {
    "transactions": [...]
  }
}
```

#### 4. **Sync Transaction to Blockchain**
```typescript
POST /api/blockchain/sync/:transactionId
Headers: { Authorization: "Bearer <token>" }

// Manually sync a MongoDB transaction to blockchain
```

---

## 🧪 Testing the Connection

### Test 1: Check if Backend is Running
```bash
curl http://localhost:5000/api/health
```

Expected: `200 OK`

### Test 2: Check Blockchain Status (Requires Auth Token)
```bash
# First, login to get token
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@tracient.in","password":"your-password"}'

# Then check blockchain status
curl http://localhost:5000/api/blockchain/status \
  -H "Authorization: Bearer <your-token>"
```

### Test 3: View Blockchain Testing Page (Frontend)
1. Start frontend: `cd frontend && npm run dev`
2. Login as admin
3. Navigate to: **Admin Dashboard → Blockchain Testing**
4. You should see: `✓ Connected` badge

---

## 🎯 Key Points

### ✅ Correct Setup
- Backend connects to blockchain via **Fabric Gateway SDK**
- Frontend connects to backend via **HTTP/REST API**
- Transactions flow: Frontend → Backend API → Blockchain

### ❌ Common Mistakes
- ❌ Frontend trying to connect directly to Docker containers
- ❌ Frontend trying to use Fabric SDK (not possible in browser)
- ❌ Wrong crypto paths in backend config
- ❌ Using wrong user identity

---

## 📝 Frontend Code Example

```typescript
// In your React component or service
import axios from 'axios';

const API_BASE = 'http://localhost:5000/api';

// Get auth token from localStorage/context
const token = localStorage.getItem('authToken');

// Check blockchain connection
const checkBlockchainStatus = async () => {
  try {
    const response = await axios.get(`${API_BASE}/blockchain/status`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Blockchain Status:', response.data);
    return response.data;
  } catch (error) {
    console.error('Blockchain connection error:', error);
  }
};

// Record a transaction
const recordWagePayment = async (wageData) => {
  try {
    const response = await axios.post(`${API_BASE}/wages`, wageData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    // Backend automatically syncs to blockchain
    return response.data;
  } catch (error) {
    console.error('Error recording wage:', error);
  }
};
```

---

## 🔧 Troubleshooting

### Backend can't connect to blockchain
```bash
# Check if Docker containers are running
docker ps

# Restart blockchain network
cd blockchain
./fresh-start.sh

# Restart backend
cd ../backend
npm start
```

### Frontend can't reach backend
```bash
# Check CORS settings in backend/.env
CORS_ORIGIN=http://localhost:3000,http://localhost:5173

# Verify frontend API base URL
# Should be: http://localhost:5000/api
```

### Permission errors
```bash
# Verify admin credentials exist
cd blockchain/network/test-network/organizations/peerOrganizations/org1.example.com/users/
ls -la
# Should show: Admin@org1.example.com
```

---

## 📚 Available Blockchain Routes

All routes are in: `backend/routes/blockchain.routes.js`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/blockchain/status` | Get connection status |
| GET | `/api/blockchain/health` | Network health check |
| GET | `/api/blockchain/transactions` | Get all transactions |
| POST | `/api/blockchain/sync/:id` | Sync transaction to chain |
| POST | `/api/blockchain/sync-all` | Sync all pending |
| GET | `/api/blockchain/stats` | Get sync statistics |
| POST | `/api/blockchain/test/:function` | Test chaincode function |

---

## ✅ Next Steps

1. **Frontend is already configured** - It uses the backend API endpoints
2. **Test the Blockchain Testing page** in Admin Dashboard
3. **Record test transactions** and verify they appear on blockchain
4. **Monitor logs**: `tail -f backend/logs/combined.log`

---

## 🎉 You're All Set!

Your system is now fully connected:
- ✅ Blockchain running in Docker
- ✅ Backend connected to blockchain
- ✅ Frontend connected to backend
- ✅ Ready to record immutable transactions!
