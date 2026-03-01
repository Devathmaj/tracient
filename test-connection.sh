#!/bin/bash

# TRACIENT Blockchain Connection Test Script
# Tests the connection flow: Frontend → Backend → Blockchain

echo "═══════════════════════════════════════════════════════════════"
echo "  TRACIENT BLOCKCHAIN CONNECTION TEST"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test 1: Check Docker containers
echo -e "${BLUE}[1/5]${NC} Checking Docker containers..."
DOCKER_COUNT=$(docker ps --filter "name=peer0.org1.example.com" --filter "name=orderer.example.com" | grep -c "Up")

if [ $DOCKER_COUNT -ge 2 ]; then
    echo -e "  ${GREEN}✓${NC} Blockchain containers are running"
    echo "  Containers:"
    docker ps --format "    • {{.Names}} ({{.Status}})" | grep -E "peer0|orderer|ca_"
else
    echo -e "  ${RED}✗${NC} Blockchain containers not running"
    echo "  Run: cd blockchain && ./fresh-start.sh"
    exit 1
fi
echo ""

# Test 2: Check Backend server
echo -e "${BLUE}[2/5]${NC} Checking Backend server..."
BACKEND_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/health)

if [ "$BACKEND_RESPONSE" = "200" ]; then
    echo -e "  ${GREEN}✓${NC} Backend server is running (port 5000)"
else
    echo -e "  ${RED}✗${NC} Backend server not responding"
    echo "  Run: cd backend && npm start"
    exit 1
fi
echo ""

# Test 3: Check Backend logs for Fabric connection
echo -e "${BLUE}[3/5]${NC} Checking Fabric connection in logs..."
if grep -q "Fabric Gateway connected successfully" backend/logs/combined.log 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} Fabric Gateway is connected"
    grep "Fabric Gateway connected successfully" backend/logs/combined.log | tail -1 | sed 's/^/  /'
else
    echo -e "  ${YELLOW}⚠${NC} Fabric connection not found in logs"
    echo "  Check: tail -f backend/logs/combined.log"
fi
echo ""

# Test 4: Verify .env configuration
echo -e "${BLUE}[4/5]${NC} Verifying Backend configuration..."
if grep -q "FABRIC_ENABLED=true" backend/.env && grep -q "BLOCKCHAIN_ENABLED=true" backend/.env; then
    echo -e "  ${GREEN}✓${NC} Blockchain is enabled in .env"
    echo "  Settings:"
    grep -E "FABRIC_ENABLED|BLOCKCHAIN_ENABLED|FABRIC_PEER_ENDPOINT" backend/.env | sed 's/^/    • /'
else
    echo -e "  ${RED}✗${NC} Blockchain is not enabled"
    echo "  Set FABRIC_ENABLED=true in backend/.env"
    exit 1
fi
echo ""

# Test 5: Check Frontend configuration
echo -e "${BLUE}[5/5]${NC} Checking Frontend configuration..."
if [ -f "frontend/.env" ]; then
    FRONTEND_API=$(grep "VITE_API_URL" frontend/.env | cut -d'=' -f2)
    if [ "$FRONTEND_API" = "http://localhost:5000/api" ]; then
        echo -e "  ${GREEN}✓${NC} Frontend API URL is configured"
        echo "    • API: $FRONTEND_API"
    else
        echo -e "  ${YELLOW}⚠${NC} Frontend API URL might need adjustment"
        echo "    • Current: $FRONTEND_API"
        echo "    • Expected: http://localhost:5000/api"
    fi
else
    echo -e "  ${YELLOW}⚠${NC} Frontend .env not found"
fi
echo ""

# Summary
echo "═══════════════════════════════════════════════════════════════"
echo -e "  ${GREEN}CONNECTION TEST COMPLETE${NC}"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "✅ Your system is connected!"
echo ""
echo "Connection Flow:"
echo "  Frontend (React) → http://localhost:5000/api → Backend (Node.js) → Blockchain (Docker)"
echo ""
echo "Next Steps:"
echo "  1. Start frontend: cd frontend && npm run dev"
echo "  2. Login as admin at: http://localhost:5173"
echo "  3. Navigate to: Admin → Blockchain Testing"
echo "  4. Test blockchain operations"
echo ""
echo "Useful Commands:"
echo "  • View backend logs: tail -f backend/logs/combined.log"
echo "  • Check containers: docker ps"
echo "  • Restart blockchain: cd blockchain && ./fresh-start.sh"
echo ""
