import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { 
  User, 
  IndianRupee, 
  Calendar, 
  CreditCard,
  Clock,
  CheckCircle,
  ArrowLeft,
  Search
} from 'lucide-react';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent,
  Button,
  Input,
  Select,
  Alert,
  Modal
} from '@/components/common';
import { showToast } from '@/components/common';
import { wageRecordSchema } from '@/utils/validators';
import { formatCurrency } from '@/utils/formatters';
import { z } from 'zod';
import api from '@/services/api';

type WageFormData = z.infer<typeof wageRecordSchema>;

interface WorkerOption {
  id: string;
  name: string;
  idHash?: string;
  maskedAadhaar?: string;
  phone?: string;
}

const RecordWage: React.FC = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [workersLoading, setWorkersLoading] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<WorkerOption | null>(null);
  const [showWorkerSearch, setShowWorkerSearch] = useState(false);
  const [transactionHash, setTransactionHash] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    control,
  } = useForm<WageFormData>({
    resolver: zodResolver(wageRecordSchema),
  });

  const amount = watch('amount');

  useEffect(() => {
    const fetchWorkers = async () => {
      try {
        setWorkersLoading(true);
        const response = await api.get('/employers/profile/workers/detailed', {
          params: { sortBy: 'name', order: 'asc' }
        }) as { data: { workers: WorkerOption[] } };
        setWorkers(response.data.workers || []);
      } catch (error) {
        showToast.error('Failed to load workers');
      } finally {
        setWorkersLoading(false);
      }
    };

    fetchWorkers();
  }, []);

  const filteredWorkers = workers.filter(
    (w) =>
      (w.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.idHash || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const onSubmit = async (data: WageFormData) => {
    if (!selectedWorker) {
      showToast.error('Please select a worker');
      return;
    }

    if (!selectedWorker.idHash) {
      showToast.error('Selected worker is missing an ID hash');
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.post('/wages', {
        workerIdHash: selectedWorker.idHash,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        description: data.description,
        jobType: data.workType,
        date: data.paymentDate
      }) as { data: { transaction?: { blockchainTxId?: string; referenceNumber?: string } } };

      const tx = response.data.transaction;
      setTransactionHash(tx?.blockchainTxId || tx?.referenceNumber || '');
      setShowSuccess(true);
      showToast.success('Wage record submitted to blockchain');
    } catch (error) {
      showToast.error('Failed to record wage');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewRecord = () => {
    setShowSuccess(false);
    setSelectedWorker(null);
    setTransactionHash('');
    reset();
  };

  const paymentMethods = [
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'upi', label: 'UPI' },
    { value: 'cash', label: 'Cash' },
    { value: 'cheque', label: 'Cheque' },
  ];

  const workTypes = [
    { value: 'daily_wage', label: 'Daily Wage' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'contract', label: 'Contract' },
    { value: 'overtime', label: 'Overtime' },
    { value: 'bonus', label: 'Bonus' },
  ];

  if (showSuccess) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardContent className="p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Wage Record Submitted!
            </h2>
            <p className="text-gray-500 mb-6">
              The wage record has been successfully submitted to the blockchain.
            </p>

            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Worker</p>
                  <p className="font-medium text-gray-900">{selectedWorker?.name}</p>
                </div>
                <div>
                  <p className="text-gray-500">Amount</p>
                  <p className="font-medium text-gray-900">{formatCurrency(amount || 0)}</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t">
                <p className="text-gray-500 text-xs mb-1">Transaction Hash</p>
                <p className="font-mono text-xs text-gray-700 break-all">{transactionHash}</p>
              </div>
            </div>

            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => navigate('/employer/payments')}>
                View All Payments
              </Button>
              <Button onClick={handleNewRecord}>
                Record Another
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Record Wage Payment</h1>
          <p className="text-gray-500 mt-1">Enter wage details to record on blockchain</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                {/* Worker Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Worker *
                  </label>
                  {selectedWorker ? (
                    <div className="flex items-center justify-between p-4 bg-primary-50 border border-primary-200 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                          <User className="h-5 w-5 text-primary-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{selectedWorker.name}</p>
                          <p className="text-sm text-gray-500">
                            ID: {selectedWorker.idHash || 'N/A'} • Aadhaar: {selectedWorker.maskedAadhaar || 'N/A'}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedWorker(null)}
                      >
                        Change
                      </Button>
                    </div>
                  ) : (
                    <div
                      onClick={() => setShowWorkerSearch(true)}
                      className="flex items-center gap-3 p-4 border-2 border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-primary-300 hover:bg-primary-50 transition-colors"
                    >
                      <Search className="h-5 w-5 text-gray-400" />
                      <span className="text-gray-500">Click to search and select a worker</span>
                    </div>
                  )}
                </div>

                {/* Amount & Date */}
                <div className="grid md:grid-cols-2 gap-6">
                  <Input
                    label="Amount (₹) *"
                    type="number"
                    placeholder="Enter amount"
                    leftIcon={<IndianRupee className="h-5 w-5" />}
                    error={errors.amount?.message}
                    {...register('amount', { valueAsNumber: true })}
                  />
                  <Input
                    label="Payment Date *"
                    type="date"
                    leftIcon={<Calendar className="h-5 w-5" />}
                    error={errors.paymentDate?.message}
                    {...register('paymentDate')}
                  />
                </div>

                {/* Payment Method & Work Type */}
                <div className="grid md:grid-cols-2 gap-6">
                  <Controller
                    name="paymentMethod"
                    control={control}
                    render={({ field }) => (
                      <Select
                        label="Payment Method *"
                        options={paymentMethods}
                        placeholder="Select payment method"
                        error={errors.paymentMethod?.message}
                        value={field.value || ''}
                        onChange={field.onChange}
                      />
                    )}
                  />
                  <Controller
                    name="workType"
                    control={control}
                    render={({ field }) => (
                      <Select
                        label="Work Type *"
                        options={workTypes}
                        placeholder="Select work type"
                        error={errors.workType?.message}
                        value={field.value || ''}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </div>

                {/* Hours & Reference */}
                <div className="grid md:grid-cols-2 gap-6">
                  <Input
                    label="Hours Worked"
                    type="number"
                    placeholder="Optional"
                    leftIcon={<Clock className="h-5 w-5" />}
                    {...register('hoursWorked', { valueAsNumber: true })}
                  />
                  <Input
                    label="Reference Number"
                    placeholder="Transaction/Receipt reference"
                    leftIcon={<CreditCard className="h-5 w-5" />}
                    {...register('reference')}
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description / Notes
                  </label>
                  <textarea
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                    rows={3}
                    placeholder="Add any additional notes..."
                    {...register('description')}
                  />
                </div>

                <Alert variant="info">
                  <div className="text-sm">
                    This wage record will be permanently stored on the Hyperledger Fabric blockchain and cannot be modified or deleted.
                  </div>
                </Alert>

                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                    Cancel
                  </Button>
                  <Button type="submit" isLoading={isLoading} disabled={!selectedWorker}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Submit to Blockchain
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Summary */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Payment Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-gray-500">Worker</span>
                  <span className="font-medium">{selectedWorker?.name || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Amount</span>
                  <span className="font-medium">{amount ? formatCurrency(amount) : '-'}</span>
                </div>
                <div className="border-t pt-4">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span className="text-primary-600">{amount ? formatCurrency(amount) : '₹0'}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">How it works</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center text-xs font-medium text-primary-600">1</div>
                  <p className="text-gray-600">Enter payment details and select worker</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center text-xs font-medium text-primary-600">2</div>
                  <p className="text-gray-600">Submit to record on blockchain</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center text-xs font-medium text-primary-600">3</div>
                  <p className="text-gray-600">Worker receives instant notification</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Worker Search Modal */}
      <Modal
        isOpen={showWorkerSearch}
        onClose={() => setShowWorkerSearch(false)}
        title="Select Worker"
        size="lg"
      >
        <div className="space-y-4">
          <Input
            placeholder="Search by name or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
          />
          <div className="max-h-96 overflow-y-auto space-y-2">
            {workersLoading && (
              <p className="text-center text-gray-500 py-6">Loading workers...</p>
            )}
            {filteredWorkers.map((worker) => (
              <div
                key={worker.id}
                onClick={() => {
                  setSelectedWorker(worker);
                  setShowWorkerSearch(false);
                  setSearchQuery('');
                }}
                className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:border-primary-300 hover:bg-primary-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                  <User className="h-5 w-5 text-gray-500" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{worker.name}</p>
                  <p className="text-sm text-gray-500">
                    ID: {worker.idHash || 'N/A'} • Aadhaar: {worker.maskedAadhaar || 'N/A'}
                  </p>
                </div>
              </div>
            ))}
            {!workersLoading && filteredWorkers.length === 0 && (
              <p className="text-center text-gray-500 py-8">No workers found</p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default RecordWage;
