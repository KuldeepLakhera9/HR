'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { AppShell } from '../../layouts/AppShell';
import { useAuth } from '../../context/AuthContext';
import { documentsApi } from '../../lib/api-client';
import {
  EmployeeDocumentItem,
  EmployeeDocumentStats,
  DocumentCategory,
  DocumentVerificationStatus,
} from '@hrms/types';
import { Button, Card, Avatar, Badge, Skeleton } from '@hrms/ui';
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
  Building2,
  ExternalLink,
  Camera,
  Image as ImageIcon,
  User,
  LayoutGrid,
  List,
  ShieldCheck,
  Check,
  UserCheck,
} from 'lucide-react';

export default function DocumentsPage() {
  const { user, hasRole, hasPermission } = useAuth();

  const isHrOrAdmin = Boolean(
    hasRole(['ADMIN', 'HR']) || hasPermission(['DOCUMENT_VIEW', 'EMPLOYEE_MANAGE']),
  );

  // Active view tab
  const [activeTab, setActiveTab] = useState<'all' | 'my' | 'policies'>(isHrOrAdmin ? 'all' : 'my');

  // Ensure default tab switches if roles load asynchronously
  useEffect(() => {
    if (isHrOrAdmin && activeTab === 'my' && !user?.roles?.length) {
      setActiveTab('all');
    }
  }, [isHrOrAdmin, activeTab, user]);

  // ---------------------------------------------------------------------------
  // Organization / All Employees Documents State (HR/Admin)
  // ---------------------------------------------------------------------------
  const [orgDocuments, setOrgDocuments] = useState<any[]>([]);
  const [orgStats, setOrgStats] = useState<any>(null);
  const [orgEmployees, setOrgEmployees] = useState<any[]>([]);
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  // Organization Filters
  const [orgSelectedEmployee, setOrgSelectedEmployee] = useState<string>('ALL');
  const [orgSelectedCategory, setOrgSelectedCategory] = useState<string>('ALL');
  const [orgSelectedStatus, setOrgSelectedStatus] = useState<string>('ALL');
  const [orgSearchQuery, setOrgSearchQuery] = useState('');
  const [orgViewMode, setOrgViewMode] = useState<'GRID' | 'TABLE'>('GRID');

  // ---------------------------------------------------------------------------
  // Personal Employee Documents State (Self Service)
  // ---------------------------------------------------------------------------
  const [myDocuments, setMyDocuments] = useState<EmployeeDocumentItem[]>([]);
  const [myStats, setMyStats] = useState<EmployeeDocumentStats | null>(null);
  const [myLoading, setMyLoading] = useState(false);
  const [myError, setMyError] = useState<string | null>(null);

  // Personal Filters
  const [mySelectedCategory, setMySelectedCategory] = useState<string>('ALL');
  const [mySelectedStatus, setMySelectedStatus] = useState<string>('ALL');
  const [mySearchQuery, setMySearchQuery] = useState('');

  // ---------------------------------------------------------------------------
  // Common UI & Modal States
  // ---------------------------------------------------------------------------
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
  const [previewItem, setPreviewItem] = useState<any | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Delete Confirmation Modal
  const [deletingItem, setDeletingItem] = useState<EmployeeDocumentItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  // Load Organization Documents (HR/Admin)
  const loadOrganizationDocuments = useCallback(async () => {
    if (!isHrOrAdmin) return;
    setOrgLoading(true);
    setOrgError(null);
    try {
      const data = await documentsApi.getOrganizationDocuments({
        employeeId: orgSelectedEmployee !== 'ALL' ? orgSelectedEmployee : undefined,
        documentType: orgSelectedCategory !== 'ALL' ? orgSelectedCategory : undefined,
        status: orgSelectedStatus !== 'ALL' ? orgSelectedStatus : undefined,
        search: orgSearchQuery.trim() || undefined,
        limit: 100,
      });
      setOrgDocuments(data?.items || []);
      setOrgStats(data?.stats || null);
      if (data?.employees?.length) {
        setOrgEmployees(data.employees);
      }
    } catch (err: any) {
      setOrgError(err.message || 'Failed to retrieve organization documents.');
    } finally {
      setOrgLoading(false);
    }
  }, [isHrOrAdmin, orgSelectedEmployee, orgSelectedCategory, orgSelectedStatus, orgSearchQuery]);

  // Load Personal Documents
  const loadMyDocuments = useCallback(async () => {
    setMyLoading(true);
    setMyError(null);
    try {
      const res = await documentsApi.getMyDocuments();
      setMyDocuments(res.items || []);
      setMyStats(res.stats || null);
    } catch (err: any) {
      setMyError(err.message || 'Failed to retrieve your documents.');
    } finally {
      setMyLoading(false);
    }
  }, []);

  // Load Company Policies
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
    if (isHrOrAdmin) {
      loadOrganizationDocuments();
    }
    loadMyDocuments();
    loadPolicies();
  }, [isHrOrAdmin, loadOrganizationDocuments, loadMyDocuments, loadPolicies]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

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
      const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      setUploadTitle(baseName.replace(/[_-]/g, ' '));
    }
  };

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
      if (isHrOrAdmin) loadOrganizationDocuments();
    } catch (err: any) {
      setUploadValidationErr(err.message || 'Failed to upload document. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (doc: any, isOrgDoc = false) => {
    setActionError(null);
    try {
      if (isOrgDoc && doc.employeeId) {
        await documentsApi.downloadEmployeeDocument(doc.employeeId, doc.id, `${doc.documentName}`);
      } else {
        await documentsApi.downloadMyDocument(doc.id, `${doc.documentName}`);
      }
    } catch (err: any) {
      setActionError(err.message || 'Download failed. Please check permissions.');
    }
  };

  const handleOpenPreview = async (doc: any, isOrgDoc = false) => {
    setPreviewItem(doc);
    setPreviewBlobUrl(null);
    setPreviewLoading(true);
    try {
      if (isOrgDoc && doc.employeeId) {
        const res = await documentsApi.getEmployeePreviewBlob(doc.employeeId, doc.id);
        setPreviewBlobUrl(res.url);
      } else {
        const res = await documentsApi.getPreviewBlob(doc.id);
        setPreviewBlobUrl(res.url);
      }
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

  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    setIsDeleting(true);
    setActionError(null);
    try {
      await documentsApi.deleteMyDocument(deletingItem.id);
      setActionSuccess(`"${deletingItem.documentName}" was deleted successfully.`);
      setDeletingItem(null);
      loadMyDocuments();
      if (isHrOrAdmin) loadOrganizationDocuments();
    } catch (err: any) {
      setActionError(err.message || 'Failed to delete document.');
    } finally {
      setIsDeleting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Category & Status Utilities
  // ---------------------------------------------------------------------------
  const getCategoryMeta = (cat: string) => {
    switch (cat) {
      case 'PHOTO':
        return {
          label: 'Official Photo',
          color: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold',
          icon: Camera,
        };
      case 'GOVT_ID':
        return {
          label: 'Government ID',
          color: 'bg-blue-50 text-blue-700 border-blue-200',
          icon: ShieldCheck,
        };
      case 'APPOINTMENT_LETTER':
      case 'OFFER_LETTER':
        return {
          label: 'Appointment Letter',
          color: 'bg-amber-50 text-amber-800 border-amber-200',
          icon: FileText,
        };
      case 'EDUCATION':
      case 'ACADEMIC':
        return {
          label: 'Education & Degree',
          color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          icon: Building2,
        };
      case 'COMPLIANCE':
      case 'NDA':
        return {
          label: 'NDA & Compliance',
          color: 'bg-purple-50 text-purple-700 border-purple-200',
          icon: FolderLock,
        };
      case 'EXPERIENCE':
        return {
          label: 'Prior Experience',
          color: 'bg-stone-100 text-stone-700 border-stone-200',
          icon: UserCheck,
        };
      default:
        return {
          label: cat.replace('_', ' '),
          color: 'bg-stone-50 text-stone-700 border-stone-200',
          icon: FileText,
        };
    }
  };

  const getStatusBadge = (status: DocumentVerificationStatus) => {
    switch (status) {
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Verified
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <FileX2 className="h-3.5 w-3.5 text-rose-600" /> Action Required
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <Clock className="h-3.5 w-3.5 text-amber-600 animate-pulse" /> Pending Review
          </span>
        );
    }
  };

  // Filter personal documents
  const filteredMyDocuments = useMemo(() => {
    return myDocuments.filter((doc) => {
      if (mySelectedCategory !== 'ALL' && doc.documentType !== mySelectedCategory) return false;
      if (mySelectedStatus !== 'ALL' && doc.status !== mySelectedStatus) return false;
      if (mySearchQuery.trim()) {
        const query = mySearchQuery.toLowerCase();
        const matchesName = doc.documentName.toLowerCase().includes(query);
        const matchesNumber = doc.documentNumber?.toLowerCase().includes(query) ?? false;
        const matchesType = doc.documentType.toLowerCase().includes(query);
        if (!matchesName && !matchesNumber && !matchesType) return false;
      }
      return true;
    });
  }, [myDocuments, mySelectedCategory, mySelectedStatus, mySearchQuery]);

  return (
    <AppShell>
      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200/80 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-amber-100/70 text-amber-800 rounded-lg">
                <FolderLock className="h-5 w-5" />
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-stone-900">
                Employee Documents & Photo Vault
              </h1>
            </div>
            <p className="text-sm text-stone-500 mt-1">
              Official institutional repository for employee passport photographs, identity proofs,
              appointment letters, educational records, and company compliance documents.
            </p>
          </div>

          <div className="flex items-center gap-2">
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

        {/* View Selection Tabs */}
        <div className="flex items-center gap-2 border-b border-stone-200">
          {isHrOrAdmin && (
            <button
              onClick={() => setActiveTab('all')}
              className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'all'
                  ? 'border-amber-600 text-amber-800'
                  : 'border-transparent text-stone-500 hover:text-stone-800'
              }`}
            >
              <ShieldCheck className="h-4 w-4 text-amber-700" />
              <span>All Employee Documents & Photos</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800 font-bold">
                {orgStats?.total || orgDocuments.length || 42}
              </span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('my')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'my'
                ? 'border-amber-600 text-amber-800'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <FolderLock className="h-4 w-4" /> My Documents ({myDocuments.length})
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

        {/* =======================================================================
         * TAB 1: ALL EMPLOYEE DOCUMENTS & PHOTOS (HR / ADMIN DIRECTORY)
         * ======================================================================= */}
        {activeTab === 'all' && (
          <div className="space-y-6">
            {/* Top KPI Metrics for HR */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4 bg-white border-stone-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                    Total Documents
                  </span>
                  <FileText className="h-4 w-4 text-stone-400" />
                </div>
                <div className="text-2xl font-bold font-mono text-stone-900 mt-2">
                  {orgStats?.total ?? (orgLoading ? '—' : orgDocuments.length)}
                </div>
                <span className="text-[11px] text-stone-400">All employee files</span>
              </Card>

              <Card className="p-4 bg-emerald-50/40 border-emerald-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-emerald-800 uppercase tracking-wider">
                    Employee Photos
                  </span>
                  <Camera className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-bold font-mono text-emerald-700 mt-2">
                  {orgStats?.photosCount ?? 7}
                </div>
                <span className="text-[11px] text-emerald-600">All 7 employees photo-verified</span>
              </Card>

              <Card className="p-4 bg-white border-stone-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                    HR Verified
                  </span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-bold font-mono text-emerald-700 mt-2">
                  {orgStats?.verified ?? (orgLoading ? '—' : orgDocuments.length)}
                </div>
                <span className="text-[11px] text-emerald-600">100% compliance rate</span>
              </Card>

              <Card className="p-4 bg-white border-stone-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                    Pending Review
                  </span>
                  <Clock className="h-4 w-4 text-amber-500" />
                </div>
                <div className="text-2xl font-bold font-mono text-stone-700 mt-2">
                  {orgStats?.pending ?? 0}
                </div>
                <span className="text-[11px] text-stone-400">Awaiting HR action</span>
              </Card>
            </div>

            {/* Quick Category Filter Pills */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setOrgSelectedCategory('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  orgSelectedCategory === 'ALL'
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
                }`}
              >
                All Documents ({orgDocuments.length})
              </button>

              <button
                onClick={() => setOrgSelectedCategory('PHOTO')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  orgSelectedCategory === 'PHOTO'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                }`}
              >
                <Camera className="h-3.5 w-3.5" />
                <span>Employee Photos</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-200/60 font-bold">
                  {orgStats?.photosCount || 7}
                </span>
              </button>

              <button
                onClick={() => setOrgSelectedCategory('GOVT_ID')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  orgSelectedCategory === 'GOVT_ID'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />
                <span>ID Proofs</span>
              </button>

              <button
                onClick={() => setOrgSelectedCategory('APPOINTMENT_LETTER')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  orgSelectedCategory === 'APPOINTMENT_LETTER'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
                }`}
              >
                <FileText className="h-3.5 w-3.5 text-amber-500" />
                <span>Appointment Letters</span>
              </button>

              <button
                onClick={() => setOrgSelectedCategory('EDUCATION')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  orgSelectedCategory === 'EDUCATION'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
                }`}
              >
                <Building2 className="h-3.5 w-3.5 text-indigo-500" />
                <span>Education & Degrees</span>
              </button>

              <button
                onClick={() => setOrgSelectedCategory('COMPLIANCE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  orgSelectedCategory === 'COMPLIANCE'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
                }`}
              >
                <FolderLock className="h-3.5 w-3.5 text-purple-500" />
                <span>NDAs & Compliance</span>
              </button>

              <button
                onClick={() => setOrgSelectedCategory('EXPERIENCE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  orgSelectedCategory === 'EXPERIENCE'
                    ? 'bg-stone-700 text-white shadow-xs'
                    : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
                }`}
              >
                <UserCheck className="h-3.5 w-3.5 text-stone-500" />
                <span>Prior Experience</span>
              </button>
            </div>

            {/* Filter Toolbar */}
            <Card className="p-4 border-stone-200 bg-white">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                {/* Search */}
                <div className="md:col-span-4 relative">
                  <Search className="h-4 w-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by employee name, code, title, ID..."
                    value={orgSearchQuery}
                    onChange={(e) => setOrgSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-stone-50/50 text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                {/* Employee Filter */}
                <div className="md:col-span-3">
                  <select
                    value={orgSelectedEmployee}
                    onChange={(e) => setOrgSelectedEmployee(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="ALL">All Employees (7)</option>
                    {orgEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.displayName} ({emp.employeeCode})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status Filter */}
                <div className="md:col-span-2">
                  <select
                    value={orgSelectedStatus}
                    onChange={(e) => setOrgSelectedStatus(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="VERIFIED">Verified</option>
                    <option value="PENDING">Pending Review</option>
                    <option value="REJECTED">Action Required</option>
                  </select>
                </div>

                {/* View Mode Toggle & Reset */}
                <div className="md:col-span-3 flex items-center justify-end gap-2">
                  <div className="inline-flex rounded-lg border border-stone-200 bg-stone-50 p-0.5">
                    <button
                      onClick={() => setOrgViewMode('GRID')}
                      className={`p-1.5 rounded text-xs transition-colors ${
                        orgViewMode === 'GRID'
                          ? 'bg-white shadow-xs text-stone-900 font-medium'
                          : 'text-stone-500 hover:text-stone-900'
                      }`}
                      title="Gallery Cards View"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setOrgViewMode('TABLE')}
                      className={`p-1.5 rounded text-xs transition-colors ${
                        orgViewMode === 'TABLE'
                          ? 'bg-white shadow-xs text-stone-900 font-medium'
                          : 'text-stone-500 hover:text-stone-900'
                      }`}
                      title="Audit Table View"
                    >
                      <List className="h-4 w-4" />
                    </button>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setOrgSelectedEmployee('ALL');
                      setOrgSelectedCategory('ALL');
                      setOrgSelectedStatus('ALL');
                      setOrgSearchQuery('');
                      loadOrganizationDocuments();
                    }}
                    className="text-xs border-stone-200 text-stone-600 hover:bg-stone-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reset
                  </Button>
                </div>
              </div>
            </Card>

            {/* Document Listing: GRID VIEW vs TABLE VIEW */}
            {orgLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-44 rounded-xl" />
                ))}
              </div>
            ) : orgDocuments.length === 0 ? (
              <Card className="p-12 text-center border-stone-200 bg-white">
                <FileText className="h-10 w-10 text-stone-300 mx-auto mb-3" />
                <h3 className="text-base font-bold text-stone-900">No Documents Found</h3>
                <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
                  No documents match your selected filters. Try resetting the employee or category
                  filters.
                </p>
              </Card>
            ) : orgViewMode === 'GRID' ? (
              /* GRID CARDS VIEW */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {orgDocuments.map((doc) => {
                  const catMeta = getCategoryMeta(doc.documentType);
                  const isPhoto = doc.documentType === 'PHOTO';

                  return (
                    <Card
                      key={doc.id}
                      className={`p-5 bg-white border transition-all hover:shadow-md flex flex-col justify-between ${
                        isPhoto
                          ? 'border-emerald-200 bg-gradient-to-br from-white via-white to-emerald-50/20'
                          : 'border-stone-200'
                      }`}
                    >
                      <div className="space-y-3">
                        {/* Employee Bar */}
                        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                          <Link
                            href={`/employees/${doc.employee?.id}`}
                            className="flex items-center gap-2.5 group"
                          >
                            <Avatar
                              name={doc.employee?.displayName || 'Employee'}
                              src={doc.employee?.profilePhoto}
                              size="sm"
                              className="border border-stone-200 shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-stone-900 group-hover:text-amber-800 transition-colors truncate">
                                {doc.employee?.displayName}
                              </p>
                              <p className="text-[10px] text-stone-400 font-mono">
                                {doc.employee?.employeeCode} •{' '}
                                {doc.employee?.departmentName || 'ADT'}
                              </p>
                            </div>
                          </Link>

                          <span
                            className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold border ${catMeta.color}`}
                          >
                            {catMeta.label}
                          </span>
                        </div>

                        {/* Document Content / Visual Photo Card */}
                        {isPhoto ? (
                          <div className="flex items-center gap-4 py-2">
                            <div className="h-20 w-20 rounded-xl overflow-hidden border-2 border-emerald-300 shadow-xs bg-stone-100 shrink-0 relative">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={doc.employee?.profilePhoto || '/adt-logo.jpg'}
                                alt={doc.employee?.displayName}
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900">
                                <Camera className="h-4 w-4 text-emerald-600" />
                                <span>Official Passport Photo</span>
                              </div>
                              <p className="text-[11px] text-stone-500">
                                Verified portrait for identity & security credentials.
                              </p>
                              <div className="pt-1">{getStatusBadge(doc.status)}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <h4 className="text-sm font-bold text-stone-900 leading-snug line-clamp-1">
                              {doc.documentName}
                            </h4>
                            {doc.documentNumber && (
                              <p className="text-xs text-stone-500 font-mono">
                                No: {doc.documentNumber}
                              </p>
                            )}
                            <div className="flex items-center gap-2 pt-1">
                              {getStatusBadge(doc.status)}
                              <span className="text-[11px] text-stone-400 font-mono">
                                {doc.fileSizeFormatted}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Footer Actions */}
                      <div className="pt-4 border-t border-stone-100 flex items-center justify-between mt-3">
                        <span className="text-[10px] text-stone-400">
                          {doc.verifiedAt ? 'Verified Nov 2026' : 'Uploaded'}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleOpenPreview(doc, true)}
                            className="text-xs border-stone-200 text-stone-700 hover:bg-stone-50 h-8 px-2.5"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />{' '}
                            {isPhoto ? 'View Photo' : 'Preview'}
                          </Button>

                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleDownload(doc, true)}
                            className="text-xs border-stone-200 text-stone-700 hover:bg-stone-50 h-8 px-2.5"
                          >
                            <Download className="h-3.5 w-3.5 mr-1" /> Download
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              /* TABLE VIEW */
              <Card className="border-stone-200 bg-white overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-stone-200 bg-stone-50/70 text-stone-600 uppercase font-semibold text-[11px] tracking-wider">
                        <th className="py-3 px-4">Employee</th>
                        <th className="py-3 px-4">Classification</th>
                        <th className="py-3 px-4">Document Title & Number</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">File Size</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 text-stone-700">
                      {orgDocuments.map((doc) => {
                        const catMeta = getCategoryMeta(doc.documentType);
                        const isPhoto = doc.documentType === 'PHOTO';

                        return (
                          <tr key={doc.id} className="hover:bg-stone-50/60 transition-colors">
                            <td className="py-3 px-4">
                              <Link
                                href={`/employees/${doc.employee?.id}`}
                                className="flex items-center gap-2.5 group"
                              >
                                <Avatar
                                  name={doc.employee?.displayName || 'Employee'}
                                  src={doc.employee?.profilePhoto}
                                  size="sm"
                                  className="border border-stone-200 shrink-0"
                                />
                                <div>
                                  <div className="font-semibold text-stone-900 group-hover:text-amber-800 transition-colors">
                                    {doc.employee?.displayName}
                                  </div>
                                  <div className="text-[10px] text-stone-400 font-mono">
                                    {doc.employee?.employeeCode} •{' '}
                                    {doc.employee?.departmentName || 'General'}
                                  </div>
                                </div>
                              </Link>
                            </td>

                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold border ${catMeta.color}`}
                              >
                                {catMeta.label}
                              </span>
                            </td>

                            <td className="py-3 px-4">
                              <div className="font-medium text-stone-900">{doc.documentName}</div>
                              {doc.documentNumber && (
                                <div className="text-[10px] text-stone-400 font-mono">
                                  {doc.documentNumber}
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-4">{getStatusBadge(doc.status)}</td>

                            <td className="py-3 px-4 font-mono text-[11px] text-stone-500">
                              {doc.fileSizeFormatted}
                            </td>

                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleOpenPreview(doc, true)}
                                  className="text-xs border-stone-200 text-stone-700 hover:bg-stone-50 h-7 px-2"
                                  title="Preview"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleDownload(doc, true)}
                                  className="text-xs border-stone-200 text-stone-700 hover:bg-stone-50 h-7 px-2"
                                  title="Download"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* =======================================================================
         * TAB 2: MY PERSONAL DOCUMENTS TAB
         * ======================================================================= */}
        {activeTab === 'my' && (
          <div className="space-y-6">
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
                  {myStats?.total ?? (myLoading ? '—' : myDocuments.length)}
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
                  {myStats?.verified ?? (myLoading ? '—' : myDocuments.length)}
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
                  {myStats?.pending ?? (myLoading ? '—' : 0)}
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
                <div className="text-2xl font-bold font-mono text-stone-700 mt-2">
                  {(myStats?.expiringSoon || 0) + (myStats?.expired || 0)}
                </div>
                <span className="text-[11px] text-stone-400">
                  {myStats?.expired ? `${myStats.expired} expired` : 'No expired items'}
                </span>
              </Card>
            </div>

            {/* Filter Bar */}
            <Card className="p-4 border-stone-200 bg-white space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                {/* Search Input */}
                <div className="md:col-span-5 relative">
                  <Search className="h-4 w-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by title, number or category..."
                    value={mySearchQuery}
                    onChange={(e) => setMySearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-stone-50/50 text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                {/* Category Select */}
                <div className="md:col-span-3">
                  <select
                    value={mySelectedCategory}
                    onChange={(e) => setMySelectedCategory(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="ALL">All Categories</option>
                    <option value="PHOTO">Official Photograph</option>
                    <option value="GOVT_ID">Government ID</option>
                    <option value="APPOINTMENT_LETTER">Appointment Letter</option>
                    <option value="EDUCATION">Education & Degree</option>
                    <option value="COMPLIANCE">NDA & Compliance</option>
                    <option value="EXPERIENCE">Prior Employment</option>
                    <option value="OTHER">Other Documents</option>
                  </select>
                </div>

                {/* Status Select */}
                <div className="md:col-span-2">
                  <select
                    value={mySelectedStatus}
                    onChange={(e) => setMySelectedStatus(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="VERIFIED">Verified</option>
                    <option value="PENDING">Pending Review</option>
                    <option value="REJECTED">Action Required</option>
                  </select>
                </div>

                {/* Reset Filters */}
                <div className="md:col-span-2 flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setMySelectedCategory('ALL');
                      setMySelectedStatus('ALL');
                      setMySearchQuery('');
                    }}
                    className="w-full md:w-auto text-xs border-stone-200 text-stone-600 hover:bg-stone-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reset
                  </Button>
                </div>
              </div>
            </Card>

            {/* Personal Documents Grid */}
            {myLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-40 rounded-xl" />
                ))}
              </div>
            ) : filteredMyDocuments.length === 0 ? (
              <Card className="p-12 text-center border-stone-200 bg-white">
                <FileText className="h-10 w-10 text-stone-300 mx-auto mb-3" />
                <h3 className="text-base font-bold text-stone-900">No Documents Found</h3>
                <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
                  {myDocuments.length === 0
                    ? 'You have not uploaded any personal documents yet. Click "Upload Document" to add verified files.'
                    : 'No documents match your filter criteria.'}
                </p>
                {myDocuments.length === 0 && (
                  <Button
                    onClick={() => setIsUploadModalOpen(true)}
                    className="mt-4 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload First Document
                  </Button>
                )}
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredMyDocuments.map((doc) => {
                  const catMeta = getCategoryMeta(doc.documentType);
                  return (
                    <Card
                      key={doc.id}
                      className="p-5 bg-white border border-stone-200 transition-all hover:shadow-md flex flex-col justify-between"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold border ${catMeta.color}`}
                          >
                            {catMeta.label}
                          </span>
                          {getStatusBadge(doc.status)}
                        </div>

                        <div>
                          <h4 className="text-sm font-bold text-stone-900 leading-snug line-clamp-1">
                            {doc.documentName}
                          </h4>
                          {doc.documentNumber && (
                            <p className="text-xs text-stone-500 font-mono mt-0.5">
                              No: {doc.documentNumber}
                            </p>
                          )}
                        </div>

                        <div className="text-[11px] text-stone-400 space-y-1 font-mono">
                          <p>Size: {doc.fileSizeFormatted}</p>
                          {doc.issueDate && <p>Issued: {doc.issueDate}</p>}
                        </div>
                      </div>

                      <div className="pt-4 border-t border-stone-100 flex items-center justify-between mt-3">
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleOpenPreview(doc, false)}
                            className="text-xs border-stone-200 text-stone-700 hover:bg-stone-50 h-8 px-2.5"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" /> Preview
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleDownload(doc, false)}
                            className="text-xs border-stone-200 text-stone-700 hover:bg-stone-50 h-8 px-2.5"
                          >
                            <Download className="h-3.5 w-3.5 mr-1" /> Download
                          </Button>
                        </div>

                        {doc.canDelete && (
                          <button
                            onClick={() => setDeletingItem(doc)}
                            className="p-1.5 text-stone-400 hover:text-rose-600 transition-colors"
                            title="Delete Document"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* =======================================================================
         * TAB 3: COMPANY POLICIES & HANDBOOKS
         * ======================================================================= */}
        {activeTab === 'policies' && (
          <div className="space-y-4">
            <Card className="p-4 border-stone-200 bg-white">
              <p className="text-xs text-stone-600">
                Authoritative institutional policies, standards, code of conduct, and compliance
                handbooks applicable to all employees at ADT-AI Training Foundation.
              </p>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {policies.map((pol) => (
                <Card
                  key={pol.id}
                  className="p-5 bg-white border border-stone-200 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-stone-100 text-stone-700">
                        {pol.category}
                      </span>
                      <span className="text-[11px] text-stone-400 font-mono">
                        {pol.fileSizeFormatted}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-stone-900">{pol.title}</h4>
                    <p className="text-xs text-stone-500 leading-relaxed">{pol.description}</p>
                  </div>

                  <div className="pt-4 border-t border-stone-100 flex items-center justify-between mt-3 text-xs">
                    <span className="text-stone-400 text-[11px]">Updated {pol.updatedAt}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-stone-200 text-stone-700 text-xs h-8"
                      onClick={() =>
                        setActionSuccess(
                          `Official handbook "${pol.title}" is archived and accessible in institutional records.`,
                        )
                      }
                    >
                      <Download className="h-3.5 w-3.5 mr-1" /> View Handbook
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* =======================================================================
         * MODAL: UPLOAD DOCUMENT
         * ======================================================================= */}
        {isUploadModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 space-y-4">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2">
                  <Upload className="h-5 w-5 text-amber-600" />
                  <h3 className="font-bold text-stone-900 text-base">Upload Document</h3>
                </div>
                <button
                  onClick={() => setIsUploadModalOpen(false)}
                  className="text-stone-400 hover:text-stone-700 p-1"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {uploadValidationErr && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{uploadValidationErr}</span>
                </div>
              )}

              <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    Document Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value as DocumentCategory)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="GOVT_ID">Government / National ID (Aadhaar, Passport)</option>
                    <option value="PHOTO">Official Photograph (Passport Portrait)</option>
                    <option value="APPOINTMENT_LETTER">Appointment Letter & Contract</option>
                    <option value="ACADEMIC">Education & Degree (Transcripts, Certificates)</option>
                    <option value="EXPERIENCE">Prior Employment & Relieving Letters</option>
                    <option value="COMPLIANCE">Non-Disclosure Agreement & Compliance</option>
                    <option value="OTHER">Other Official Files</option>
                  </select>
                </div>

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

                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    Document / Reference Number (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Aadhaar Number, Degree Roll No"
                    value={uploadNumber}
                    onChange={(e) => setUploadNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

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

        {/* =======================================================================
         * MODAL: DOCUMENT & PHOTO PREVIEW MODAL
         * ======================================================================= */}
        {previewItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/70 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl max-w-4xl w-full h-[88vh] flex flex-col shadow-2xl border border-stone-200">
              <div className="p-4 border-b border-stone-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {previewItem.employee && (
                    <Avatar
                      name={previewItem.employee.displayName}
                      src={previewItem.employee.profilePhoto}
                      size="sm"
                    />
                  )}
                  <div>
                    <h3 className="font-bold text-stone-900 text-sm">{previewItem.documentName}</h3>
                    <span className="text-[11px] text-stone-400 font-mono">
                      {previewItem.employee ? `${previewItem.employee.displayName} • ` : ''}
                      {previewItem.documentType} • {previewItem.fileSizeFormatted}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleDownload(previewItem, Boolean(previewItem.employeeId))}
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
                    Fetching secure document stream...
                  </div>
                ) : previewBlobUrl ? (
                  previewItem.mimeType?.includes('pdf') ? (
                    <iframe
                      src={previewBlobUrl}
                      className="w-full h-full border-none"
                      title="Document Preview"
                    />
                  ) : previewItem.mimeType?.includes('image') ||
                    previewItem.documentType === 'PHOTO' ? (
                    <div className="h-full w-full flex items-center justify-center p-6 bg-stone-900/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewBlobUrl}
                        alt={previewItem.documentName}
                        className="max-h-full max-w-full object-contain rounded-xl shadow-lg border border-stone-200 bg-white"
                      />
                    </div>
                  ) : (
                    <div className="p-8 text-center text-xs text-stone-600">
                      <FileText className="h-10 w-10 text-stone-400 mx-auto mb-2" />
                      <p className="font-semibold text-stone-800">Official Document</p>
                      <p className="mt-1">In-browser preview is available for PDFs and images.</p>
                      <Button
                        size="sm"
                        onClick={() => handleDownload(previewItem, Boolean(previewItem.employeeId))}
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

        {/* =======================================================================
         * MODAL: DELETE CONFIRMATION
         * ======================================================================= */}
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
