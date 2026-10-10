'use client';

import React, { useEffect, useState } from 'react';
import { Dialog, Badge, Button } from '@hrms/ui';
import { leaveApi } from '../../lib/api-client';
import {
  History,
  AlertCircle,
  RefreshCw,
  User,
  ShieldCheck,
  Calendar,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';

interface BalanceLedgerModalProps {
  accountId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const BalanceLedgerModal: React.FC<BalanceLedgerModalProps> = ({
  accountId,
  isOpen,
  onClose,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [ledgerData, setLedgerData] = useState<any>(null);

  const fetchLedger = async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await leaveApi.getAccountLedger(accountId);
      if (res?.data) {
        setLedgerData(res.data);
      } else {
        setError(res?.message || 'Failed to load ledger transactions.');
      }
    } catch (err: any) {
      setError(err?.message || 'Error fetching account ledger.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && accountId) {
      fetchLedger();
    } else {
      setLedgerData(null);
      setError(null);
    }
  }, [isOpen, accountId]);

  if (!isOpen) return null;

  const getTransactionBadge = (type: string) => {
    switch (type) {
      case 'OPENING_GRANT':
      case 'ACCRUAL':
        return (
          <Badge variant="success" className="gap-1">
            <ArrowUpRight className="h-3 w-3" /> {type.replace('_', ' ')}
          </Badge>
        );
      case 'MANUAL_ADJUSTMENT':
        return (
          <Badge variant="purple" className="gap-1">
            <ShieldCheck className="h-3 w-3" /> MANUAL ADJUSTMENT
          </Badge>
        );
      case 'CONSUMPTION':
        return (
          <Badge variant="danger" className="gap-1">
            <ArrowDownLeft className="h-3 w-3" /> CONSUMPTION
          </Badge>
        );
      case 'RESERVATION':
        return <Badge variant="warning">RESERVATION (PENDING)</Badge>;
      case 'RELEASE_RESERVATION':
        return <Badge variant="outline">RELEASE RESERVATION</Badge>;
      case 'REVERSAL':
        return <Badge variant="info">REVERSAL (CANCELLED)</Badge>;
      case 'EXPIRY':
        return <Badge variant="danger">EXPIRY / LAPSE</Badge>;
      default:
        return <Badge variant="default">{type}</Badge>;
    }
  };

  const account = ledgerData?.account;
  const transactions = ledgerData?.transactions || [];

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Authoritative Balance Ledger Audit"
      maxWidth="xl"
    >
      <div className="space-y-6">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-stone-500">
            <RefreshCw className="h-7 w-7 animate-spin text-amber-600 mb-3" />
            <p className="text-sm font-medium">Loading immutable transaction ledger...</p>
          </div>
        ) : error ? (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        ) : account ? (
          <>
            {/* Account Metadata Card */}
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-stone-200">
                <div>
                  <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                    <User className="h-4 w-4 text-stone-500" />
                    {account.employee?.displayName}
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-stone-200 text-stone-700">
                      {account.employee?.employeeCode}
                    </span>
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    {account.employee?.employment?.department?.name || 'Unassigned Department'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center px-2.5 py-1 rounded text-xs font-bold text-white shadow-sm"
                    style={{ backgroundColor: account.leaveType?.color || '#d97706' }}
                  >
                    {account.leaveType?.name} ({account.leaveType?.code})
                  </span>
                  <Badge variant="outline">Leave Year: {account.leaveYear}</Badge>
                </div>
              </div>

              {/* Balances Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                <div className="bg-white p-3 rounded-lg border border-stone-200">
                  <span className="text-[11px] font-semibold text-stone-500 uppercase block">
                    Opening
                  </span>
                  <span className="text-base font-bold text-stone-800">
                    {account.openingBalance}d
                  </span>
                </div>
                <div className="bg-white p-3 rounded-lg border border-stone-200">
                  <span className="text-[11px] font-semibold text-stone-500 uppercase block">
                    Allocated
                  </span>
                  <span className="text-base font-bold text-stone-800">
                    {account.allocatedBalance}d
                  </span>
                </div>
                <div className="bg-white p-3 rounded-lg border border-stone-200">
                  <span className="text-[11px] font-semibold text-stone-500 uppercase block">
                    Used
                  </span>
                  <span className="text-base font-bold text-rose-700">{account.usedBalance}d</span>
                </div>
                <div className="bg-white p-3 rounded-lg border border-stone-200">
                  <span className="text-[11px] font-semibold text-stone-500 uppercase block">
                    Pending
                  </span>
                  <span className="text-base font-bold text-amber-700">
                    {account.pendingBalance}d
                  </span>
                </div>
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 col-span-2 sm:col-span-1">
                  <span className="text-[11px] font-bold text-amber-900 uppercase block">
                    Closing Available
                  </span>
                  <span className="text-lg font-black text-amber-800">
                    {account.closingBalance}d
                  </span>
                </div>
              </div>
            </div>

            {/* Transactions Table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-stone-800 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-stone-500" />
                  Immutable Audit Ledger ({transactions.length} entries)
                </h4>
                <Button size="sm" variant="outline" onClick={fetchLedger}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
                </Button>
              </div>

              {transactions.length === 0 ? (
                <div className="text-center py-8 text-sm text-stone-500 bg-stone-50 border border-stone-200 rounded-lg">
                  No transactions posted yet.
                </div>
              ) : (
                <div className="overflow-x-auto border border-stone-200 rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-100 text-stone-700 font-semibold border-b border-stone-200">
                      <tr>
                        <th className="py-2.5 px-3">Timestamp</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3 text-right">Amount</th>
                        <th className="py-2.5 px-3 text-right">Balance After</th>
                        <th className="py-2.5 px-3">Reason / Context</th>
                        <th className="py-2.5 px-3">Actor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 bg-white">
                      {transactions.map((tx: any) => {
                        const amt = Number(tx.amount);
                        const isPositive = amt > 0;
                        return (
                          <tr key={tx.id} className="hover:bg-stone-50">
                            <td className="py-2.5 px-3 font-mono text-[11px] text-stone-600 whitespace-nowrap">
                              {new Date(tx.createdAt).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {getTransactionBadge(tx.transactionType)}
                            </td>
                            <td
                              className={`py-2.5 px-3 text-right font-bold whitespace-nowrap ${
                                tx.transactionType === 'CONSUMPTION' ||
                                tx.transactionType === 'EXPIRY' ||
                                amt < 0
                                  ? 'text-rose-700'
                                  : 'text-emerald-700'
                              }`}
                            >
                              {isPositive ? `+${amt}` : amt}d
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-stone-800 whitespace-nowrap">
                              {tx.balanceAfter}d
                            </td>
                            <td
                              className="py-2.5 px-3 text-stone-700 max-w-xs truncate"
                              title={tx.reason}
                            >
                              {tx.reason}
                            </td>
                            <td className="py-2.5 px-3 text-stone-600 whitespace-nowrap">
                              {tx.actor?.displayName || tx.actor?.email || 'System'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : null}

        <div className="flex justify-end pt-2 border-t border-stone-200">
          <Button variant="outline" onClick={onClose}>
            Close Ledger
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
