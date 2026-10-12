'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AppShell } from '../../layouts/AppShell';
import { useAuth } from '../../context/AuthContext';
import { documentsApi } from '../../lib/api-client';
import {
  EmployeeDocumentItem,
  EmployeeDocumentStats,
  DocumentCategory,
  DocumentVerificationStatus,
} from '@hrms/types';
import { Button, Card, Skeleton } from '@hrms/ui';
import {
  FolderLock,
  Upload,
  Download,
  Eye,
  Trash2,
  FileText,
  FileCheck2,
  FileX2,
  Clock,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Search,
  Filter,
  RefreshCw,
  X,
  FileCode,
  Calendar,
  ShieldCheck,
  Building2,
  ExternalLink,
} from 'lucide-react';

export default function DocumentsPage() {
  const { user } = useAuth();

  // Active view tab
  const [activeTab, setActiveTab] = useState<'my' | 'policies'>('my');

  // Employee Documents State
  const [documents, setDocuments] = useState<EmployeeDocumentItem[]>([]);
  const [stats, setStats] = useState<EmployeeDocumentStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Filters State
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Company Policies State
  const [policies, setPolicies] = useState<any[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(false);

  // Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>('GOVT_ID');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadNumber, setUploadNumber] = useState('');
  const [uploadIssueDate, setUploadIssueDate] = useState('');
  const [uploadExpiryDate, setUploadExpiryDate] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadValidationErr, setUploadValidationErr] = useState<string | null>(null);

  // Preview Modal State
  const [previewItem, setPreviewItem] = useState<EmployeeDocumentItem | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Delete Confirmation Modal
  const [deletingItem, setDeletingItem] = useState<EmployeeDocumentItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load employee personal documents
  const loadMyDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await documentsApi.getMyDocuments();
      setDocuments(res.items || []);
      setStats(res.stats || null);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve your documents.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load company policies
  const loadPolicies = useCallback(async () => {
    setPoliciesLoading(true);
    try {
      const data = await documentsApi.getCompanyPolicies();
      setPolicies(data || []);
    } catch {
      // Non-fatal fallback
    } finally {
      setPoliciesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMyDocuments();
    loadPolicies();
  }, [loadMyDocuments, loadPolicies]);

  // Handle file selection in upload modal with client-side safety validation
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadValidationErr(null);
    if (!e.target.files || e.target.files.length === 0) {
      setUploadFile(null);
      return;
    }
    const file = e.target.files[0];

    // File size validation (10 MB max)
    if (file.size > 10 * 1024 * 1024) {
      setUploadValidationErr('File size exceeds maximum permitted limit of 10 MB.');
      setUploadFile(null);
      return;
    }

    // Extension validation
    const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.docx', '.doc'];
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      setUploadValidationErr(
        'Invalid format. Supported file formats: PDF, JPG, PNG, WEBP, DOCX, DOC.',
      );
      setUploadFile(null);
      return;
    }

    setUploadFile(file);
    if (!uploadTitle) {
      // Pre-fill title without extension
      const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      setUploadTitle(baseName.replace(/[_-]/g, ' '));
    }
  };

  // Submit document upload
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadValidationErr('Please select a document file to upload.');
      return;
    }
    if (!uploadTitle.trim()) {
      setUploadValidationErr('Please provide a descriptive document title.');
      return;
    }

    setIsUploading(true);
    setUploadValidationErr(null);
    setActionError(null);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('documentType', uploadCategory);
      formData.append('documentName', uploadTitle.trim());
      if (uploadNumber.trim()) {
        formData.append('documentNumber', uploadNumber.trim());
      }
      if (uploadIssueDate) {
        formData.append('issueDate', uploadIssueDate);
      }
      if (uploadExpiryDate) {
        formData.append('expiryDate', uploadExpiryDate);
      }

      await documentsApi.uploadMyDocument(formData);
      setActionSuccess('Document uploaded successfully and queued for HR verification.');
      setIsUploadModalOpen(false);
      setUploadFile(null);
      setUploadTitle('');
      setUploadNumber('');
      setUploadIssueDate('');
      setUploadExpiryDate('');
      loadMyDocuments();
    } catch (err: any) {
      setUploadValidationErr(err.message || 'Failed to upload document. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  // Handle authorized document download
  const handleDownload = async (doc: EmployeeDocumentItem) => {
    setActionError(null);
    try {
      await documentsApi.downloadMyDocument(doc.id, `${doc.documentName}`);
    } catch (err: any) {
      setActionError(err.message || 'Download failed. Please check permissions.');
    }
  };

  // Handle in-browser preview
  const handleOpenPreview = async (doc: EmployeeDocumentItem) => {
    setPreviewItem(doc);
    setPreviewBlobUrl(null);
    setPreviewLoading(true);
    try {
      const res = await documentsApi.getPreviewBlob(doc.id);
      setPreviewBlobUrl(res.url);
    } catch (err: any) {
      setActionError(err.message || 'Failed to generate secure preview.');
      setPreviewItem(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleClosePreview = () => {
    if (previewBlobUrl) {
      window.URL.revokeObjectURL(previewBlobUrl);
    }
    setPreviewBlobUrl(null);
    setPreviewItem(null);
  };

  // Handle document deletion
  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    setIsDeleting(true);
    setActionError(null);
    try {
      await documentsApi.deleteMyDocument(deletingItem.id);
      setActionSuccess(`"${deletingItem.documentName}" was deleted successfully.`);
      setDeletingItem(null);
      loadMyDocuments();
    } catch (err: any) {
      setActionError(err.message || 'Failed to delete document.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered documents
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      if (selectedCategory !== 'ALL' && doc.documentType !== selectedCategory) {
        return false;
      }
      if (selectedStatus !== 'ALL' && doc.status !== selectedStatus) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = doc.documentName.toLowerCase().includes(query);
        const matchesNumber = doc.documentNumber?.toLowerCase().includes(query) ?? false;
        const matchesType = doc.documentType.toLowerCase().includes(query);
        if (!matchesName && !matchesNumber && !matchesType) return false;
      }
      return true;
    });
  }, [documents, selectedCategory, selectedStatus, searchQuery]);

  // Category display configuration
  const getCategoryMeta = (cat: string) => {
    switch (cat) {
      case 'GOVT_ID':
        return { label: 'Government ID', color: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'ACADEMIC':
        return {
          label: 'Education & Degree',
          color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        };
      case 'EXPERIENCE':
        return {
          label: 'Prior Employment',
          color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        };
      case 'ADDRESS_PROOF':
        return { label: 'Address Proof', color: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'CERTIFICATION':
        return { label: 'Certification', color: 'bg-purple-50 text-purple-700 border-purple-200' };
      case 'TAX':
        return { label: 'Tax Declaration', color: 'bg-stone-100 text-stone-700 border-stone-200' };
      default:
        return {
          label: cat.replace('_', ' '),
          color: 'bg-stone-50 text-stone-700 border-stone-200',
        };
    }
  };

  // Status Badge
  const getStatusBadge = (status: DocumentVerificationStatus) => {
    switch (status) {
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Verified
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <FileX2 className="h-3.5 w-3.5 text-rose-600" /> Action Required
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <Clock className="h-3.5 w-3.5 text-amber-600 animate-pulse" /> Pending Review
          </span>
        );
    }
  };

  return (
    <AppShell>
      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        {/* Header & Upload Action */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200/80 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-amber-100/70 text-amber-800 rounded-lg">
                <FolderLock className="h-5 w-5" />
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-stone-900">
                Secure Document Library
              </h1>
            </div>
            <p className="text-sm text-stone-500 mt-1">
              Encrypted, access-controlled vault for your identity, educational records,
              credentials, and company policies.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => setIsUploadModalOpen(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs px-4 py-2 flex items-center gap-2 shadow-xs"
            >
              <Upload className="h-4 w-4" /> Upload Document
            </Button>
          </div>
        </div>

        {/* Action Banners */}
        {actionSuccess && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{actionSuccess}</span>
            </div>
            <button
              onClick={() => setActionSuccess(null)}
              className="text-emerald-700 hover:text-emerald-900 font-bold"
            >
              ×
            </button>
          </div>
        )}

        {actionError && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-xs text-rose-800">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{actionError}</span>
            </div>
            <button
              onClick={() => setActionError(null)}
              className="text-rose-700 hover:text-rose-900 font-bold"
            >
              ×
            </button>
          </div>
        )}

        {/* Top KPI Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 bg-white border-stone-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                Total Documents
              </span>
              <FileText className="h-4 w-4 text-stone-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-stone-900 mt-2">
              {stats?.total ?? (isLoading ? '—' : 0)}
            </div>
            <span className="text-[11px] text-stone-400">Stored in private vault</span>
          </Card>

          <Card className="p-4 bg-white border-stone-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                HR Verified
              </span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-700 mt-2">
              {stats?.verified ?? (isLoading ? '—' : 0)}
            </div>
            <span className="text-[11px] text-emerald-600">Compliance verified</span>
          </Card>

          <Card className="p-4 bg-white border-stone-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                Pending Verification
              </span>
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold font-mono text-amber-700 mt-2">
              {stats?.pending ?? (isLoading ? '—' : 0)}
            </div>
            <span className="text-[11px] text-amber-600">Awaiting HR review</span>
          </Card>

          <Card className="p-4 bg-white border-stone-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                Expiry Alerts
              </span>
              <AlertTriangle className="h-4 w-4 text-rose-500" />
            </div>
            <div className="text-2xl font-bold font-mono text-rose-700 mt-2">
              {(stats?.expiringSoon || 0) + (stats?.expired || 0)}
            </div>
            <span className="text-[11px] text-stone-400">
              {stats?.expired ? `${stats.expired} expired` : 'No expired items'}
            </span>
          </Card>
        </div>

        {/* View Selection Tabs */}
        <div className="flex items-center gap-2 border-b border-stone-200">
          <button
            onClick={() => setActiveTab('my')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'my'
                ? 'border-amber-600 text-amber-800'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <FolderLock className="h-4 w-4" /> My Documents ({documents.length})
          </button>
          <button
            onClick={() => setActiveTab('policies')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'policies'
                ? 'border-amber-600 text-amber-800'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Building2 className="h-4 w-4" /> Company Policies & Handbooks ({policies.length})
          </button>
        </div>

        {activeTab === 'my' ? (
          /* =======================================================================
           * MY PERSONAL DOCUMENTS TAB
           * ======================================================================= */
          <div className="space-y-4">
            {/* Filter Bar */}
            <Card className="p-4 border-stone-200 bg-white space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                {/* Search Input */}
                <div className="md:col-span-5 relative">
                  <Search className="h-4 w-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by title, number or category..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-stone-50/50 text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                {/* Category Select */}
                <div className="md:col-span-3">
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="ALL">All Categories</option>
                    <option value="GOVT_ID">Government ID</option>
                    <option value="ACADEMIC">Education & Degree</option>
                    <option value="EXPERIENCE">Prior Employment</option>
                    <option value="ADDRESS_PROOF">Address Proof</option>
                    <option value="CERTIFICATION">Certification</option>
                    <option value="TAX">Tax Declaration</option>
                    <option value="OTHER">Other Documents</option>
                  </select>
                </div>

                {/* Status Select */}
                <div className="md:col-span-3">
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="ALL">All Verification Statuses</option>
                    <option value="VERIFIED">Verified</option>
                    <option value="PENDING">Pending Review</option>
                    <option value="REJECTED">Action Required / Rejected</option>
                  </select>
                </div>

                {/* Refresh */}
                <div className="md:col-span-1 flex justify-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setSelectedCategory('ALL');
                      setSelectedStatus('ALL');
                      setSearchQuery('');
                      loadMyDocuments();
                    }}
                    title="Reset filters"
                    className="px-2.5 py-1.5 text-xs border-stone-200 text-stone-600 hover:text-stone-900"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>

            {/* Document Table */}
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            ) : error ? (
              <Card className="p-8 text-center border-rose-200 bg-rose-50/50">
                <AlertCircle className="h-8 w-8 text-rose-500 mx-auto mb-2" />
                <p className="text-sm font-semibold text-rose-800">{error}</p>
                <Button
                  size="sm"
                  onClick={loadMyDocuments}
                  className="mt-3 bg-rose-600 text-white text-xs"
                >
                  Retry
                </Button>
              </Card>
            ) : filteredDocuments.length === 0 ? (
              <Card className="p-12 text-center border-dashed border-stone-300 bg-white">
                <FolderLock className="h-10 w-10 text-stone-300 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-stone-800">No documents found</h3>
                <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
                  {searchQuery || selectedCategory !== 'ALL' || selectedStatus !== 'ALL'
                    ? 'No documents matched your filter criteria.'
                    : 'Your personal document vault is currently empty. Upload your official ID, degrees, and certificates to keep your profile complete.'}
                </p>
                <Button
                  size="sm"
                  onClick={() => setIsUploadModalOpen(true)}
                  className="mt-4 bg-amber-600 hover:bg-amber-700 text-white text-xs"
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload Document Now
                </Button>
              </Card>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-xs">
                <table className="w-full text-left text-xs text-stone-700">
                  <thead className="bg-stone-50/80 text-[11px] font-semibold uppercase tracking-wider text-stone-500 border-b border-stone-200">
                    <tr>
                      <th className="py-3 px-4">Document Title</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Document Ref #</th>
                      <th className="py-3 px-4">Upload Date</th>
                      <th className="py-3 px-4">Expiry Date</th>
                      <th className="py-3 px-4">Verification</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 font-medium">
                    {filteredDocuments.map((doc) => {
                      const catMeta = getCategoryMeta(doc.documentType);
                      return (
                        <tr key={doc.id} className="hover:bg-stone-50/60 transition-colors">
                          {/* Title & Format Icon */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <span className="p-1.5 bg-stone-100 rounded text-stone-600 shrink-0">
                                {doc.mimeType?.includes('pdf') ? (
                                  <FileText className="h-4 w-4 text-rose-600" />
                                ) : doc.mimeType?.includes('image') ? (
                                  <FileCode className="h-4 w-4 text-blue-600" />
                                ) : (
                                  <FileText className="h-4 w-4 text-amber-600" />
                                )}
                              </span>
                              <div>
                                <span className="font-semibold text-stone-900 block">
                                  {doc.documentName}
                                </span>
                                <span className="text-[11px] text-stone-400 font-mono">
                                  {doc.fileSizeFormatted}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Category Badge */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${catMeta.color}`}
                            >
                              {catMeta.label}
                            </span>
                          </td>

                          {/* Document Number */}
                          <td className="py-3.5 px-4 whitespace-nowrap font-mono text-stone-600">
                            {doc.documentNumber || '—'}
                          </td>

                          {/* Upload Date */}
                          <td className="py-3.5 px-4 whitespace-nowrap text-stone-500 font-mono text-[11px]">
                            {new Date(doc.createdAt).toLocaleDateString([], {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </td>

                          {/* Expiry Date */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {doc.expiryDate ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-stone-700 text-[11px]">
                                  {doc.expiryDate}
                                </span>
                                {doc.isExpired && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                                    Expired
                                  </span>
                                )}
                                {doc.isExpiringSoon && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                    Expiring
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-stone-400">No Expiry</span>
                            )}
                          </td>

                          {/* Verification Status & Feedback */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div>
                              {getStatusBadge(doc.status)}
                              {doc.reviewerNotes && (
                                <p
                                  className="text-[10px] text-stone-500 italic mt-0.5 max-w-xs truncate"
                                  title={`Reviewer note: ${doc.reviewerNotes}`}
                                >
                                  Note: {doc.reviewerNotes}
                                </p>
                              )}
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Preview */}
                              <button
                                onClick={() => handleOpenPreview(doc)}
                                className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-md transition-colors"
                                title="Preview document in browser"
                              >
                                <Eye className="h-4 w-4" />
                              </button>

                              {/* Download */}
                              <button
                                onClick={() => handleDownload(doc)}
                                className="p-1.5 text-stone-500 hover:text-amber-700 hover:bg-stone-100 rounded-md transition-colors"
                                title="Download secure copy"
                              >
                                <Download className="h-4 w-4" />
                              </button>

                              {/* Delete (allowed only for unverified items per retention policy) */}
                              {doc.canDelete && (
                                <button
                                  onClick={() => setDeletingItem(doc)}
                                  className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors"
                                  title="Delete unverified document"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* =======================================================================
           * COMPANY POLICIES TAB
           * ======================================================================= */
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {policiesLoading ? (
                <>
                  <Skeleton className="h-32 rounded-xl" />
                  <Skeleton className="h-32 rounded-xl" />
                </>
              ) : (
                policies.map((p) => (
                  <Card
                    key={p.id}
                    className="p-5 border-stone-200 bg-white flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          <Building2 className="h-3 w-3" /> {p.category}
                        </span>
                        <span className="text-[11px] font-mono text-stone-400">
                          {p.fileSizeFormatted}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-stone-900 mt-2">{p.title}</h3>
                      <p className="text-xs text-stone-500 mt-1">{p.description}</p>
                    </div>

                    <div className="flex items-center justify-between pt-4 mt-4 border-t border-stone-100 text-xs">
                      <span className="text-stone-400 font-mono text-[11px]">
                        Last updated: {p.updatedAt}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          alert(
                            `Policy document "${p.title}" is published under official statutory guidelines.`,
                          );
                        }}
                        className="text-xs border-stone-200 text-stone-700 hover:bg-stone-50 flex items-center gap-1.5"
                      >
                        <FileText className="h-3.5 w-3.5 text-amber-700" /> View Policy
                      </Button>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        )}

        {/* Upload Document Modal */}
        {isUploadModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-stone-200 space-y-4 animate-scale-in">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-amber-100 text-amber-800 rounded-lg">
                    <Upload className="h-4 w-4" />
                  </span>
                  <h3 className="text-base font-bold text-stone-900">Upload to Document Vault</h3>
                </div>
                <button
                  onClick={() => {
                    setIsUploadModalOpen(false);
                    setUploadValidationErr(null);
                  }}
                  className="text-stone-400 hover:text-stone-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {uploadValidationErr && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>{uploadValidationErr}</span>
                </div>
              )}

              <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
                {/* Category Selector */}
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    Document Classification <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value as DocumentCategory)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="GOVT_ID">
                      Government / National ID (Aadhaar, Passport, PAN)
                    </option>
                    <option value="ACADEMIC">
                      Education & Degrees (Degree, Diploma, Transcripts)
                    </option>
                    <option value="EXPERIENCE">
                      Prior Employment (Relieving Letter, Offer, Payslips)
                    </option>
                    <option value="ADDRESS_PROOF">
                      Address Proof (Rental Agreement, Utility Bill)
                    </option>
                    <option value="CERTIFICATION">Professional Certifications & Licenses</option>
                    <option value="TAX">Tax Documents & Declarations</option>
                    <option value="OTHER">Other Official Files</option>
                  </select>
                </div>

                {/* Title */}
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    Document Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Passport Front & Back, Degree Certificate"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                {/* Reference Number */}
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    Document / Registration Number (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Passport No, Aadhaar No, License ID"
                    value={uploadNumber}
                    onChange={(e) => setUploadNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                {/* Date Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">Issue Date</label>
                    <input
                      type="date"
                      value={uploadIssueDate}
                      onChange={(e) => setUploadIssueDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">Expiry Date</label>
                    <input
                      type="date"
                      value={uploadExpiryDate}
                      onChange={(e) => setUploadExpiryDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>

                {/* File Drop/Input Zone */}
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    Select File <span className="text-rose-500">*</span>
                  </label>
                  <div className="border-2 border-dashed border-stone-300 rounded-xl p-4 text-center hover:bg-stone-50 transition-colors">
                    <input
                      type="file"
                      id="doc-file-input"
                      onChange={handleFileChange}
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.doc"
                      className="hidden"
                    />
                    <label htmlFor="doc-file-input" className="cursor-pointer">
                      <Upload className="h-6 w-6 text-stone-400 mx-auto mb-1.5" />
                      {uploadFile ? (
                        <p className="font-semibold text-amber-800">
                          {uploadFile.name} ({(uploadFile.size / 1024 / 1024).toFixed(2)} MB)
                        </p>
                      ) : (
                        <>
                          <p className="font-semibold text-stone-700">Click to choose a file</p>
                          <p className="text-[11px] text-stone-400 mt-0.5">
                            PDF, JPG, PNG, WEBP, or DOCX up to 10 MB
                          </p>
                        </>
                      )}
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-stone-100">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isUploading}
                    onClick={() => setIsUploadModalOpen(false)}
                    className="border-stone-300 text-stone-700 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isUploading || !uploadFile}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
                  >
                    {isUploading ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> Encrypting &
                        Uploading...
                      </>
                    ) : (
                      'Save to Vault'
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Secure Document Preview Modal */}
        {previewItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl max-w-3xl w-full h-[85vh] flex flex-col shadow-2xl border border-stone-200 animate-scale-in">
              <div className="p-4 border-b border-stone-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-stone-900 text-sm">{previewItem.documentName}</h3>
                  <span className="text-[11px] text-stone-400 font-mono">
                    {previewItem.documentType} • {previewItem.fileSizeFormatted}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleDownload(previewItem)}
                    className="text-xs border-stone-200"
                  >
                    <Download className="h-3.5 w-3.5 mr-1" /> Download
                  </Button>
                  <button
                    onClick={handleClosePreview}
                    className="text-stone-400 hover:text-stone-700 p-1"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 bg-stone-100 relative overflow-hidden flex items-center justify-center">
                {previewLoading ? (
                  <div className="text-center text-xs text-stone-500">
                    <RefreshCw className="h-6 w-6 animate-spin text-amber-600 mx-auto mb-2" />
                    Fetching secure stream...
                  </div>
                ) : previewBlobUrl ? (
                  previewItem.mimeType.includes('pdf') ? (
                    <iframe
                      src={previewBlobUrl}
                      className="w-full h-full border-none"
                      title="Document Preview"
                    />
                  ) : previewItem.mimeType.includes('image') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewBlobUrl}
                      alt={previewItem.documentName}
                      className="max-h-full max-w-full object-contain p-4"
                    />
                  ) : (
                    <div className="p-8 text-center text-xs text-stone-600">
                      <FileText className="h-10 w-10 text-stone-400 mx-auto mb-2" />
                      <p className="font-semibold text-stone-800">Office Document</p>
                      <p className="mt-1">In-browser preview is available for PDFs and images.</p>
                      <Button
                        size="sm"
                        onClick={() => handleDownload(previewItem)}
                        className="mt-3 bg-amber-600 text-white text-xs"
                      >
                        Download to View
                      </Button>
                    </div>
                  )
                ) : (
                  <div className="text-xs text-rose-600 font-medium">
                    Failed to load preview stream.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deletingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-stone-200 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-100 text-rose-700 rounded-xl">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900">Delete Document</h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Are you sure you want to permanently delete &quot;{deletingItem.documentName}
                    &quot; from your vault?
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isDeleting}
                  onClick={() => setDeletingItem(null)}
                  className="border-stone-300 text-stone-700 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
                >
                  {isDeleting ? 'Deleting...' : 'Confirm Deletion'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
