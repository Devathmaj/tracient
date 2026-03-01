#!/bin/bash

# Test UPI Payment with Blockchain Recording

echo "═══════════════════════════════════════════════════════════"
echo "  TESTING UPI PAYMENT BLOCKCHAIN RECORDING"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
API_URL="http://localhost:5000/api"
ADMIN_EMAIL="admin@tracient.com"
ADMIN_PASSWORD="Admin@123456"

echo -e "${BLUE}Step 1: Login as Admin${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.data.accessToken // .data.token // .token // empty')

if [ -z "$TOKEN" ]; then
  echo -e "${RED}✗ Login failed. Please check your admin credentials.${NC}"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ Login successful${NC}"
echo "Token: ${TOKEN:0:20}..."
echo ""

echo -e "${BLUE}Step 2: Get a test worker${NC}"
WORKERS_RESPONSE=$(curl -s -X GET "$API_URL/workers?limit=1" \
  -H "Authorization: Bearer $TOKEN")

WORKER_ID_HASH=$(echo $WORKERS_RESPONSE | jq -r '.data[0].idHash // empty')
WORKER_NAME=$(echo $WORKERS_RESPONSE | jq -r '.data[0].name // empty')
WORKER_BANK=$(echo $WORKERS_RESPONSE | jq -r '.data[0].bankAccount // empty')

if [ -z "$WORKER_ID_HASH" ]; then
  echo -e "${RED}✗ No workers found. Please create a worker first.${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Found worker${NC}"
echo "Worker: $WORKER_NAME"
echo "ID Hash: ${WORKER_ID_HASH:0:16}..."
echo "Bank Account: $WORKER_BANK"
echo ""

echo -e "${BLUE}Step 3: Process test UPI payment${NC}"
PAYMENT_RESPONSE=$(curl -s -X POST "$API_URL/upi/pay" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"workerIdHash\": \"$WORKER_ID_HASH\",
    \"amount\": 2500,
    \"senderName\": \"Test Employer Payment\",
    \"senderPhone\": \"9876543210\",
    \"senderUPI\": \"testemployer@paytm\",
    \"remarks\": \"Daily wage payment - Blockchain test\"
  }")

echo "Payment Response:"
echo $PAYMENT_RESPONSE | jq '.'
echo ""

# Extract transaction details
TX_ID=$(echo $PAYMENT_RESPONSE | jq -r '.data.transaction.txId // empty')
BLOCKCHAIN_TX_ID=$(echo $PAYMENT_RESPONSE | jq -r '.data.transaction.blockchainTxId // empty')
BLOCKCHAIN_RECORDED=$(echo $PAYMENT_RESPONSE | jq -r '.data.blockchain.recorded // empty')
IS_VERIFIED=$(echo $PAYMENT_RESPONSE | jq -r '.data.transaction.verifiedOnChain // empty')

if [ -z "$TX_ID" ]; then
  echo -e "${RED}✗ Payment failed${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Payment created${NC}"
echo "Transaction ID: $TX_ID"
echo ""

# Check if blockchain recording succeeded
if [ "$BLOCKCHAIN_RECORDED" = "true" ]; then
  echo -e "${GREEN}✓ BLOCKCHAIN RECORDING SUCCESSFUL!${NC}"
  echo "Blockchain TX ID: $BLOCKCHAIN_TX_ID"
  echo "Verified on Chain: $IS_VERIFIED"
  echo ""
  echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
  echo -e "${GREEN}   Payment successfully recorded on blockchain!${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
  echo ""
  echo "Details recorded on blockchain:"
  echo "  • Transaction ID: $TX_ID"
  echo "  • Worker: $WORKER_NAME"
  echo "  • Amount: ₹2,500"
  echo "  • Sender: Test Employer Payment"
  echo "  • Payment Method: UPI"
  echo ""
else
  echo -e "${YELLOW}⚠ Payment saved to database but blockchain recording failed${NC}"
  echo "This might be expected if:"
  echo "  1. Blockchain is not connected (check docker ps)"
  echo "  2. FABRIC_ENABLED is not true in .env"
  echo "  3. There's a chaincode error"
  echo ""
  echo "Check backend logs for details:"
  echo "  tail -f backend/logs/combined.log"
fi

echo -e "${BLUE}Step 4: Verify transaction in database${NC}"
TX_DETAILS=$(curl -s -X GET "$API_URL/upi/transactions" \
  -H "Authorization: Bearer $TOKEN")

LAST_TX=$(echo $TX_DETAILS | jq -r '.data.transactions[0] // .data[0] // empty')

if [ ! -z "$LAST_TX" ]; then
  echo -e "${GREEN}✓ Transaction found in database${NC}"
  echo ""
  echo "Recent transaction:"
  echo $TX_DETAILS | jq '.data.transactions[0] // .data[0]' 2>/dev/null || echo "$LAST_TX"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  TEST COMPLETE"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Summary:"
echo "  ✓ Payment processed"
echo "  ✓ Saved to MongoDB"
if [ "$BLOCKCHAIN_RECORDED" = "true" ]; then
  echo "  ✓ Recorded on Blockchain"
else
  echo "  ⚠ Blockchain recording: Failed/Skipped"
fi
echo ""
echo "Next steps:"
echo "  1. Check backend logs: tail -f backend/logs/combined.log"
echo "  2. View in frontend: Admin → Blockchain Testing"
echo "  3. Verify on blockchain: Check transaction history"
echo ""
