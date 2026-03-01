#!/bin/bash
# TRACIENT Environment Setup Script
# Source this file: source ./set-env.sh

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
export PATH="${SCRIPT_DIR}/network/bin:$PATH"
export FABRIC_CFG_PATH="${SCRIPT_DIR}/network/config"
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="${SCRIPT_DIR}/network/test-network/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="${SCRIPT_DIR}/network/test-network/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
export CORE_PEER_ADDRESS=localhost:7051

echo "[OK] TRACIENT environment configured for Org1"
echo "  CORE_PEER_ADDRESS: $CORE_PEER_ADDRESS"
echo "  CORE_PEER_LOCALMSPID: $CORE_PEER_LOCALMSPID"
