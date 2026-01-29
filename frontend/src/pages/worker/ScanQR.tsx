import { useState, useRef, useEffect } from 'react';
import { Smartphone, QrCode, AlertCircle, CheckCircle, ArrowRight, Camera } from 'lucide-react';
import { Button, Card, Alert, Input } from '@/components/common';
import { toast } from 'react-hot-toast';
import api from '@/services/api';

interface PaymentDetails {
  workerHash: string;
  accountId: string;
  bankName: string;
  accountHolderName: string;
  accountNumberMasked: string;
}

interface DepositResponse {
  success: boolean;
  message: string;
  transactionId: string;
  amount: number;
  bankName: string;
  accountHolderName: string;
  newBalance: number;
  sender?: {
    name: string;
    debited: boolean;
    newBalance?: number;
    previousBalance?: number;
    note?: string;
  };
}

export default function ScanQRPage() {
  const [step, setStep] = useState<'input' | 'payment'>('input');
  const [qrToken, setQrToken] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [depositResult, setDepositResult] = useState<DepositResponse | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  // Auto-loaded sender account info
  const [myAccountInfo, setMyAccountInfo] = useState<any>(null);

  const amountInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Auto-load logged-in user's account info
  // State to track if user info is loading
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    const loadUserProfile = async () => {
      setLoadingProfile(true);
      try {
        const userStr = localStorage.getItem('user');
        const token = localStorage.getItem('accessToken');
        
        if (!userStr || !token) {
          console.log('No user or token found in localStorage');
          setLoadingProfile(false);
          return;
        }
        
        const user = JSON.parse(userStr);
        
        // Only fetch if user is a worker
        if (user.role !== 'worker') {
          console.log('User is not a worker:', user.role);
          setLoadingProfile(false);
          return;
        }
        
        // API interceptor returns response.data directly, which contains { success, message, data }
        const result: any = await api.get('/workers/profile');
        console.log('Loaded worker profile:', result);
        
        // The actual data is inside result.data (from successResponse wrapper)
        const profile = result.data || result;
        
        if (profile) {
          // Profile structure: bankAccounts at root level, idHash is under personalInfo.aadhaarHash
          const bankAccounts = profile.bankAccounts || [];
          const defaultAccount = bankAccounts.find((acc: any) => acc.isDefault) || bankAccounts[0];
          
          // Get idHash from personalInfo.aadhaarHash
          const idHash = profile.personalInfo?.aadhaarHash;
          // Get name from personalInfo.firstName + lastName
          const firstName = profile.personalInfo?.firstName || '';
          const lastName = profile.personalInfo?.lastName || '';
          const workerName = `${firstName} ${lastName}`.trim() || 'Unknown';
          // Get phone from personalInfo.phone
          const phone = profile.personalInfo?.phone || '';
          
          console.log('Extracted profile data:', { idHash, workerName, phone, defaultAccount });
          
          if (defaultAccount && idHash) {
            setMyAccountInfo({
              idHash: idHash,
              accountId: defaultAccount._id,
              workerName: workerName,
              phone: phone,
              balance: defaultAccount.balance || 0
            });
            console.log('MyAccountInfo set successfully');
          } else {
            console.warn('Missing defaultAccount or idHash:', { defaultAccount, idHash });
            if (!idHash) {
              toast.error('Could not load your account information. Please try refreshing the page.');
            }
          }
        }
      } catch (error: any) {
        console.error('Could not auto-load user profile:', error);
        toast.error('Failed to load your account information. Please refresh and try again.');
      } finally {
        setLoadingProfile(false);
      }
    };

    loadUserProfile();
  }, []);

  const startCamera = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setShowCamera(true);
      }
    } catch (error: any) {
      const errorMsg = error.name === 'NotAllowedError'
        ? 'Camera permission denied. Please allow camera access.'
        : 'Could not access camera. Please check if your device has a camera.';
      setCameraError(errorMsg);
      toast.error(errorMsg);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  };

  const handlePasteQR = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setQrToken(text);
        stopCamera();
        await verifyQRToken(text);
      }
    } catch (error) {
      toast.error('Could not read clipboard');
    }
  };

  const handleVerifyQR = async () => {
    if (!qrToken.trim()) {
      toast.error('Please enter a QR token');
      return;
    }

    await verifyQRToken(qrToken.trim());
  };

  const verifyQRToken = async (token: string) => {
    setLoading(true);
    try {
      console.log('Verifying QR token:', token.substring(0, 20) + '...');
      
      // API interceptor returns response.data directly, which contains { success, message, data }
      const result: any = await api.post('/workers/qr/verify', {
        token: token
      });

      console.log('QR verification response:', result);
      
      // The actual data is inside result.data (from successResponse wrapper)
      const responseData = result.data || result;
      
      setPaymentDetails(responseData);
      setStep('payment');
      setAmount('');
      setShowCamera(false);
      toast.success('QR code verified successfully!');

      setTimeout(() => amountInputRef.current?.focus(), 100);
    } catch (error: any) {
      console.error('Error verifying QR:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response,
        status: error.response?.status,
        token: token.substring(0, 20) + '...'
      });
      
      // More specific error messages
      if (error.response?.status === 401) {
        toast.error('Authentication error. This QR code cannot be verified. Please generate a new one.');
      } else if (error.message.includes('Invalid QR token')) {
        toast.error('Invalid QR code format. Please check and try again.');
      } else if (error.message.includes('expired')) {
        toast.error('QR code has expired. Please generate a new one.');
      } else if (error.message.includes('not found')) {
        toast.error('Worker or account not found. Please verify the QR code.');
      } else if (error.message.includes('Network') || error.code === 'ERR_NETWORK') {
        toast.error('Cannot connect to server. Please check your connection.');
      } else {
        toast.error(error.message || 'Failed to verify QR code. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMakePayment = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (!paymentDetails) {
      toast.error('Payment details missing');
      return;
    }
    
    // Check if profile is still loading
    if (loadingProfile) {
      toast.error('Loading your account information, please wait...');
      return;
    }
    
    // Check if user is logged in with account info
    if (!myAccountInfo) {
      toast.error('Please log in as a worker to make payments. Your account information could not be loaded.');
      return;
    }
    
    const paymentAmount = parseFloat(amount);
    
    // Check sufficient balance
    if (myAccountInfo.balance < paymentAmount) {
      toast.error(`Insufficient balance. Your balance: ₹${myAccountInfo.balance.toFixed(2)}, Required: ₹${paymentAmount.toFixed(2)}`);
      return;
    }

    setLoading(true);
    try {
      // Always include account deduction info
      const payload = {
        token: qrToken.trim(),
        amount: paymentAmount,
        payerName: myAccountInfo.workerName,
        payerPhone: myAccountInfo.phone,
        payerIdHash: myAccountInfo.idHash,
        payerAccountId: myAccountInfo.accountId
      };
      
      console.log('Making payment with account deduction:', {
        sender: myAccountInfo.workerName,
        amount: paymentAmount,
        senderBalance: myAccountInfo.balance
      });
      
      // API interceptor returns response.data directly, which contains { success, message, data }
      const result: any = await api.post('/workers/qr/deposit', payload);

      console.log('Deposit result:', result);
      
      // The actual data is inside result.data (from successResponse wrapper)
      const responseData = result.data || result;

      setDepositResult(responseData);
      
      // Update local balance
      setMyAccountInfo({
        ...myAccountInfo,
        balance: responseData.sender?.newBalance ?? (myAccountInfo.balance - paymentAmount)
      });
      
      toast.success('Payment successful!');
    } catch (error: any) {
      console.error('Error making payment:', error);
      console.error('Payment error details:', {
        message: error.message,
        response: error.response,
        status: error.response?.status,
        amount: amount
      });
      
      // Specific error handling for deposit
      if (error.response?.status === 401) {
        toast.error('Authentication error. Cannot process payment. Please generate a new QR code.');
      } else if (error.message.includes('Invalid QR token') || error.message.includes('expired')) {
        toast.error('QR code is invalid or expired. Please generate a new one.');
      } else if (error.message.includes('Insufficient')) {
        toast.error('Insufficient funds to process this payment.');
      } else if (error.message.includes('Network') || error.code === 'ERR_NETWORK') {
        toast.error('Cannot connect to server. Please check your connection and try again.');
      } else {
        toast.error(error.message || 'Payment failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleNewPayment = () => {
    setStep('input');
    setQrToken('');
    setAmount('');
    setPaymentDetails(null);
    setDepositResult(null);
    stopCamera();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(value);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Send Payment via QR Code</h1>
        <p className="text-gray-600">
          Scan or enter a QR token and make a payment to a worker's bank account
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="md:col-span-2">
          {/* Step 1: QR Input */}
          {step === 'input' && !depositResult && (
            <Card className="p-8 space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Step 1: Enter QR Token</h2>
                <p className="text-gray-600">
                  Scan with camera or paste the QR token from the worker's QR code
                </p>
              </div>

              {showCamera ? (
                // Camera View
                <div className="space-y-4">
                  <div className="relative bg-black rounded-lg overflow-hidden">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className="w-full aspect-square object-cover"
                    />

                    {/* Camera Controls */}
                    <div className="absolute inset-0 flex flex-col items-center justify-between p-4">
                      {/* Top */}
                      <div className="text-white text-center">
                        <p className="text-sm font-semibold">Scanning for QR Code</p>
                      </div>

                      {/* QR Frame */}
                      <div className="relative w-64 h-64 border-4 border-blue-500 rounded-lg">
                        <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500"></div>
                        <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500"></div>
                        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500"></div>
                        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500"></div>
                      </div>

                      {/* Bottom */}
                      <p className="text-white text-sm">Point camera at QR code</p>
                    </div>
                  </div>

                  {/* Camera Buttons */}
                  <div className="flex gap-3">
                    <Button
                      onClick={handlePasteQR}
                      variant="outline"
                      className="flex-1"
                    >
                      Paste from Clipboard
                    </Button>
                    <Button
                      onClick={stopCamera}
                      variant="outline"
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>

                  {cameraError && (
                    <Alert variant="error">
                      <AlertCircle size={20} />
                      {cameraError}
                    </Alert>
                  )}
                </div>
              ) : (
                // Manual Input
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      QR Token
                    </label>
                    <textarea
                      value={qrToken}
                      onChange={(e) => setQrToken(e.target.value)}
                      placeholder="Paste the QR token here..."
                      className="w-full h-32 px-4 py-3 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div className="flex gap-3">
                    {navigator.mediaDevices && (
                      <Button
                        onClick={startCamera}
                        variant="outline"
                        className="flex-1 flex items-center justify-center gap-2"
                      >
                        <Camera size={20} />
                        Scan Camera
                      </Button>
                    )}
                    <Button
                      onClick={handleVerifyQR}
                      isLoading={loading}
                      disabled={!qrToken.trim() || loading}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 flex items-center justify-center gap-2"
                    >
                      <QrCode size={20} />
                      Verify QR Code
                      <ArrowRight size={20} />
                    </Button>
                  </div>
                </div>
              )}

              {/* Info */}
              <Alert variant="info">
                <AlertCircle size={20} />
                <div>
                  <strong>How to use:</strong>
                  <ul className="mt-2 ml-4 space-y-1 text-sm list-disc">
                    <li>Ask the worker to generate their QR code</li>
                    <li>Scan with camera OR copy and paste the token</li>
                    <li>Verify the recipient details</li>
                    <li>Enter the payment amount</li>
                    <li>Complete the payment</li>
                  </ul>
                </div>
              </Alert>
            </Card>
          )}

          {/* Step 2: Payment Confirmation */}
          {step === 'payment' && paymentDetails && !depositResult && (
            <Card className="p-8 space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Step 2: Confirm Payment</h2>
                <p className="text-gray-600">
                  Review the details and enter the payment amount
                </p>
              </div>

              {/* Recipient Info */}
              <div className="p-6 bg-green-50 border-2 border-green-200 rounded-lg">
                <h3 className="font-semibold text-green-900 mb-4 flex items-center gap-2">
                  <CheckCircle size={20} />
                  QR Code Verified
                </h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-green-700 font-medium uppercase">Recipient Name</p>
                    <p className="text-lg font-semibold text-green-900">{paymentDetails.accountHolderName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-green-700 font-medium uppercase">Bank</p>
                    <p className="text-lg font-semibold text-green-900">{paymentDetails.bankName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-green-700 font-medium uppercase">Account Number</p>
                    <p className="text-lg font-mono text-green-900">{paymentDetails.accountNumberMasked}</p>
                  </div>
                </div>
              </div>

              {/* Amount Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Amount (₹)
                </label>
                <Input
                  ref={amountInputRef}
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  min="1"
                  step="1"
                  className="w-full text-lg font-semibold"
                />
                <p className="text-xs text-gray-500 mt-1">Minimum ₹1</p>
              </div>

              {/* Account Balance Display */}
              {myAccountInfo && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-900">
                    <strong>Your Balance:</strong> ₹{myAccountInfo.balance.toFixed(2)}
                  </p>
                  <p className="text-xs text-blue-800 mt-1">
                    {myAccountInfo.workerName} • Amount will be deducted from your account
                  </p>
                </div>
              )}
              
              {!myAccountInfo && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-900">
                    <strong>⚠️ Login Required</strong>
                  </p>
                  <p className="text-xs text-yellow-800 mt-1">
                    Please log in as a worker to make payments
                  </p>
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3">
                <Button
                  onClick={handleNewPayment}
                  variant="outline"
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleMakePayment}
                  isLoading={loading}
                  disabled={!amount || parseFloat(amount) <= 0 || loading || !myAccountInfo}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3"
                >
                  {!myAccountInfo ? 'Login Required' : `Send ₹${amount || '0'}`}
                </Button>
              </div>
            </Card>
          )}

          {/* Success State */}
          {depositResult && (
            <Card className="p-8 space-y-6">
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle size={40} className="text-green-600" />
                  </div>
                </div>
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Payment Successful!</h2>
                <p className="text-gray-600">Your payment has been processed</p>
              </div>

              {/* Receipt */}
              <div className="p-6 bg-gray-50 rounded-lg space-y-4 border-2 border-gray-200">
                <h3 className="font-semibold text-gray-900 text-lg">Transaction Receipt</h3>

                <div className="space-y-3 divide-y divide-gray-300">
                  <div className="flex justify-between pt-3">
                    <span className="text-gray-600">Transaction ID</span>
                    <span className="font-mono text-sm text-gray-900">{depositResult.transactionId}</span>
                  </div>
                  
                  {/* Sender Info */}
                  {depositResult.sender && (
                    <>
                      <div className="flex justify-between pt-3">
                        <span className="text-gray-600">Sender</span>
                        <span className="font-semibold text-gray-900">{depositResult.sender.name}</span>
                      </div>
                      {depositResult.sender.debited && (
                        <>
                          <div className="flex justify-between pt-3">
                            <span className="text-gray-600">Amount Debited</span>
                            <span className="font-bold text-red-600">-{formatCurrency(depositResult.amount)}</span>
                          </div>
                          <div className="flex justify-between pt-3">
                            <span className="text-gray-600">Sender New Balance</span>
                            <span className="font-semibold text-gray-900">{formatCurrency(depositResult.sender.newBalance ?? 0)}</span>
                          </div>
                        </>
                      )}
                      {!depositResult.sender.debited && depositResult.sender.note && (
                        <div className="pt-3">
                          <span className="text-xs text-gray-500 italic">{depositResult.sender.note}</span>
                        </div>
                      )}
                    </>
                  )}
                  
                  <div className="flex justify-between pt-3">
                    <span className="text-gray-600">Recipient</span>
                    <span className="font-semibold text-gray-900">{depositResult.accountHolderName}</span>
                  </div>
                  <div className="flex justify-between pt-3">
                    <span className="text-gray-600">Bank Account</span>
                    <span className="font-semibold text-gray-900">{depositResult.bankName}</span>
                  </div>
                  <div className="flex justify-between pt-3">
                    <span className="text-gray-600">Amount Credited</span>
                    <span className="font-bold text-lg text-green-600">+{formatCurrency(depositResult.amount)}</span>
                  </div>
                </div>
              </div>

              {/* Next Steps */}
              <Alert variant="success">
                <CheckCircle size={20} />
                <span>
                  Transaction complete! Amount debited from your account and credited to recipient.
                </span>
              </Alert>

              {/* Button */}
              <Button
                onClick={handleNewPayment}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3"
              >
                Send Another Payment
              </Button>
            </Card>
          )}
        </div>

        {/* Sidebar: Steps */}
        <div>
          <Card className="p-6 sticky top-6">
            <h3 className="font-bold text-gray-900 mb-4">Payment Steps</h3>
            <div className="space-y-4">
              {[
                { num: 1, label: 'Enter QR Token', active: step === 'input' && !depositResult },
                { num: 2, label: 'Confirm Details', active: step === 'payment' && !depositResult },
                { num: 3, label: 'Payment Complete', active: !!depositResult }
              ].map((item, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 pb-4 ${
                    idx < 2 ? 'border-b border-gray-200' : ''
                  }`}
                >
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                      item.active
                        ? 'bg-blue-600 text-white'
                        : depositResult && idx < 2
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {item.num}
                  </div>
                  <div>
                    <p
                      className={`font-medium ${
                        item.active ? 'text-blue-600' : 'text-gray-700'
                      }`}
                    >
                      {item.label}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Info Box */}
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <div className="flex gap-2 mb-2">
                <Smartphone size={20} className="text-blue-600 flex-shrink-0" />
                <p className="text-sm font-semibold text-blue-900">Mock UPI System</p>
              </div>
              <p className="text-xs text-blue-800">
                This demonstrates a UPI payment flow with camera QR scanning support.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
