package main

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/hyperledger/fabric-chaincode-go/v2/pkg/cid"
	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

// IAMEnabled controls whether IAM checks are enforced (set to false for testing without certificates)
const IAMEnabled = true

// Ensure cid package is used (for compiler)
var _ = cid.GetID

// SmartContract defines the Tracient wage ledger contract.
type SmartContract struct {
	contractapi.Contract
}

// ============================================================================
// DATA STRUCTURES
// ============================================================================

// WageRecord models a single wage transaction stored on ledger.
type WageRecord struct {
	DocType        string  `json:"docType"`
	WageID         string  `json:"wageId"`
	WorkerIDHash   string  `json:"workerIdHash"`
	EmployerIDHash string  `json:"employerIdHash"`
	Amount         float64 `json:"amount"`
	Currency       string  `json:"currency"`
	JobType        string  `json:"jobType,omitempty"`
	Timestamp      string  `json:"timestamp"`
	PolicyVersion  string  `json:"policyVersion"`
}

// UPITransaction models a UPI payment transaction for mock integration.
type UPITransaction struct {
	DocType          string  `json:"docType"`
	TxID             string  `json:"txId"`
	WorkerIDHash     string  `json:"workerIdHash"`
	Amount           float64 `json:"amount"`
	Currency         string  `json:"currency"`
	SenderName       string  `json:"senderName"`
	SenderPhone      string  `json:"senderPhone,omitempty"`
	TransactionRef   string  `json:"transactionRef,omitempty"`
	Timestamp        string  `json:"timestamp"`
	PaymentMethod    string  `json:"paymentMethod"` // "UPI"
	OnChainReference string  `json:"onChainReference,omitempty"`
}

// User represents a registered user in the system with role-based access.
type User struct {
	DocType     string `json:"docType"`
	UserID      string `json:"userId"`
	UserIDHash  string `json:"userIdHash"`
	Role        string `json:"role"` // worker, employer, government_official, bank_officer, auditor
	OrgID       string `json:"orgId"`
	Name        string `json:"name"`
	ContactHash string `json:"contactHash,omitempty"`
	Status      string `json:"status"` // active, inactive, suspended
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

// PovertyThreshold represents BPL/APL thresholds by state.
type PovertyThreshold struct {
	DocType   string  `json:"docType"`
	State     string  `json:"state"`
	Category  string  `json:"category"` // BPL, APL
	Amount    float64 `json:"amount"`
	SetBy     string  `json:"setBy"`
	UpdatedAt string  `json:"updatedAt"`
}

// Anomaly represents a flagged suspicious wage record.
type Anomaly struct {
	DocType      string  `json:"docType"`
	WageID       string  `json:"wageId"`
	AnomalyScore float64 `json:"anomalyScore"`
	Reason       string  `json:"reason"`
	FlaggedBy    string  `json:"flaggedBy"`
	Status       string  `json:"status"` // pending, reviewed, dismissed
	Timestamp    string  `json:"timestamp"`
}

// MonthlyIncome represents income breakdown for a month.
type MonthlyIncome struct {
	Month       string  `json:"month"` // Format: YYYY-MM
	TotalIncome float64 `json:"totalIncome"`
	WageCount   int     `json:"wageCount"`
}

// PovertyStatusResult represents the result of poverty status check.
type PovertyStatusResult struct {
	Status      string  `json:"status"` // BPL or APL
	TotalIncome float64 `json:"totalIncome"`
	Threshold   float64 `json:"threshold"`
	State       string  `json:"state"`
	Period      string  `json:"period"`
}

// ComplianceReport represents a generated compliance report.
type ComplianceReport struct {
	ReportType    string      `json:"reportType"`
	GeneratedAt   string      `json:"generatedAt"`
	StartDate     string      `json:"startDate"`
	EndDate       string      `json:"endDate"`
	TotalRecords  int         `json:"totalRecords"`
	TotalAmount   float64     `json:"totalAmount"`
	Data          interface{} `json:"data"`
}

// ============================================================================
// HELPER FUNCTIONS FOR DETERMINISTIC EXECUTION
// ============================================================================

// GetTxTimestampRFC3339 returns the transaction timestamp in RFC3339 format.
// This ensures deterministic execution across all peers since the timestamp
// comes from the transaction proposal, not from time.Now().
func GetTxTimestampRFC3339(ctx contractapi.TransactionContextInterface) string {
	timestamp, err := ctx.GetStub().GetTxTimestamp()
	if err != nil || timestamp == nil {
		// Fallback to current time if unable to get tx timestamp
		// This should only happen in mock/test environments
		return time.Now().UTC().Format(time.RFC3339)
	}
	return time.Unix(timestamp.GetSeconds(), int64(timestamp.GetNanos())).UTC().Format(time.RFC3339)
}

// ============================================================================
// INITIALIZATION FUNCTIONS
// ============================================================================

// InitLedger seeds the ledger with sample wage records for smoke tests.
// SECURITY: Only admin users from Org1MSP can initialize the ledger.
func (s *SmartContract) InitLedger(ctx contractapi.TransactionContextInterface) error {
	// IAM Check: Only admins can initialize ledger
	if IAMEnabled {
		identity, err := CheckAccess(ctx, "InitLedger")
		if err != nil {
			s.LogAccessDenied(ctx, "InitLedger", "ledger", "system", err.Error())
			return fmt.Errorf("access denied: %w", err)
		}
		s.LogAccessGranted(ctx, "InitLedger", "ledger", "system")
		fmt.Printf("[IAM] InitLedger called by %s (role: %s, MSP: %s)\n", identity.ID, identity.Role, identity.MSPID)
	}

	records := []WageRecord{
		{
			DocType:        "wage",
			WageID:         "WAGE001",
			WorkerIDHash:   "worker-001",
			EmployerIDHash: "employer-001",
			Amount:         1200.50,
			Currency:       "INR",
			JobType:        "construction",
			Timestamp:      time.Now().UTC().Format(time.RFC3339),
			PolicyVersion:  "2025-Q4",
		},
	}

	for _, record := range records {
		payload, err := json.Marshal(record)
		if err != nil {
			return fmt.Errorf("marshal wage record: %w", err)
		}
		if err := ctx.GetStub().PutState(record.WageID, payload); err != nil {
			return fmt.Errorf("put state: %w", err)
		}
	}

	// Initialize default poverty thresholds for common states
	defaultThresholds := []PovertyThreshold{
		{DocType: "threshold", State: "DEFAULT", Category: "BPL", Amount: 32000, SetBy: "system", UpdatedAt: time.Now().UTC().Format(time.RFC3339)},
		{DocType: "threshold", State: "DEFAULT", Category: "APL", Amount: 100000, SetBy: "system", UpdatedAt: time.Now().UTC().Format(time.RFC3339)},
	}

	for _, threshold := range defaultThresholds {
		key := fmt.Sprintf("THRESHOLD_%s_%s", threshold.State, threshold.Category)
		payload, err := json.Marshal(threshold)
		if err != nil {
			return fmt.Errorf("marshal threshold: %w", err)
		}
		if err := ctx.GetStub().PutState(key, payload); err != nil {
			return fmt.Errorf("put threshold state: %w", err)
		}
	}

	return nil
}

// ============================================================================
// WAGE RECORD FUNCTIONS
// ============================================================================

// RecordWage writes a new wage transaction onto the ledger.
// SECURITY: Only employers and admins with 'canRecordWage' permission can record wages.
func (s *SmartContract) RecordWage(ctx contractapi.TransactionContextInterface, wageID string, workerIDHash string, employerIDHash string, amount float64, currency string, jobType string, timestamp string, policyVersion string) error {
	// IAM Check
	if IAMEnabled {
		identity, err := CheckAccess(ctx, "RecordWage")
		if err != nil {
			s.LogAccessDenied(ctx, "RecordWage", wageID, "wage", err.Error())
			return fmt.Errorf("access denied: %w", err)
		}

		// Validate wage amount against employer's limit
		if err := ValidateWageAmountLimit(ctx, amount); err != nil {
			s.LogAccessDenied(ctx, "RecordWage", wageID, "wage", err.Error())
			return fmt.Errorf("wage limit exceeded: %w", err)
		}

		// Log the access
		s.LogAccessGranted(ctx, "RecordWage", wageID, "wage")
		fmt.Printf("[IAM] RecordWage by %s for worker %s, amount %.2f\n", identity.ID, workerIDHash, amount)
	}

	if wageID == "" {
		return fmt.Errorf("wageID is required")
	}
	if workerIDHash == "" {
		return fmt.Errorf("workerIDHash is required")
	}
	if employerIDHash == "" {
		return fmt.Errorf("employerIDHash is required")
	}
	if amount <= 0 {
		return fmt.Errorf("amount must be positive")
	}

	exists, err := s.WageExists(ctx, wageID)
	if err != nil {
		return err
	}
	if exists {
		return fmt.Errorf("wage record %s already exists", wageID)
	}

	if timestamp == "" {
		timestamp = time.Now().UTC().Format(time.RFC3339)
	}

	record := WageRecord{
		DocType:        "wage",
		WageID:         wageID,
		WorkerIDHash:   workerIDHash,
		EmployerIDHash: employerIDHash,
		Amount:         amount,
		Currency:       currency,
		JobType:        jobType,
		Timestamp:      timestamp,
		PolicyVersion:  policyVersion,
	}

	payload, err := json.Marshal(record)
	if err != nil {
		return fmt.Errorf("marshal wage record: %w", err)
	}

	// Emit event for wage recording
	if err := ctx.GetStub().SetEvent("WageRecorded", []byte(wageID)); err != nil {
		fmt.Printf("warning: failed to emit WageRecorded event: %v\n", err)
	}

	return ctx.GetStub().PutState(wageID, payload)
}

// ReadWage retrieves a wage record by its ID.
// SECURITY: All authenticated users can read wages.
func (s *SmartContract) ReadWage(ctx contractapi.TransactionContextInterface, wageID string) (*WageRecord, error) {
	// IAM Check
	if IAMEnabled {
		_, err := CheckAccess(ctx, "ReadWage")
		if err != nil {
			s.LogAccessDenied(ctx, "ReadWage", wageID, "wage", err.Error())
			return nil, fmt.Errorf("access denied: %w", err)
		}
		s.LogDataRead(ctx, "ReadWage", wageID, "wage")
	}

	payload, err := ctx.GetStub().GetState(wageID)
	if err != nil {
		return nil, fmt.Errorf("get state: %w", err)
	}
	if payload == nil {
		return nil, fmt.Errorf("wage record %s not found", wageID)
	}

	record := new(WageRecord)
	if err := json.Unmarshal(payload, record); err != nil {
		return nil, fmt.Errorf("unmarshal wage record: %w", err)
	}

	return record, nil
}

// WageExists checks whether a wage record is already stored.
// SECURITY: All authenticated users can check if a wage exists.
func (s *SmartContract) WageExists(ctx contractapi.TransactionContextInterface, wageID string) (bool, error) {
	// IAM Check
	if IAMEnabled {
		_, err := CheckAccess(ctx, "WageExists")
		if err != nil {
			s.LogAccessDenied(ctx, "WageExists", wageID, "wage", err.Error())
			return false, fmt.Errorf("access denied: %w", err)
		}
	}
	
	payload, err := ctx.GetStub().GetState(wageID)
	if err != nil {
		return false, fmt.Errorf("get state: %w", err)
	}
	return payload != nil, nil
}

// QueryWageHistory streams the state history for a given wage record.
// SECURITY: Authenticated users with clearance level 2+ can query history.
func (s *SmartContract) QueryWageHistory(ctx contractapi.TransactionContextInterface, wageID string) ([]*WageRecord, error) {
	// IAM Check
	if IAMEnabled {
		_, err := CheckAccess(ctx, "QueryWageHistory")
		if err != nil {
			s.LogAccessDenied(ctx, "QueryWageHistory", wageID, "wage", err.Error())
			return nil, fmt.Errorf("access denied: %w", err)
		}
		s.LogDataRead(ctx, "QueryWageHistory", wageID, "wage")
	}

	historyIter, err := ctx.GetStub().GetHistoryForKey(wageID)
	if err != nil {
		return nil, fmt.Errorf("get history: %w", err)
	}
	defer historyIter.Close()

	var history []*WageRecord
	for historyIter.HasNext() {
		record, err := historyIter.Next()
		if err != nil {
			return nil, fmt.Errorf("iterate history: %w", err)
		}

		if record.Value == nil {
			continue
		}

		entry := new(WageRecord)
		if err := json.Unmarshal(record.Value, entry); err != nil {
			return nil, fmt.Errorf("unmarshal history record: %w", err)
		}
		history = append(history, entry)
	}

	return history, nil
}

// QueryWagesByWorker retrieves all wage records for a specific worker (LevelDB compatible).
// SECURITY: Workers can only query their own wages; privileged roles can query any worker.
func (s *SmartContract) QueryWagesByWorker(ctx contractapi.TransactionContextInterface, workerIDHash string) ([]*WageRecord, error) {
	if workerIDHash == "" {
		return nil, fmt.Errorf("workerIDHash is required")
	}

	// IAM Check with self-access validation
	if IAMEnabled {
		identity, err := CheckAccess(ctx, "QueryWagesByWorker")
		if err != nil {
			s.LogAccessDenied(ctx, "QueryWagesByWorker", workerIDHash, "wage", err.Error())
			return nil, fmt.Errorf("access denied: %w", err)
		}

		// Check self-access for workers
		if err := CheckSelfAccess(identity, "QueryWagesByWorker", workerIDHash); err != nil {
			s.LogAccessDenied(ctx, "QueryWagesByWorker", workerIDHash, "wage", err.Error())
			return nil, fmt.Errorf("access denied: %w", err)
		}
		s.LogDataRead(ctx, "QueryWagesByWorker", workerIDHash, "wage")
	}

	// Use range query - iterate all keys that could be wages
	iterator, err := ctx.GetStub().GetStateByRange("", "")
	if err != nil {
		return nil, fmt.Errorf("get state range: %w", err)
	}
	defer iterator.Close()

	var wages []*WageRecord
	for iterator.HasNext() {
		queryResponse, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("iterate: %w", err)
		}

		// Skip non-wage records
		if !strings.HasPrefix(queryResponse.Key, "WAGE") {
			continue
		}

		var wage WageRecord
		if err := json.Unmarshal(queryResponse.Value, &wage); err != nil {
			continue // Skip records that don't unmarshal as wage
		}

		if wage.WorkerIDHash == workerIDHash {
			wages = append(wages, &wage)
		}
	}

	return wages, nil
}

// QueryWagesByEmployer retrieves all wage records paid by a specific employer (LevelDB compatible).
// SECURITY: Employers can only query their own wages; privileged roles can query any employer.
func (s *SmartContract) QueryWagesByEmployer(ctx contractapi.TransactionContextInterface, employerIDHash string) ([]*WageRecord, error) {
	if employerIDHash == "" {
		return nil, fmt.Errorf("employerIDHash is required")
	}

	// IAM Check with self-access validation
	if IAMEnabled {
		identity, err := CheckAccess(ctx, "QueryWagesByEmployer")
		if err != nil {
			s.LogAccessDenied(ctx, "QueryWagesByEmployer", employerIDHash, "wage", err.Error())
			return nil, fmt.Errorf("access denied: %w", err)
		}

		// Check self-access for employers
		if err := CheckSelfAccess(identity, "QueryWagesByEmployer", employerIDHash); err != nil {
			s.LogAccessDenied(ctx, "QueryWagesByEmployer", employerIDHash, "wage", err.Error())
			return nil, fmt.Errorf("access denied: %w", err)
		}
		s.LogDataRead(ctx, "QueryWagesByEmployer", employerIDHash, "wage")
	}

	iterator, err := ctx.GetStub().GetStateByRange("", "")
	if err != nil {
		return nil, fmt.Errorf("get state range: %w", err)
	}
	defer iterator.Close()

	var wages []*WageRecord
	for iterator.HasNext() {
		queryResponse, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("iterate: %w", err)
		}

		if !strings.HasPrefix(queryResponse.Key, "WAGE") {
			continue
		}

		var wage WageRecord
		if err := json.Unmarshal(queryResponse.Value, &wage); err != nil {
			continue
		}

		if wage.EmployerIDHash == employerIDHash {
			wages = append(wages, &wage)
		}
	}

	return wages, nil
}

// CalculateTotalIncome calculates total income for a worker within a date range.
// CalculateTotalIncome calculates total income for a worker within a date range.
// SECURITY: Workers can only calculate their own income; privileged roles can calculate any.
func (s *SmartContract) CalculateTotalIncome(ctx contractapi.TransactionContextInterface, workerIDHash string, startDate string, endDate string) (float64, error) {
	if workerIDHash == "" {
		return 0, fmt.Errorf("workerIDHash is required")
	}

	// IAM Check with self-access validation
	if IAMEnabled {
		identity, err := CheckAccess(ctx, "CalculateTotalIncome")
		if err != nil {
			s.LogAccessDenied(ctx, "CalculateTotalIncome", workerIDHash, "income", err.Error())
			return 0, fmt.Errorf("access denied: %w", err)
		}

		if err := CheckSelfAccess(identity, "CalculateTotalIncome", workerIDHash); err != nil {
			s.LogAccessDenied(ctx, "CalculateTotalIncome", workerIDHash, "income", err.Error())
			return 0, fmt.Errorf("access denied: %w", err)
		}
		s.LogDataRead(ctx, "CalculateTotalIncome", workerIDHash, "income")
	}

	wages, err := s.QueryWagesByWorker(ctx, workerIDHash)
	if err != nil {
		return 0, fmt.Errorf("query wages: %w", err)
	}

	var totalIncome float64
	for _, wage := range wages {
		// Parse timestamp and filter by date range if provided
		if startDate != "" && endDate != "" {
			wageTime, err := time.Parse(time.RFC3339, wage.Timestamp)
			if err != nil {
				continue // Skip records with invalid timestamps
			}

			start, err := time.Parse("2006-01-02", startDate)
			if err != nil {
				start, _ = time.Parse(time.RFC3339, startDate)
			}

			end, err := time.Parse("2006-01-02", endDate)
			if err != nil {
				end, _ = time.Parse(time.RFC3339, endDate)
			}

			if wageTime.Before(start) || wageTime.After(end) {
				continue
			}
		}

		totalIncome += wage.Amount
	}

	return totalIncome, nil
}

// BatchRecordWages records multiple wage transactions in a single call.
// SECURITY: Requires 'canRecordWage' and 'canBatchProcess' permissions with clearance level 6+.
func (s *SmartContract) BatchRecordWages(ctx contractapi.TransactionContextInterface, wagesJSON string) ([]string, error) {
	// IAM Check
	if IAMEnabled {
		identity, err := CheckAccess(ctx, "BatchRecordWages")
		if err != nil {
			s.LogAccessDenied(ctx, "BatchRecordWages", "batch", "wage", err.Error())
			return nil, fmt.Errorf("access denied: %w", err)
		}
		s.LogAccessGranted(ctx, "BatchRecordWages", "batch", "wage")
		fmt.Printf("[IAM] BatchRecordWages by %s\n", identity.ID)
	}

	var wages []struct {
		WageID         string  `json:"wageId"`
		WorkerIDHash   string  `json:"workerIdHash"`
		EmployerIDHash string  `json:"employerIdHash"`
		Amount         float64 `json:"amount"`
		Currency       string  `json:"currency"`
		JobType        string  `json:"jobType"`
		Timestamp      string  `json:"timestamp"`
		PolicyVersion  string  `json:"policyVersion"`
	}

	if err := json.Unmarshal([]byte(wagesJSON), &wages); err != nil {
		return nil, fmt.Errorf("unmarshal wages: %w", err)
	}

	var createdIDs []string
	for _, w := range wages {
		err := s.RecordWage(ctx, w.WageID, w.WorkerIDHash, w.EmployerIDHash, w.Amount, w.Currency, w.JobType, w.Timestamp, w.PolicyVersion)
		if err != nil {
			// Continue with other wages even if one fails
			continue
		}
		createdIDs = append(createdIDs, w.WageID)
	}

	return createdIDs, nil
}

// GetWorkerIncomeHistory retrieves monthly income breakdown for a worker.
// SECURITY: Workers can only view their own history; privileged roles can view any.
func (s *SmartContract) GetWorkerIncomeHistory(ctx contractapi.TransactionContextInterface, workerIDHash string, months int) ([]*MonthlyIncome, error) {
	if workerIDHash == "" {
		return nil, fmt.Errorf("workerIDHash is required")
	}

	// IAM Check with self-access validation
	if IAMEnabled {
		identity, err := CheckAccess(ctx, "GetWorkerIncomeHistory")
		if err != nil {
			s.LogAccessDenied(ctx, "GetWorkerIncomeHistory", workerIDHash, "income", err.Error())
			return nil, fmt.Errorf("access denied: %w", err)
		}

		if err := CheckSelfAccess(identity, "GetWorkerIncomeHistory", workerIDHash); err != nil {
			s.LogAccessDenied(ctx, "GetWorkerIncomeHistory", workerIDHash, "income", err.Error())
			return nil, fmt.Errorf("access denied: %w", err)
		}
		s.LogDataRead(ctx, "GetWorkerIncomeHistory", workerIDHash, "income")
	}

	if months <= 0 {
		months = 12 // Default to 12 months
	}

	wages, err := s.QueryWagesByWorker(ctx, workerIDHash)
	if err != nil {
		return nil, fmt.Errorf("query wages: %w", err)
	}

	// Group wages by month
	monthlyData := make(map[string]*MonthlyIncome)
	for _, wage := range wages {
		wageTime, err := time.Parse(time.RFC3339, wage.Timestamp)
		if err != nil {
			continue
		}

		monthKey := wageTime.Format("2006-01")
		if _, exists := monthlyData[monthKey]; !exists {
			monthlyData[monthKey] = &MonthlyIncome{
				Month:       monthKey,
				TotalIncome: 0,
				WageCount:   0,
			}
		}
		monthlyData[monthKey].TotalIncome += wage.Amount
		monthlyData[monthKey].WageCount++
	}

	// Convert to slice and sort
	var result []*MonthlyIncome
	for _, income := range monthlyData {
		result = append(result, income)
	}

	// Sort by month descending
	sort.Slice(result, func(i, j int) bool {
		return result[i].Month > result[j].Month
	})

	// Limit to requested months
	if len(result) > months {
		result = result[:months]
	}

	return result, nil
}

// ============================================================================
// UPI TRANSACTION FUNCTIONS
// ============================================================================

// RecordUPITransaction records a UPI payment transaction on the ledger.
// SECURITY: Requires 'canRecordUPI' permission; only employers, bank officers, and admins.
// Called during integration stage when a fake UPI payment is received.
func (s *SmartContract) RecordUPITransaction(ctx contractapi.TransactionContextInterface, txID string, workerIDHash string, amount float64, currency string, senderName string, senderPhone string, transactionRef string, paymentMethod string) (string, error) {
	// IAM Check
	if IAMEnabled {
		identity, err := CheckAccess(ctx, "RecordUPITransaction")
		if err != nil {
			s.LogAccessDenied(ctx, "RecordUPITransaction", txID, "upi", err.Error())
			return "", fmt.Errorf("access denied: %w", err)
		}
		s.LogAccessGranted(ctx, "RecordUPITransaction", txID, "upi")
		fmt.Printf("[IAM] RecordUPITransaction by %s for %s, amount %.2f\n", identity.ID, workerIDHash, amount)
	}

	if txID == "" {
		return "", fmt.Errorf("txID is required")
	}
	if workerIDHash == "" {
		return "", fmt.Errorf("workerIDHash is required")
	}
	if amount <= 0 {
		return "", fmt.Errorf("amount must be positive")
	}

	exists, err := s.UPITransactionExists(ctx, txID)
	if err != nil {
		return "", err
	}
	if exists {
		return "", fmt.Errorf("upi transaction %s already recorded", txID)
	}

	if paymentMethod == "" {
		paymentMethod = "UPI"
	}

	timestamp := time.Now().UTC().Format(time.RFC3339)

	tx := UPITransaction{
		DocType:          "upi",
		TxID:             txID,
		WorkerIDHash:     workerIDHash,
		Amount:           amount,
		Currency:         currency,
		SenderName:       senderName,
		SenderPhone:      senderPhone,
		TransactionRef:   transactionRef,
		Timestamp:        timestamp,
		PaymentMethod:    paymentMethod,
		OnChainReference: fmt.Sprintf("UPI_%s", txID), // Set the on-chain reference
	}

	payload, err := json.Marshal(tx)
	if err != nil {
		return "", fmt.Errorf("marshal upi transaction: %w", err)
	}

	// Store with prefix "UPI_" for easy filtering
	key := fmt.Sprintf("UPI_%s", txID)
	if err := ctx.GetStub().PutState(key, payload); err != nil {
		return "", fmt.Errorf("put state: %w", err)
	}

	// Emit event for external listeners (e.g., dashboard)
	if err := ctx.GetStub().SetEvent("UPITransactionRecorded", []byte(txID)); err != nil {
		fmt.Printf("warning: failed to emit event: %v\n", err)
	}

	return key, nil
}

// UPITransactionExists checks whether a UPI transaction has been recorded.
// SECURITY: All authenticated users can check if a UPI transaction exists.
func (s *SmartContract) UPITransactionExists(ctx contractapi.TransactionContextInterface, txID string) (bool, error) {
	// IAM Check
	if IAMEnabled {
		_, err := CheckAccess(ctx, "UPITransactionExists")
		if err != nil {
			s.LogAccessDenied(ctx, "UPITransactionExists", txID, "upi", err.Error())
			return false, fmt.Errorf("access denied: %w", err)
		}
	}
	
	key := fmt.Sprintf("UPI_%s", txID)
	payload, err := ctx.GetStub().GetState(key)
	if err != nil {
		return false, fmt.Errorf("get state: %w", err)
	}
	return payload != nil, nil
}

// ReadUPITransaction retrieves a UPI transaction record by ID.
// SECURITY: All authenticated users can read UPI transactions.
func (s *SmartContract) ReadUPITransaction(ctx contractapi.TransactionContextInterface, txID string) (*UPITransaction, error) {
	// IAM Check
	if IAMEnabled {
		_, err := CheckAccess(ctx, "ReadUPITransaction")
		if err != nil {
			s.LogAccessDenied(ctx, "ReadUPITransaction", txID, "upi", err.Error())
			return nil, fmt.Errorf("access denied: %w", err)
		}
		s.LogDataRead(ctx, "ReadUPITransaction", txID, "upi")
	}

	key := fmt.Sprintf("UPI_%s", txID)
	payload, err := ctx.GetStub().GetState(key)
	if err != nil {
		return nil, fmt.Errorf("get state: %w", err)
	}
	if payload == nil {
		return nil, fmt.Errorf("upi transaction %s not found", txID)
	}

	tx := new(UPITransaction)
	if err := json.Unmarshal(payload, tx); err != nil {
		return nil, fmt.Errorf("unmarshal upi transaction: %w", err)
	}

	return tx, nil
}

// QueryUPITransactionsByWorker retrieves all UPI transactions for a worker (LevelDB compatible).
// SECURITY: Workers can only query their own UPI transactions; privileged roles can query any.
func (s *SmartContract) QueryUPITransactionsByWorker(ctx contractapi.TransactionContextInterface, workerIDHash string) ([]*UPITransaction, error) {
	if workerIDHash == "" {
		return nil, fmt.Errorf("workerIDHash is required")
	}

	// IAM Check with self-access validation
	if IAMEnabled {
		identity, err := CheckAccess(ctx, "QueryUPITransactionsByWorker")
		if err != nil {
			s.LogAccessDenied(ctx, "QueryUPITransactionsByWorker", workerIDHash, "upi", err.Error())
			return nil, fmt.Errorf("access denied: %w", err)
		}

		if err := CheckSelfAccess(identity, "QueryUPITransactionsByWorker", workerIDHash); err != nil {
			s.LogAccessDenied(ctx, "QueryUPITransactionsByWorker", workerIDHash, "upi", err.Error())
			return nil, fmt.Errorf("access denied: %w", err)
		}
		s.LogDataRead(ctx, "QueryUPITransactionsByWorker", workerIDHash, "upi")
	}

	iterator, err := ctx.GetStub().GetStateByRange("UPI_", "UPI_~")
	if err != nil {
		return nil, fmt.Errorf("get state range: %w", err)
	}
	defer iterator.Close()

	var transactions []*UPITransaction
	for iterator.HasNext() {
		queryResponse, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("iterate: %w", err)
		}

		var tx UPITransaction
		if err := json.Unmarshal(queryResponse.Value, &tx); err != nil {
			continue
		}

		if tx.WorkerIDHash == workerIDHash {
			transactions = append(transactions, &tx)
		}
	}

	return transactions, nil
}

// ============================================================================
// IDENTITY & ACCESS MANAGEMENT FUNCTIONS
// ============================================================================

// RegisterUser registers a new user with role-based access control.
// SECURITY: Only government officials and admins with 'canRegisterUsers' permission from Org1MSP.
func (s *SmartContract) RegisterUser(ctx contractapi.TransactionContextInterface, userID string, userIDHash string, role string, orgID string, name string, contactHash string) error {
	// IAM Check
	if IAMEnabled {
		identity, err := CheckAccess(ctx, "RegisterUser")
		if err != nil {
			s.LogAccessDenied(ctx, "RegisterUser", userIDHash, "user", err.Error())
			return fmt.Errorf("access denied: %w", err)
		}
		s.LogAccessGranted(ctx, "RegisterUser", userIDHash, "user")
		fmt.Printf("[IAM] RegisterUser by %s: registering %s with role %s\n", identity.ID, userIDHash, role)
	}

	if userID == "" || userIDHash == "" {
		return fmt.Errorf("userID and userIDHash are required")
	}
	if role == "" {
		return fmt.Errorf("role is required")
	}

	// Validate role
	validRoles := map[string]bool{
		"worker":              true,
		"employer":            true,
		"government_official": true,
		"bank_officer":        true,
		"auditor":             true,
		"admin":               true,
	}
	if !validRoles[role] {
		return fmt.Errorf("invalid role: %s. Valid roles: worker, employer, government_official, bank_officer, auditor, admin", role)
	}

	// Check if user already exists
	key := fmt.Sprintf("USER_%s", userIDHash)
	existing, err := ctx.GetStub().GetState(key)
	if err != nil {
		return fmt.Errorf("get state: %w", err)
	}
	if existing != nil {
		return fmt.Errorf("user %s already registered", userIDHash)
	}

	timestamp := time.Now().UTC().Format(time.RFC3339)

	user := User{
		DocType:     "user",
		UserID:      userID,
		UserIDHash:  userIDHash,
		Role:        role,
		OrgID:       orgID,
		Name:        name,
		ContactHash: contactHash,
		Status:      "active",
		CreatedAt:   timestamp,
		UpdatedAt:   timestamp,
	}

	payload, err := json.Marshal(user)
	if err != nil {
		return fmt.Errorf("marshal user: %w", err)
	}

	if err := ctx.GetStub().PutState(key, payload); err != nil {
		return fmt.Errorf("put state: %w", err)
	}

	// Emit event
	if err := ctx.GetStub().SetEvent("UserRegistered", []byte(userIDHash)); err != nil {
		fmt.Printf("warning: failed to emit UserRegistered event: %v\n", err)
	}

	return nil
}

// GetUserProfile retrieves a user profile by hashed ID.
// SECURITY: Users can only view their own profile; privileged roles can view any.
func (s *SmartContract) GetUserProfile(ctx contractapi.TransactionContextInterface, userIDHash string) (*User, error) {
	if userIDHash == "" {
		return nil, fmt.Errorf("userIDHash is required")
	}

	// IAM Check with self-access validation
	if IAMEnabled {
		identity, err := CheckAccess(ctx, "GetUserProfile")
		if err != nil {
			s.LogAccessDenied(ctx, "GetUserProfile", userIDHash, "user", err.Error())
			return nil, fmt.Errorf("access denied: %w", err)
		}

		if err := CheckSelfAccess(identity, "GetUserProfile", userIDHash); err != nil {
			s.LogAccessDenied(ctx, "GetUserProfile", userIDHash, "user", err.Error())
			return nil, fmt.Errorf("access denied: %w", err)
		}
		s.LogDataRead(ctx, "GetUserProfile", userIDHash, "user")
	}

	key := fmt.Sprintf("USER_%s", userIDHash)
	payload, err := ctx.GetStub().GetState(key)
	if err != nil {
		return nil, fmt.Errorf("get state: %w", err)
	}
	if payload == nil {
		return nil, fmt.Errorf("user %s not found", userIDHash)
	}

	user := new(User)
	if err := json.Unmarshal(payload, user); err != nil {
		return nil, fmt.Errorf("unmarshal user: %w", err)
	}

	return user, nil
}

// UpdateUserStatus updates a user's status (requires government_official or admin role).
// SECURITY: Only government officials and admins with 'canManageUsers' permission from Org1MSP.
func (s *SmartContract) UpdateUserStatus(ctx contractapi.TransactionContextInterface, userIDHash string, status string, updatedBy string) error {
	if userIDHash == "" {
		return fmt.Errorf("userIDHash is required")
	}

	// IAM Check
	if IAMEnabled {
		identity, err := CheckAccess(ctx, "UpdateUserStatus")
		if err != nil {
			s.LogAccessDenied(ctx, "UpdateUserStatus", userIDHash, "user", err.Error())
			return fmt.Errorf("access denied: %w", err)
		}
		// Log as high-risk action
		s.LogAccess(ctx, EventUserUpdated, "UpdateUserStatus", userIDHash, "user", "success", fmt.Sprintf("status changed to %s", status))
		fmt.Printf("[IAM] UpdateUserStatus by %s: %s -> %s\n", identity.ID, userIDHash, status)
	}

	// Validate status
	validStatuses := map[string]bool{
		"active":    true,
		"inactive":  true,
		"suspended": true,
	}
	if !validStatuses[status] {
		return fmt.Errorf("invalid status: %s. Valid: active, inactive, suspended", status)
	}

	// Get existing user (skip internal permission check since we already verified)
	user, err := s.GetUserProfile(ctx, userIDHash)
	if err != nil {
		return err
	}

	user.Status = status
	user.UpdatedAt = time.Now().UTC().Format(time.RFC3339)

	payload, err := json.Marshal(user)
	if err != nil {
		return fmt.Errorf("marshal user: %w", err)
	}

	key := fmt.Sprintf("USER_%s", userIDHash)
	return ctx.GetStub().PutState(key, payload)
}

// VerifyUserRole checks if a user has the required role.
// SECURITY: All authenticated users can verify roles.
func (s *SmartContract) VerifyUserRole(ctx contractapi.TransactionContextInterface, userIDHash string, requiredRole string) (bool, error) {
	if userIDHash == "" {
		return false, fmt.Errorf("userIDHash is required")
	}

	// IAM Check
	if IAMEnabled {
		_, err := CheckAccess(ctx, "VerifyUserRole")
		if err != nil {
			s.LogAccessDenied(ctx, "VerifyUserRole", userIDHash, "user", err.Error())
			return false, fmt.Errorf("access denied: %w", err)
		}
	}

	user, err := s.GetUserProfile(ctx, userIDHash)
	if err != nil {
		return false, err
	}

	if user.Status != "active" {
		return false, fmt.Errorf("user is not active (status: %s)", user.Status)
	}

	return user.Role == requiredRole, nil
}

// UserExists checks whether a user is registered.
// SECURITY: All authenticated users can check if a user exists.
func (s *SmartContract) UserExists(ctx contractapi.TransactionContextInterface, userIDHash string) (bool, error) {
	// IAM Check
	if IAMEnabled {
		_, err := CheckAccess(ctx, "UserExists")
		if err != nil {
			s.LogAccessDenied(ctx, "UserExists", userIDHash, "user", err.Error())
			return false, fmt.Errorf("access denied: %w", err)
		}
	}
	
	key := fmt.Sprintf("USER_%s", userIDHash)
	payload, err := ctx.GetStub().GetState(key)
	if err != nil {
		return false, fmt.Errorf("get state: %w", err)
	}
	return payload != nil, nil
}

// ============================================================================
// POVERTY THRESHOLD FUNCTIONS
// ============================================================================

// SetPovertyThreshold sets BPL/APL threshold for a state (requires government_official role).
// SECURITY: Only government officials and admins with 'canUpdateThresholds' permission from Org1MSP.
func (s *SmartContract) SetPovertyThreshold(ctx contractapi.TransactionContextInterface, state string, category string, amountStr string, setBy string) error {
	if state == "" {
		return fmt.Errorf("state is required")
	}
	if category != "BPL" && category != "APL" {
		return fmt.Errorf("category must be 'BPL' or 'APL'")
	}

	// IAM Check
	if IAMEnabled {
		identity, err := CheckAccess(ctx, "SetPovertyThreshold")
		if err != nil {
			s.LogAccessDenied(ctx, "SetPovertyThreshold", fmt.Sprintf("%s_%s", state, category), "threshold", err.Error())
			return fmt.Errorf("access denied: %w", err)
		}
		s.LogAccess(ctx, EventThresholdChanged, "SetPovertyThreshold", fmt.Sprintf("%s_%s", state, category), "threshold", "success", fmt.Sprintf("amount: %s", amountStr))
		fmt.Printf("[IAM] SetPovertyThreshold by %s: %s %s = %s\n", identity.ID, state, category, amountStr)
	}

	amount, err := strconv.ParseFloat(amountStr, 64)
	if err != nil {
		return fmt.Errorf("invalid amount: %w", err)
	}
	if amount <= 0 {
		return fmt.Errorf("amount must be positive")
	}

	threshold := PovertyThreshold{
		DocType:   "threshold",
		State:     state,
		Category:  category,
		Amount:    amount,
		SetBy:     setBy,
		UpdatedAt: GetTxTimestampRFC3339(ctx),
	}

	payload, err := json.Marshal(threshold)
	if err != nil {
		return fmt.Errorf("marshal threshold: %w", err)
	}

	key := fmt.Sprintf("THRESHOLD_%s_%s", state, category)
	if err := ctx.GetStub().PutState(key, payload); err != nil {
		return fmt.Errorf("put state: %w", err)
	}

	// Emit event
	if err := ctx.GetStub().SetEvent("PovertyThresholdUpdated", []byte(fmt.Sprintf("%s_%s", state, category))); err != nil {
		fmt.Printf("warning: failed to emit event: %v\n", err)
	}

	return nil
}

// GetPovertyThreshold retrieves the poverty threshold for a state and category.
// SECURITY: All authenticated users can read thresholds.
func (s *SmartContract) GetPovertyThreshold(ctx contractapi.TransactionContextInterface, state string, category string) (*PovertyThreshold, error) {
	// IAM Check
	if IAMEnabled {
		_, err := CheckAccess(ctx, "GetPovertyThreshold")
		if err != nil {
			s.LogAccessDenied(ctx, "GetPovertyThreshold", fmt.Sprintf("%s_%s", state, category), "threshold", err.Error())
			return nil, fmt.Errorf("access denied: %w", err)
		}
		s.LogDataRead(ctx, "GetPovertyThreshold", fmt.Sprintf("%s_%s", state, category), "threshold")
	}

	if state == "" {
		state = "DEFAULT"
	}
	if category != "BPL" && category != "APL" {
		return nil, fmt.Errorf("category must be 'BPL' or 'APL'")
	}

	key := fmt.Sprintf("THRESHOLD_%s_%s", state, category)
	payload, err := ctx.GetStub().GetState(key)
	if err != nil {
		return nil, fmt.Errorf("get state: %w", err)
	}

	// If state-specific threshold not found, try DEFAULT
	if payload == nil && state != "DEFAULT" {
		key = fmt.Sprintf("THRESHOLD_DEFAULT_%s", category)
		payload, err = ctx.GetStub().GetState(key)
		if err != nil {
			return nil, fmt.Errorf("get default state: %w", err)
		}
	}

	if payload == nil {
		defaultAmount := 32000.0
		if category == "APL" {
			defaultAmount = 100000.0
		}

		return &PovertyThreshold{
			DocType:   "threshold",
			State:     "DEFAULT",
			Category:  category,
			Amount:    defaultAmount,
			SetBy:     "system-default",
			UpdatedAt: GetTxTimestampRFC3339(ctx),
		}, nil
	}

	threshold := new(PovertyThreshold)
	if err := json.Unmarshal(payload, threshold); err != nil {
		return nil, fmt.Errorf("unmarshal threshold: %w", err)
	}

	return threshold, nil
}

// CheckPovertyStatus determines if a worker is BPL or APL based on income.
// SECURITY: Workers can only check their own status; privileged roles can check any.
func (s *SmartContract) CheckPovertyStatus(ctx contractapi.TransactionContextInterface, workerIDHash string, state string, startDate string, endDate string) (*PovertyStatusResult, error) {
	if workerIDHash == "" {
		return nil, fmt.Errorf("workerIDHash is required")
	}

	// IAM Check with self-access validation
	if IAMEnabled {
		identity, err := CheckAccess(ctx, "CheckPovertyStatus")
		if err != nil {
			s.LogAccessDenied(ctx, "CheckPovertyStatus", workerIDHash, "poverty_status", err.Error())
			return nil, fmt.Errorf("access denied: %w", err)
		}

		if err := CheckSelfAccess(identity, "CheckPovertyStatus", workerIDHash); err != nil {
			s.LogAccessDenied(ctx, "CheckPovertyStatus", workerIDHash, "poverty_status", err.Error())
			return nil, fmt.Errorf("access denied: %w", err)
		}
		s.LogDataRead(ctx, "CheckPovertyStatus", workerIDHash, "poverty_status")
	}

	// Calculate total income
	totalIncome, err := s.CalculateTotalIncome(ctx, workerIDHash, startDate, endDate)
	if err != nil {
		return nil, fmt.Errorf("calculate income: %w", err)
	}

	// Get BPL threshold
	threshold, err := s.GetPovertyThreshold(ctx, state, "BPL")
	if err != nil {
		// Use default threshold if state-specific not found
		threshold = &PovertyThreshold{Amount: 32000} // Default annual BPL threshold
	}

	status := "APL"
	if totalIncome < threshold.Amount {
		status = "BPL"
	}

	period := "all-time"
	if startDate != "" && endDate != "" {
		period = fmt.Sprintf("%s to %s", startDate, endDate)
	}

	result := &PovertyStatusResult{
		Status:      status,
		TotalIncome: totalIncome,
		Threshold:   threshold.Amount,
		State:       state,
		Period:      period,
	}

	// Emit event for poverty status check
	eventData, _ := json.Marshal(map[string]interface{}{
		"workerIDHash": workerIDHash,
		"status":       status,
		"income":       totalIncome,
	})
	if err := ctx.GetStub().SetEvent("PovertyStatusChecked", eventData); err != nil {
		fmt.Printf("warning: failed to emit event: %v\n", err)
	}

	return result, nil
}

// ============================================================================
// ANOMALY DETECTION FUNCTIONS
// ============================================================================

// FlagAnomaly flags a wage record as suspicious (from AI model).
// SECURITY: Only auditors, government officials, and admins with 'canFlagAnomaly' permission.
func (s *SmartContract) FlagAnomaly(ctx contractapi.TransactionContextInterface, wageID string, anomalyScoreStr string, reason string, flaggedBy string) error {
	if wageID == "" {
		return fmt.Errorf("wageID is required")
	}

	// IAM Check
	if IAMEnabled {
		identity, err := CheckAccess(ctx, "FlagAnomaly")
		if err != nil {
			s.LogAccessDenied(ctx, "FlagAnomaly", wageID, "anomaly", err.Error())
			return fmt.Errorf("access denied: %w", err)
		}
		s.LogAccess(ctx, EventAnomalyFlagged, "FlagAnomaly", wageID, "anomaly", "success", fmt.Sprintf("score: %s, reason: %s", anomalyScoreStr, reason))
		fmt.Printf("[IAM] FlagAnomaly by %s: %s (score: %s)\n", identity.ID, wageID, anomalyScoreStr)
	}

	anomalyScore, err := strconv.ParseFloat(anomalyScoreStr, 64)
	if err != nil {
		return fmt.Errorf("invalid anomaly score: %w", err)
	}

	// Verify the wage exists
	exists, err := s.WageExists(ctx, wageID)
	if err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("wage record %s not found", wageID)
	}

	anomaly := Anomaly{
		DocType:      "anomaly",
		WageID:       wageID,
		AnomalyScore: anomalyScore,
		Reason:       reason,
		FlaggedBy:    flaggedBy,
		Status:       "pending",
		Timestamp:    time.Now().UTC().Format(time.RFC3339),
	}

	payload, err := json.Marshal(anomaly)
	if err != nil {
		return fmt.Errorf("marshal anomaly: %w", err)
	}

	key := fmt.Sprintf("ANOMALY_%s", wageID)
	if err := ctx.GetStub().PutState(key, payload); err != nil {
		return fmt.Errorf("put state: %w", err)
	}

	// Emit event for anomaly flagging
	if err := ctx.GetStub().SetEvent("AnomalyFlagged", []byte(wageID)); err != nil {
		fmt.Printf("warning: failed to emit event: %v\n", err)
	}

	return nil
}

// GetFlaggedWages retrieves all wages flagged above a threshold score.
// SECURITY: Only auditors, government officials, and admins.
func (s *SmartContract) GetFlaggedWages(ctx contractapi.TransactionContextInterface, thresholdStr string) ([]*Anomaly, error) {
	// IAM Check
	if IAMEnabled {
		_, err := CheckAccess(ctx, "GetFlaggedWages")
		if err != nil {
			s.LogAccessDenied(ctx, "GetFlaggedWages", "all", "anomaly", err.Error())
			return nil, fmt.Errorf("access denied: %w", err)
		}
		s.LogDataRead(ctx, "GetFlaggedWages", fmt.Sprintf("threshold:%s", thresholdStr), "anomaly")
	}

	threshold, err := strconv.ParseFloat(thresholdStr, 64)
	if err != nil {
		threshold = 0.5 // Default threshold
	}

	iterator, err := ctx.GetStub().GetStateByRange("ANOMALY_", "ANOMALY_~")
	if err != nil {
		return nil, fmt.Errorf("get state range: %w", err)
	}
	defer iterator.Close()

	var anomalies []*Anomaly
	for iterator.HasNext() {
		queryResponse, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("iterate: %w", err)
		}

		var anomaly Anomaly
		if err := json.Unmarshal(queryResponse.Value, &anomaly); err != nil {
			continue
		}

		if anomaly.AnomalyScore >= threshold {
			anomalies = append(anomalies, &anomaly)
		}
	}

	return anomalies, nil
}

// UpdateAnomalyStatus updates the status of a flagged anomaly.
// SECURITY: Only auditors, government officials, and admins with 'canReviewAnomaly' permission.
func (s *SmartContract) UpdateAnomalyStatus(ctx contractapi.TransactionContextInterface, wageID string, status string, reviewedBy string) error {
	if wageID == "" {
		return fmt.Errorf("wageID is required")
	}

	// IAM Check
	if IAMEnabled {
		identity, err := CheckAccess(ctx, "UpdateAnomalyStatus")
		if err != nil {
			s.LogAccessDenied(ctx, "UpdateAnomalyStatus", wageID, "anomaly", err.Error())
			return fmt.Errorf("access denied: %w", err)
		}
		s.LogAccess(ctx, EventAnomalyReviewed, "UpdateAnomalyStatus", wageID, "anomaly", "success", fmt.Sprintf("status: %s", status))
		fmt.Printf("[IAM] UpdateAnomalyStatus by %s: %s -> %s\n", identity.ID, wageID, status)
	}

	validStatuses := map[string]bool{
		"pending":   true,
		"reviewed":  true,
		"dismissed": true,
		"confirmed": true,
	}
	if !validStatuses[status] {
		return fmt.Errorf("invalid status: %s", status)
	}

	key := fmt.Sprintf("ANOMALY_%s", wageID)
	payload, err := ctx.GetStub().GetState(key)
	if err != nil {
		return fmt.Errorf("get state: %w", err)
	}
	if payload == nil {
		return fmt.Errorf("anomaly record for %s not found", wageID)
	}

	var anomaly Anomaly
	if err := json.Unmarshal(payload, &anomaly); err != nil {
		return fmt.Errorf("unmarshal anomaly: %w", err)
	}

	anomaly.Status = status
	anomaly.Timestamp = time.Now().UTC().Format(time.RFC3339)

	newPayload, err := json.Marshal(anomaly)
	if err != nil {
		return fmt.Errorf("marshal anomaly: %w", err)
	}

	return ctx.GetStub().PutState(key, newPayload)
}

// ============================================================================
// COMPLIANCE & REPORTING FUNCTIONS
// ============================================================================

// GenerateComplianceReport generates a compliance report for a date range.
// SECURITY: Only government officials, auditors, and admins with 'canGenerateReport' permission.
func (s *SmartContract) GenerateComplianceReport(ctx contractapi.TransactionContextInterface, startDate string, endDate string, reportType string) (*ComplianceReport, error) {
	// IAM Check
	if IAMEnabled {
		identity, err := CheckAccess(ctx, "GenerateComplianceReport")
		if err != nil {
			s.LogAccessDenied(ctx, "GenerateComplianceReport", reportType, "report", err.Error())
			return nil, fmt.Errorf("access denied: %w", err)
		}
		s.LogAccess(ctx, EventReportGenerated, "GenerateComplianceReport", reportType, "report", "success", fmt.Sprintf("period: %s to %s", startDate, endDate))
		fmt.Printf("[IAM] GenerateComplianceReport by %s: type=%s, period=%s to %s\n", identity.ID, reportType, startDate, endDate)
	}

	if reportType == "" {
		reportType = "wage_summary"
	}

	report := &ComplianceReport{
		ReportType:  reportType,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		StartDate:   startDate,
		EndDate:     endDate,
	}

	switch reportType {
	case "wage_summary":
		// Get all wages and calculate summary
		iterator, err := ctx.GetStub().GetStateByRange("WAGE", "WAGE~")
		if err != nil {
			return nil, fmt.Errorf("get state range: %w", err)
		}
		defer iterator.Close()

		var totalAmount float64
		var count int
		var wages []*WageRecord

		for iterator.HasNext() {
			queryResponse, err := iterator.Next()
			if err != nil {
				continue
			}

			var wage WageRecord
			if err := json.Unmarshal(queryResponse.Value, &wage); err != nil {
				continue
			}

			// Filter by date if provided
			if startDate != "" && endDate != "" {
				wageTime, err := time.Parse(time.RFC3339, wage.Timestamp)
				if err != nil {
					continue
				}
				start, _ := time.Parse("2006-01-02", startDate)
				end, _ := time.Parse("2006-01-02", endDate)
				if wageTime.Before(start) || wageTime.After(end) {
					continue
				}
			}

			totalAmount += wage.Amount
			count++
			wages = append(wages, &wage)
		}

		report.TotalRecords = count
		report.TotalAmount = totalAmount
		report.Data = wages

	case "fraud_flags":
		anomalies, err := s.GetFlaggedWages(ctx, "0")
		if err != nil {
			return nil, err
		}
		report.TotalRecords = len(anomalies)
		report.Data = anomalies

	case "employer_compliance":
		// Get wages grouped by employer
		iterator, err := ctx.GetStub().GetStateByRange("WAGE", "WAGE~")
		if err != nil {
			return nil, fmt.Errorf("get state range: %w", err)
		}
		defer iterator.Close()

		employerData := make(map[string]struct {
			TotalPaid float64 `json:"totalPaid"`
			WageCount int     `json:"wageCount"`
		})

		for iterator.HasNext() {
			queryResponse, err := iterator.Next()
			if err != nil {
				continue
			}

			var wage WageRecord
			if err := json.Unmarshal(queryResponse.Value, &wage); err != nil {
				continue
			}

			data := employerData[wage.EmployerIDHash]
			data.TotalPaid += wage.Amount
			data.WageCount++
			employerData[wage.EmployerIDHash] = data
		}

		report.TotalRecords = len(employerData)
		report.Data = employerData

	default:
		return nil, fmt.Errorf("unknown report type: %s", reportType)
	}

	return report, nil
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

func main() {
	chaincode, err := contractapi.NewChaincode(new(SmartContract))
	if err != nil {
		panic(fmt.Errorf("create chaincode: %w", err))
	}

	if err := chaincode.Start(); err != nil {
		panic(fmt.Errorf("start chaincode: %w", err))
	}
}
