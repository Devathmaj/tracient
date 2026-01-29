import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CreditCard, Copy, Check, AlertCircle, Send } from 'lucide-react';
import { useWorkerBankAccounts } from '@/hooks/useWorkerBankAccounts';
import { Button, Card, Alert } from '@/components/common';
import { toast } from 'react-hot-toast';
import QRCode from 'react-qr-code';
import api from '@/services/api';

interface QRGenerationResponse {
  token: string;
  verifyUrl: string;
  accountId: string;
  accountNumber: string;
  bankName: string;
  expiresAt: string;
}

export default function GenerateQRPage() {
  const { accounts, loading: accountsLoading } = useWorkerBankAccounts();
  const navigate = useNavigate();
  
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrData, setQrData] = useState<QRGenerationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Auto-select first account
  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0]._id);
    }
  }, [accounts, selectedAccountId]);

  const handleGenerateQR = async () => {
    if (!selectedAccountId) {
      toast.error('Please select a bank account');
      return;
    }

    setLoading(true);
    try {
      // API interceptor returns response.data directly, which contains { success, message, data }
      const result: any = await api.post('/workers/qr/generate', {
        accountId: selectedAccountId
      });

      console.log('QR generation result:', result);
      
      // The actual data is inside result.data (from successResponse wrapper)
      const responseData = result.data || result;
      
      setQrData(responseData);
      setQrToken(responseData.token);
      toast.success('QR code generated successfully!');
    } catch (error: any) {
      console.error('Error generating QR:', error);
      toast.error(error.message || 'Failed to generate QR code');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToken = () => {
    if (qrToken) {
      navigator.clipboard.writeText(qrToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Token copied to clipboard');
    }
  };

  const handleRegenerateQR = () => {
    setQrToken(null);
    setQrData(null);
  };

  const selectedAccount = accounts.find(acc => acc._id === selectedAccountId);

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Generate Payment QR Code</h1>
            <p className="text-gray-600">
              Select a bank account and generate a QR code for receiving payments
            </p>
          </div>
          <Button
            onClick={() => navigate('/scan-qr')}
            className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
          >
            <Send size={20} />
            Pay Someone
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Selection & Generation Panel */}
        <div className="space-y-6">
          {/* Bank Account Selection */}
          <Card className="p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Select Bank Account</h2>
            
            {accountsLoading ? (
              <p className="text-gray-600">Loading accounts...</p>
            ) : accounts.length === 0 ? (
              <Alert variant="warning">
                <AlertCircle size={20} />
                <span>No bank accounts found. Please add a bank account first.</span>
              </Alert>
            ) : (
              <div className="space-y-3">
                {accounts.map(account => (
                  <label
                    key={account._id}
                    className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition ${
                      selectedAccountId === account._id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="account"
                      value={account._id}
                      checked={selectedAccountId === account._id}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <div className="ml-4 flex-1">
                      <p className="font-semibold text-gray-900">{account.bankName}</p>
                      <p className="text-sm text-gray-600">{account.accountNumberMasked}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {account.accountHolderName}
                      </p>
                    </div>
                    {account.isDefault && (
                      <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full">
                        Default
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </Card>

          {/* Account Details */}
          {selectedAccount && !qrToken && (
            <Card className="p-6 bg-blue-50 border-blue-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Account Details</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-600 font-medium uppercase">Bank</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedAccount.bankName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 font-medium uppercase">Account Holder</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedAccount.accountHolderName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 font-medium uppercase">Account Number</p>
                  <p className="text-lg font-mono text-gray-900">{selectedAccount.accountNumberMasked}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 font-medium uppercase">Current Balance</p>
                  <p className="text-lg font-semibold text-green-600">₹{selectedAccount.balance?.toFixed(2) || '0.00'}</p>
                </div>
              </div>
            </Card>
          )}

          {/* Generate Button */}
          {!qrToken && (
            <Button
              onClick={handleGenerateQR}
              disabled={!selectedAccountId || loading || accountsLoading}
              isLoading={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 flex items-center justify-center gap-2"
            >
              <CreditCard size={20} />
              Generate QR Code
              <ArrowRight size={20} />
            </Button>
          )}
        </div>

        {/* QR Code Display Panel */}
        <div>
          {qrToken && qrData ? (
            <Card className="p-8 text-center space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Your Payment QR Code</h3>
                <p className="text-sm text-gray-600">
                  Share this QR code to receive payments in your {qrData.bankName} account
                </p>
              </div>

              {/* QR Code */}
              <div className="flex justify-center p-6 bg-white rounded-lg border-2 border-gray-200">
                <QRCode
                  value={qrToken}
                  size={256}
                  level="H"
                />
              </div>

              {/* Account Info under QR */}
              <div className="p-4 bg-gray-50 rounded-lg text-left">
                <p className="text-sm text-gray-600 mb-2"><strong>Bank:</strong> {qrData.bankName}</p>
                <p className="text-sm text-gray-600"><strong>Account:</strong> {qrData.accountNumber}</p>
              </div>

              {/* Token Info */}
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-left space-y-2">
                <p className="text-xs text-yellow-800 font-semibold uppercase">Token (for development)</p>
                <div className="flex gap-2">
                  <code className="flex-1 text-xs bg-white p-2 rounded font-mono text-gray-700 overflow-auto">
                    {qrToken.substring(0, 30)}...
                  </code>
                  <button
                    onClick={handleCopyToken}
                    className="px-3 py-2 bg-white border border-gray-300 rounded hover:bg-gray-50 transition"
                  >
                    {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                  </button>
                </div>
              </div>

              {/* Instructions */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-left">
                <h4 className="font-semibold text-blue-900 mb-3">How to use:</h4>
                <ol className="space-y-2 text-sm text-blue-900">
                  <li><strong>1.</strong> Share this QR code with payers</li>
                  <li><strong>2.</strong> They scan it with their UPI app</li>
                  <li><strong>3.</strong> They enter the amount and send payment</li>
                  <li><strong>4.</strong> Money gets deposited to this account</li>
                </ol>
              </div>

              {/* Regenerate Button */}
              <Button
                onClick={handleRegenerateQR}
                variant="outline"
                className="w-full"
              >
                Generate for Different Account
              </Button>
            </Card>
          ) : (
            <Card className="p-8 h-full flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <CreditCard size={64} className="mx-auto text-gray-300 mb-4" />
                <p className="text-gray-600 text-lg font-medium">
                  Select an account and click "Generate QR Code" to get started
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Info Section */}
      <div className="mt-12 p-6 bg-blue-50 border border-blue-200 rounded-xl">
        <h3 className="text-lg font-semibold text-blue-900 mb-3">📌 About Payment QR Codes</h3>
        <ul className="grid md:grid-cols-2 gap-4 text-sm text-blue-800">
          <li className="flex gap-2">
            <span className="mt-1">•</span>
            <span>Generate a unique QR code for each of your bank accounts</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1">•</span>
            <span>QR codes are secured with cryptographic tokens</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1">•</span>
            <span>Share different QR codes for different payers</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1">•</span>
            <span>All payments are recorded on the blockchain</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
