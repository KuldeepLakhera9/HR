'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AppShell } from '../../layouts/AppShell';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';
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
  Users,
  Camera,
  ZoomIn,
  Mail,
  Briefcase,
  Check,
} from 'lucide-react';

export default function DocumentsPage() {
  const { user, roles } = useAuth();
  const { role } = useRole();

  // Role detection: HR and Admin have full organization-wide document & photo visibility
  const isHR = Boolean(
    role === 'HR' ||
    role === 'ADMIN' ||
    roles?.includes('HR') ||
    roles?.includes('ADMIN') ||
    (user as any)?.roles?.includes('HR') ||
    (user as any)?.roles?.includes('ADMIN'),
  );

  // Active view tab: defaults to Organization Vault for HR/Admin, otherwise personal documents
  const [activeTab, setActiveTab] = useState<'vault' | 'photos' | 'my' | 'policies'>(
    isHR ? 'vault' : 'my',
  );

  // Ensure active tab matches role on initial auth load
  useEffect(() => {
    if (isHR && (activeTab === 'my' || !activeTab)) {
      setActiveTab('vault');
    }
  }, [isHR]);

  // ===========================================================================
  // ORGANIZATION-WIDE DOCUMENTS & PHOTO ROSTER STATE (HR/ADMIN)
  // ===========================================================================
  const [orgDocuments, setOrgDocuments] = useState<EmployeeDocumentItem[]>([]);
  const [orgStats, setOrgStats] = useState<any>(null);
  const [employeeRoster, setEmployeeRoster] = useState<any[]>([]);
  const [isOrgLoading, setIsOrgLoading] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  // Filter States for Organization Vault
  const [orgSearch, setOrgSearch] = useState('');
  const [orgCategory, setOrgCategory] = useState<string>('ALL');
  const [orgStatus, setOrgStatus] = useState<string>('ALL');
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>('ALL');

  // Filter State for Photos Tab
  const [photoSearch, setPhotoSearch] = useState('');

  // Selected Photo Modal State (Full Screen / Zoom)
  const [selectedPhotoEmp, setSelectedPhotoEmp] = useState<any | null>(null);

  // Document Verification Review Modal (HR Action)
  const [verifyingDoc, setVerifyingDoc] = useState<EmployeeDocumentItem | null>(null);
  const [verifyDecision, setVerifyDecision] = useState<'VERIFIED' | 'REJECTED'>('VERIFIED');
  const [verifyNotes, setVerifyNotes] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // ===========================================================================
  // PERSONAL EMPLOYEE DOCUMENTS STATE
  // ===========================================================================
  const [myDocuments, setMyDocuments] = useState<EmployeeDocumentItem[]>([]);
  const [myStats, setMyStats] = useState<EmployeeDocumentStats | null>(null);
  const [isMyLoading, setIsMyLoading] = useState(true);
  const [myError, setMyError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Filters for Personal Tab
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Company Policies State
  const [policies, setPolicies] = useState<any[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(false);

  // Upload Modal State (Personal)
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

  // Delete Confirmation Modal (Personal)
  const [deletingItem, setDeletingItem] = useState<EmployeeDocumentItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ===========================================================================
  // DATA LOADERS
  // ===========================================================================

  // Load Organization-Wide Documents & Staff Photo Roster
  const loadOrgDocuments = useCallback(async () => {
    if (!isHR) return;
    setIsOrgLoading(true);
    setOrgError(null);
    try {
      const res = await documentsApi.getAllDocuments({
        category: orgCategory !== 'ALL' ? orgCategory : undefined,
        status: orgStatus !== 'ALL' ? orgStatus : undefined,
        search: orgSearch.trim() || undefined,
        employeeId: filterEmployeeId !== 'ALL' ? filterEmployeeId : undefined,
      });
      setOrgDocuments(res.items || []);
      setOrgStats(res.stats || null);
      setEmployeeRoster(res.employees || []);
    } catch (err: any) {
      setOrgError(err.message || 'Failed to retrieve organization documents.');
    } finally {
      setIsOrgLoading(false);
    }
  }, [isHR, orgCategory, orgStatus, orgSearch, filterEmployeeId]);

  // Load Personal Documents
  const loadMyDocuments = useCallback(async () => {
    setIsMyLoading(true);
    setMyError(null);
    try {
      const res = await documentsApi.getMyDocuments();
      setMyDocuments(res.items || []);
      setMyStats(res.stats || null);
    } catch (err: any) {
      setMyError(err.message || 'Failed to retrieve your personal documents.');
    } finally {
      setIsMyLoading(false);
    }
  }, []);

  // Load Company Policies
  const loadPolicies = useCallback(async () => {
    setPoliciesLoading(true);
    try {
      const data = await documentsApi.getCompanyPolicies();
      setPolicies(data || []);
    } catch {
      // Non-fatal
    } finally {
      setPoliciesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMyDocuments();
    loadPolicies();
    if (isHR) {
      loadOrgDocuments();
    }
  }, [loadMyDocuments, loadPolicies, loadOrgDocuments, isHR]);

  // ===========================================================================
  // HANDLERS
  // ===========================================================================

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadValidationErr(null);
    if (!e.target.files || e.target.files.length === 0) {
      setUploadFile(null);
      return;
    }
    const file = e.target.files[0];

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
      if (isHR) loadOrgDocuments();
    } catch (err: any) {
      setUploadValidationErr(err.message || 'Failed to upload document. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  // Preview Document (handles both personal and organization items)
  const handleOpenPreview = async (doc: EmployeeDocumentItem, isOrg = false) => {
    setPreviewItem(doc);
    setPreviewBlobUrl(null);
    setPreviewLoading(true);
    try {
      const res = isOrg
        ? await documentsApi.getOrganizationPreviewBlob(doc.id)
        : await documentsApi.getPreviewBlob(doc.id);
      setPreviewBlobUrl(res.url);
    } catch (err: any) {
      setActionError(err.message || 'Failed to generate secure document preview.');
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

  // Download Document
  const handleDownload = async (doc: EmployeeDocumentItem, isOrg = false) => {
    setActionError(null);
    try {
      if (isOrg) {
        await documentsApi.downloadOrganizationDocument(doc.id, doc.documentName);
      } else {
        await documentsApi.downloadMyDocument(doc.id, doc.documentName);
      }
    } catch (err: any) {
      setActionError(err.message || 'Download failed. Please check permissions.');
    }
  };

  // Delete Document (Personal)
  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    setIsDeleting(true);
    setActionError(null);
    try {
      await documentsApi.deleteMyDocument(deletingItem.id);
      setActionSuccess(`"${deletingItem.documentName}" was deleted successfully.`);
      setDeletingItem(null);
      loadMyDocuments();
      if (isHR) loadOrgDocuments();
    } catch (err: any) {
      setActionError(err.message || 'Failed to delete document.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Submit HR Verification
  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyingDoc) return;
    setIsVerifying(true);
    try {
      await documentsApi.verifyDocument(verifyingDoc.id, {
        decision: verifyDecision,
        notes: verifyNotes.trim() || undefined,
      });
      setActionSuccess(
        `Document "${verifyingDoc.documentName}" successfully marked as ${verifyDecision}.`,
      );
      setVerifyingDoc(null);
      setVerifyNotes('');
      loadOrgDocuments();
    } catch (err: any) {
      setActionError(err.message || 'Failed to submit document verification review.');
    } finally {
      setIsVerifying(false);
    }
  };

  // Download Employee Profile Photo directly
  const handleDownloadPhoto = (emp: any) => {
    if (emp.photoDocumentId) {
      documentsApi.downloadOrganizationDocument(
        emp.photoDocumentId,
        `${emp.employeeCode}_${emp.displayName.replace(/\s+/g, '_')}_Photo`,
      );
      return;
    }
    if (emp.profilePhoto) {
      const a = document.createElement('a');
      a.href = emp.profilePhoto;
      a.download = `${emp.employeeCode}_${emp.displayName.replace(/\s+/g, '_')}_Photo.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // Filtered Personal Documents
  const filteredMyDocuments = useMemo(() => {
    return myDocuments.filter((doc) => {
      if (selectedCategory !== 'ALL' && doc.documentType !== selectedCategory) return false;
      if (selectedStatus !== 'ALL' && doc.status !== selectedStatus) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = doc.documentName.toLowerCase().includes(query);
        const matchesNumber = doc.documentNumber?.toLowerCase().includes(query) ?? false;
        const matchesType = doc.documentType.toLowerCase().includes(query);
        if (!matchesName && !matchesNumber && !matchesType) return false;
      }
      return true;
    });
  }, [myDocuments, selectedCategory, selectedStatus, searchQuery]);

  // Filtered Employee Photos for Photos Tab
  const filteredPhotoRoster = useMemo(() => {
    if (!photoSearch.trim()) return employeeRoster;
    const term = photoSearch.toLowerCase();
    return employeeRoster.filter(
      (emp) =>
        emp.displayName.toLowerCase().includes(term) ||
        emp.employeeCode.toLowerCase().includes(term) ||
        emp.designation.toLowerCase().includes(term) ||
        emp.department.toLowerCase().includes(term) ||
        emp.email.toLowerCase().includes(term),
    );
  }, [employeeRoster, photoSearch]);

  // Category display configuration
  const getCategoryMeta = (cat: string) => {
    switch (cat) {
      case 'PHOTO':
        return {
          label: 'Passport Photo',
          color: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        };
      case 'GOVT_ID':
        return { label: 'Government ID', color: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'APPOINTMENT_LETTER':
        return {
          label: 'Appointment / Offer',
          color: 'bg-purple-50 text-purple-700 border-purple-200',
        };
      case 'EDUCATION':
      case 'ACADEMIC':
        return {
          label: 'Education & Degree',
          color: 'bg-teal-50 text-teal-700 border-teal-200',
        };
      case 'EXPERIENCE':
        return {
          label: 'Prior Employment',
          color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        };
      case 'COMPLIANCE':
        return {
          label: 'Statutory Compliance',
          color: 'bg-amber-50 text-amber-800 border-amber-200',
        };
      case 'ADDRESS_PROOF':
        return { label: 'Address Proof', color: 'bg-orange-50 text-orange-700 border-orange-200' };
      case 'TAX':
        return { label: 'Tax Declaration', color: 'bg-stone-100 text-stone-700 border-stone-200' };
      default:
        return {
          label: cat.replace(/_/g, ' '),
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
            <FileX2 className="h-3.5 w-3.5 text-rose-600" /> Rejected / Action Req
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
                {isHR ? 'HR Document Management & Employee Vault' : 'Secure Document Library'}
              </h1>
            </div>
            <p className="text-sm text-stone-500 mt-1">
              {isHR
                ? 'Centralized document repository, official employee identity photos, and verification records across ADT-AI Training Foundation.'
                : 'Encrypted, access-controlled vault for your identity, educational records, credentials, and company policies.'}
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

        {/* Global Feedback Banners */}
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
          <Card className="p-4 bg-white border-stone-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                {isHR ? 'Organization Documents' : 'My Documents'}
              </span>
              <FileText className="h-4 w-4 text-stone-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-stone-900 mt-2">
              {isHR
                ? (orgStats?.total ?? (isOrgLoading ? '—' : orgDocuments.length))
                : (myStats?.total ?? (isMyLoading ? '—' : myDocuments.length))}
            </div>
            <span className="text-[11px] text-stone-400">
              {isHR ? 'Stored across all staff' : 'Stored in private vault'}
            </span>
          </Card>

          <Card className="p-4 bg-white border-stone-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                HR Verified Records
              </span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-700 mt-2">
              {isHR
                ? (orgStats?.verified ?? (isOrgLoading ? '—' : 0))
                : (myStats?.verified ?? (isMyLoading ? '—' : 0))}
            </div>
            <span className="text-[11px] text-emerald-600">Compliance verified</span>
          </Card>

          <Card className="p-4 bg-white border-stone-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                {isHR ? 'Staff Members with Docs' : 'Pending Verification'}
              </span>
              {isHR ? (
                <Users className="h-4 w-4 text-indigo-500" />
              ) : (
                <Clock className="h-4 w-4 text-amber-500" />
              )}
            </div>
            <div className="text-2xl font-bold font-mono text-stone-900 mt-2">
              {isHR
                ? (orgStats?.totalEmployees ?? (isOrgLoading ? '—' : employeeRoster.length))
                : (myStats?.pending ?? (isMyLoading ? '—' : 0))}
            </div>
            <span className="text-[11px] text-stone-400">
              {isHR ? 'Active staff enrolled' : 'Awaiting HR review'}
            </span>
          </Card>

          <Card className="p-4 bg-white border-stone-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                {isHR ? 'Employee Photos on File' : 'Expiry Alerts'}
              </span>
              {isHR ? (
                <Camera className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-rose-500" />
              )}
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-700 mt-2">
              {isHR
                ? (orgStats?.totalPhotos ?? (isOrgLoading ? '—' : employeeRoster.length))
                : (myStats?.expiringSoon || 0) + (myStats?.expired || 0)}
            </div>
            <span className="text-[11px] text-emerald-600">
              {isHR ? 'Official identity photos' : 'Requires renewal'}
            </span>
          </Card>
        </div>

        {/* View Selection Tabs */}
        <div className="flex items-center gap-2 border-b border-stone-200 overflow-x-auto">
          {isHR && (
            <>
              <button
                onClick={() => setActiveTab('vault')}
                className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'vault'
                    ? 'border-amber-600 text-amber-800'
                    : 'border-transparent text-stone-500 hover:text-stone-800'
                }`}
              >
                <Building2 className="h-4 w-4" /> Organization Vault (All Employees) (
                {orgDocuments.length})
              </button>
              <button
                onClick={() => setActiveTab('photos')}
                className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'photos'
                    ? 'border-amber-600 text-amber-800'
                    : 'border-transparent text-stone-500 hover:text-stone-800'
                }`}
              >
                <Camera className="h-4 w-4" /> Employee Identity Photos ({employeeRoster.length})
              </button>
            </>
          )}

          <button
            onClick={() => setActiveTab('my')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'my'
                ? 'border-amber-600 text-amber-800'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <FolderLock className="h-4 w-4" /> My Documents ({myDocuments.length})
          </button>
          <button
            onClick={() => setActiveTab('policies')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'policies'
                ? 'border-amber-600 text-amber-800'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <FileText className="h-4 w-4" /> Company Policies & Handbooks ({policies.length})
          </button>
        </div>

        {/* =======================================================================
         * TAB 1: ORGANIZATION VAULT (ALL EMPLOYEES) - FOR HR / ADMIN
         * ======================================================================= */}
        {activeTab === 'vault' && isHR && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <Card className="p-4 border-stone-200 bg-white space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                {/* Search Input */}
                <div className="md:col-span-4 relative">
                  <Search className="h-4 w-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by employee name, code, title..."
                    value={orgSearch}
                    onChange={(e) => setOrgSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-stone-50/50 text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                {/* Filter by Employee */}
                <div className="md:col-span-3">
                  <select
                    value={filterEmployeeId}
                    onChange={(e) => setFilterEmployeeId(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="ALL">All Staff Members ({employeeRoster.length})</option>
                    {employeeRoster.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.displayName} ({emp.employeeCode})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filter by Category */}
                <div className="md:col-span-2">
                  <select
                    value={orgCategory}
                    onChange={(e) => setOrgCategory(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="ALL">All Categories</option>
                    <option value="PHOTO">Passport Photo</option>
                    <option value="GOVT_ID">Government ID</option>
                    <option value="APPOINTMENT_LETTER">Appointment Letter</option>
                    <option value="EDUCATION">Education & Degree</option>
                    <option value="COMPLIANCE">Statutory Compliance</option>
                    <option value="EXPERIENCE">Prior Employment</option>
                  </select>
                </div>

                {/* Filter by Status */}
                <div className="md:col-span-2">
                  <select
                    value={orgStatus}
                    onChange={(e) => setOrgStatus(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="VERIFIED">Verified</option>
                    <option value="PENDING">Pending Review</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </div>

                {/* Reset Button */}
                <div className="md:col-span-1 flex justify-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setOrgSearch('');
                      setOrgCategory('ALL');
                      setOrgStatus('ALL');
                      setFilterEmployeeId('ALL');
                      loadOrgDocuments();
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
            {isOrgLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            ) : orgError ? (
              <Card className="p-8 text-center border-rose-200 bg-rose-50/50">
                <AlertCircle className="h-8 w-8 text-rose-500 mx-auto mb-2" />
                <p className="text-sm font-semibold text-rose-800">{orgError}</p>
                <Button
                  size="sm"
                  onClick={loadOrgDocuments}
                  className="mt-3 bg-rose-600 text-white text-xs"
                >
                  Retry
                </Button>
              </Card>
            ) : orgDocuments.length === 0 ? (
              <Card className="p-12 text-center border-dashed border-stone-300 bg-white">
                <FolderLock className="h-10 w-10 text-stone-300 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-stone-800">No documents found</h3>
                <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
                  No employee documents matched the selected filters.
                </p>
              </Card>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-xs">
                <table className="w-full text-left text-xs text-stone-700">
                  <thead className="bg-stone-50/80 text-[11px] font-semibold uppercase tracking-wider text-stone-500 border-b border-stone-200">
                    <tr>
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-4">Document Title</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Document Ref #</th>
                      <th className="py-3 px-4">Date Stored</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 font-medium">
                    {orgDocuments.map((doc) => {
                      const catMeta = getCategoryMeta(doc.documentType);
                      return (
                        <tr key={doc.id} className="hover:bg-stone-50/60 transition-colors">
                          {/* Employee Info with Photo Thumbnail */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              {doc.profilePhoto ? (
                                <img
                                  src={doc.profilePhoto}
                                  alt={doc.employeeName || 'Staff'}
                                  className="h-9 w-9 rounded-full object-cover border border-amber-300 shadow-2xs shrink-0"
                                />
                              ) : (
                                <div className="h-9 w-9 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs shrink-0">
                                  {(doc.employeeName || 'E').charAt(0)}
                                </div>
                              )}
                              <div className="min-w-0">
                                <span className="font-bold text-stone-900 block truncate">
                                  {doc.employeeName || 'Staff Member'}
                                </span>
                                <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
                                  <span className="font-mono text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                    {doc.employeeCode || 'EMP'}
                                  </span>
                                  <span className="truncate">
                                    {doc.departmentName || 'General'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Document Title */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="p-1.5 bg-stone-100 rounded text-stone-600 shrink-0">
                                {doc.mimeType?.includes('pdf') ? (
                                  <FileText className="h-4 w-4 text-rose-600" />
                                ) : doc.mimeType?.includes('image') ? (
                                  <Camera className="h-4 w-4 text-blue-600" />
                                ) : (
                                  <FileCode className="h-4 w-4 text-amber-600" />
                                )}
                              </span>
                              <div>
                                <span className="font-semibold text-stone-900 block">
                                  {doc.documentName}
                                </span>
                                <span className="text-[10px] text-stone-400 font-mono">
                                  {doc.fileSizeFormatted}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Category Badge */}
                          <td className="py-3 px-4">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold border ${catMeta.color}`}
                            >
                              {catMeta.label}
                            </span>
                          </td>

                          {/* Document Number */}
                          <td className="py-3 px-4 font-mono text-stone-600">
                            {doc.documentNumber || '—'}
                          </td>

                          {/* Upload Date */}
                          <td className="py-3 px-4 text-stone-500">
                            {new Date(doc.createdAt).toLocaleDateString([], {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </td>

                          {/* Status */}
                          <td className="py-3 px-4">{getStatusBadge(doc.status)}</td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleOpenPreview(doc, true)}
                                title="Preview Document"
                                className="p-1.5 h-7 w-7 text-stone-500 hover:text-stone-900 border-stone-200"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleDownload(doc, true)}
                                title="Download Document"
                                className="p-1.5 h-7 w-7 text-stone-500 hover:text-stone-900 border-stone-200"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                              {doc.status !== 'VERIFIED' && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setVerifyingDoc(doc);
                                    setVerifyDecision('VERIFIED');
                                    setVerifyNotes('');
                                  }}
                                  className="h-7 px-2 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1"
                                >
                                  <ShieldCheck className="h-3 w-3" /> Verify
                                </Button>
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
        )}

        {/* =======================================================================
         * TAB 2: EMPLOYEE IDENTITY PHOTOS - DEDICATED VISUAL GALLERY
         * ======================================================================= */}
        {activeTab === 'photos' && isHR && (
          <div className="space-y-4">
            {/* Gallery Header & Search */}
            <Card className="p-5 border-stone-200 bg-white">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                    <Camera className="h-5 w-5 text-amber-600" />
                    Official Employee Identity Photos
                  </h2>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Verified passport photographs and biometric photo records for all personnel of
                    ADT-AI Training Foundation.
                  </p>
                </div>

                <div className="w-full md:w-72 relative">
                  <Search className="h-4 w-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by name, code or department..."
                    value={photoSearch}
                    onChange={(e) => setPhotoSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-stone-50/50 text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>
            </Card>

            {/* Photo Cards Grid */}
            {isOrgLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-72 w-full rounded-2xl" />
                ))}
              </div>
            ) : filteredPhotoRoster.length === 0 ? (
              <Card className="p-12 text-center border-dashed border-stone-300 bg-white">
                <Camera className="h-10 w-10 text-stone-300 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-stone-800">No personnel found</h3>
                <p className="text-xs text-stone-500 mt-1">
                  No staff members matched your search criteria.
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredPhotoRoster.map((emp) => (
                  <Card
                    key={emp.id}
                    className="p-5 border-stone-200 bg-white hover:border-amber-300 transition-all flex flex-col justify-between group shadow-2xs hover:shadow-xs rounded-2xl"
                  >
                    <div>
                      {/* Top Bar: Code badge & Verification status */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="font-mono text-[11px] font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                          {emp.employeeCode}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Photo Verified
                        </span>
                      </div>

                      {/* Photo Container */}
                      <div className="relative my-3 flex justify-center">
                        {emp.profilePhoto ? (
                          <div className="relative group/photo">
                            <img
                              src={emp.profilePhoto}
                              alt={emp.displayName}
                              className="w-28 h-28 object-cover rounded-2xl border-2 border-stone-200 group-hover:border-amber-500 transition-all shadow-xs"
                            />
                            <button
                              onClick={() => setSelectedPhotoEmp(emp)}
                              title="Enlarge Photo"
                              className="absolute inset-0 bg-stone-900/40 rounded-2xl opacity-0 group-hover/photo:opacity-100 flex items-center justify-center text-white transition-opacity backdrop-blur-2xs"
                            >
                              <ZoomIn className="h-6 w-6" />
                            </button>
                          </div>
                        ) : (
                          <div className="w-28 h-28 rounded-2xl bg-stone-100 border-2 border-dashed border-stone-300 flex items-center justify-center text-stone-400 font-bold text-2xl">
                            {emp.displayName.charAt(0)}
                          </div>
                        )}
                      </div>

                      {/* Personnel Metadata */}
                      <div className="text-center space-y-1">
                        <h3 className="font-bold text-sm text-stone-900 truncate">
                          {emp.displayName}
                        </h3>
                        <p className="text-xs text-amber-800 font-medium truncate">
                          {emp.designation}
                        </p>
                        <p className="text-[11px] text-stone-500 truncate">{emp.department}</p>
                        <div className="pt-2 flex items-center justify-center gap-1 text-[11px] text-stone-500">
                          <Mail className="h-3 w-3 text-stone-400" />
                          <span className="truncate">{emp.email}</span>
                        </div>
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="mt-4 pt-3 border-t border-stone-100 flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setSelectedPhotoEmp(emp)}
                        className="flex-1 text-[11px] py-1.5 h-8 border-stone-200 text-stone-700 hover:text-stone-900 flex items-center justify-center gap-1"
                      >
                        <ZoomIn className="h-3 w-3" /> View
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleDownloadPhoto(emp)}
                        className="flex-1 text-[11px] py-1.5 h-8 border-stone-200 text-stone-700 hover:text-stone-900 flex items-center justify-center gap-1"
                      >
                        <Download className="h-3 w-3" /> Download
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setFilterEmployeeId(emp.id);
                          setActiveTab('vault');
                        }}
                        title="View employee all documents"
                        className="p-1.5 h-8 w-8 bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 shrink-0"
                      >
                        <FolderLock className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* =======================================================================
         * TAB 3: MY PERSONAL DOCUMENTS
         * ======================================================================= */}
        {activeTab === 'my' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <Card className="p-4 border-stone-200 bg-white space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
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
            {isMyLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            ) : myError ? (
              <Card className="p-8 text-center border-rose-200 bg-rose-50/50">
                <AlertCircle className="h-8 w-8 text-rose-500 mx-auto mb-2" />
                <p className="text-sm font-semibold text-rose-800">{myError}</p>
                <Button
                  size="sm"
                  onClick={loadMyDocuments}
                  className="mt-3 bg-rose-600 text-white text-xs"
                >
                  Retry
                </Button>
              </Card>
            ) : filteredMyDocuments.length === 0 ? (
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
                    {filteredMyDocuments.map((doc) => {
                      const catMeta = getCategoryMeta(doc.documentType);
                      return (
                        <tr key={doc.id} className="hover:bg-stone-50/60 transition-colors">
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
                                <span className="text-[10px] text-stone-400 font-mono">
                                  {doc.fileSizeFormatted}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold border ${catMeta.color}`}
                            >
                              {catMeta.label}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-stone-600">
                            {doc.documentNumber || '—'}
                          </td>
                          <td className="py-3.5 px-4 text-stone-500">
                            {new Date(doc.createdAt).toLocaleDateString([], {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </td>
                          <td className="py-3.5 px-4 text-stone-500">
                            {doc.expiryDate ? (
                              <span
                                className={
                                  doc.isExpired
                                    ? 'text-rose-600 font-bold'
                                    : doc.isExpiringSoon
                                      ? 'text-amber-700 font-bold'
                                      : 'text-stone-600'
                                }
                              >
                                {doc.expiryDate}
                              </span>
                            ) : (
                              'No Expiry'
                            )}
                          </td>
                          <td className="py-3.5 px-4">{getStatusBadge(doc.status)}</td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleOpenPreview(doc, false)}
                                title="Preview Document"
                                className="p-1.5 h-7 w-7 text-stone-500 hover:text-stone-900 border-stone-200"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleDownload(doc, false)}
                                title="Download Document"
                                className="p-1.5 h-7 w-7 text-stone-500 hover:text-stone-900 border-stone-200"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                              {doc.canDelete && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setDeletingItem(doc)}
                                  title="Delete Document"
                                  className="p-1.5 h-7 w-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50 border-stone-200"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
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
        )}

        {/* =======================================================================
         * TAB 4: COMPANY POLICIES & HANDBOOKS
         * ======================================================================= */}
        {activeTab === 'policies' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {policiesLoading ? (
                <>
                  <Skeleton className="h-32 w-full rounded-xl" />
                  <Skeleton className="h-32 w-full rounded-xl" />
                </>
              ) : (
                policies.map((p: any) => (
                  <Card
                    key={p.id}
                    className="p-5 border-stone-200 bg-white hover:border-amber-300 transition-all flex flex-col justify-between shadow-2xs"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="p-2 bg-amber-50 text-amber-800 rounded-lg border border-amber-200/60">
                            <FileText className="h-4 w-4" />
                          </span>
                          <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-stone-100 text-stone-600">
                            {p.category}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-stone-400">
                          {p.fileSizeFormatted}
                        </span>
                      </div>
                      <h3 className="font-bold text-stone-900 text-sm mt-3">{p.title}</h3>
                      <p className="text-xs text-stone-500 mt-1 line-clamp-2">{p.description}</p>
                    </div>

                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-stone-100">
                      <span className="text-[11px] text-stone-400">
                        Effective: {p.updatedAt || 'Current'}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          alert(
                            `Official handbook "${p.title}" is published under ADT-AI Training Foundation governance standards.`,
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

        {/* =======================================================================
         * MODAL: ENLARGED EMPLOYEE IDENTITY PHOTO (WITH ZOOM & DOWNLOAD)
         * ======================================================================= */}
        {selectedPhotoEmp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4 animate-scale-in">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-amber-100 text-amber-800 rounded-lg">
                    <Camera className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="font-bold text-stone-900 text-sm">
                      {selectedPhotoEmp.displayName}
                    </h3>
                    <span className="text-[11px] text-stone-400 font-mono">
                      {selectedPhotoEmp.employeeCode} • {selectedPhotoEmp.designation}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPhotoEmp(null)}
                  className="text-stone-400 hover:text-stone-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Photo Display */}
              <div className="flex flex-col items-center justify-center p-4 bg-stone-50 rounded-xl border border-stone-200">
                {selectedPhotoEmp.profilePhoto ? (
                  <img
                    src={selectedPhotoEmp.profilePhoto}
                    alt={selectedPhotoEmp.displayName}
                    className="max-h-72 w-auto object-contain rounded-xl border-2 border-stone-300 shadow-md"
                  />
                ) : (
                  <div className="w-48 h-48 rounded-xl bg-stone-200 flex items-center justify-center text-stone-500 font-bold text-4xl">
                    {selectedPhotoEmp.displayName.charAt(0)}
                  </div>
                )}
                <div className="mt-3 text-center">
                  <p className="text-xs font-semibold text-stone-800">
                    {selectedPhotoEmp.department}
                  </p>
                  <p className="text-[11px] text-stone-500">{selectedPhotoEmp.email}</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-stone-100">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setFilterEmployeeId(selectedPhotoEmp.id);
                    setSelectedPhotoEmp(null);
                    setActiveTab('vault');
                  }}
                  className="text-xs border-stone-200 text-stone-700"
                >
                  <FolderLock className="h-3.5 w-3.5 mr-1" /> View Vault Documents
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleDownloadPhoto(selectedPhotoEmp)}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1"
                  >
                    <Download className="h-3.5 w-3.5" /> Download Photo
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =======================================================================
         * MODAL: HR DOCUMENT VERIFICATION REVIEW
         * ======================================================================= */}
        {verifyingDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 space-y-4 animate-scale-in">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="font-bold text-stone-900 text-sm">Verify Employee Document</h3>
                    <span className="text-[11px] text-stone-400">
                      Official HR verification workflow
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setVerifyingDoc(null)}
                  className="text-stone-400 hover:text-stone-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="bg-stone-50 p-3 rounded-xl border border-stone-200 text-xs space-y-1">
                <p>
                  <strong>Employee:</strong> {verifyingDoc.employeeName} (
                  {verifyingDoc.employeeCode})
                </p>
                <p>
                  <strong>Document:</strong> {verifyingDoc.documentName}
                </p>
                <p>
                  <strong>Category:</strong> {verifyingDoc.documentType}
                </p>
                {verifyingDoc.documentNumber && (
                  <p>
                    <strong>Reference #:</strong> {verifyingDoc.documentNumber}
                  </p>
                )}
              </div>

              <form onSubmit={handleVerifySubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    Verification Decision <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setVerifyDecision('VERIFIED')}
                      className={`p-3 rounded-xl border text-center font-semibold transition-all ${
                        verifyDecision === 'VERIFIED'
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-800 shadow-2xs'
                          : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                      }`}
                    >
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
                      Approve & Verify
                    </button>
                    <button
                      type="button"
                      onClick={() => setVerifyDecision('REJECTED')}
                      className={`p-3 rounded-xl border text-center font-semibold transition-all ${
                        verifyDecision === 'REJECTED'
                          ? 'border-rose-600 bg-rose-50 text-rose-800 shadow-2xs'
                          : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                      }`}
                    >
                      <FileX2 className="h-5 w-5 text-rose-600 mx-auto mb-1" />
                      Reject / Revision Req
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    Reviewer Notes / Feedback (Optional)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Provide notes or explain reasons if requiring re-upload..."
                    value={verifyNotes}
                    onChange={(e) => setVerifyNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500 text-xs"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isVerifying}
                    onClick={() => setVerifyingDoc(null)}
                    className="border-stone-300 text-stone-700 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isVerifying}
                    className={`text-white text-xs font-semibold ${
                      verifyDecision === 'VERIFIED'
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : 'bg-rose-600 hover:bg-rose-700'
                    }`}
                  >
                    {isVerifying ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> Submitting...
                      </>
                    ) : (
                      `Submit ${verifyDecision === 'VERIFIED' ? 'Approval' : 'Rejection'}`
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* =======================================================================
         * MODAL: UPLOAD DOCUMENT (PERSONAL VAULT)
         * ======================================================================= */}
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
                      <Upload className="h-6 w-6 text-stone-400 mx-auto mb-1" />
                      {uploadFile ? (
                        <span className="font-semibold text-amber-700 block truncate max-w-xs mx-auto">
                          {uploadFile.name} ({(uploadFile.size / (1024 * 1024)).toFixed(2)} MB)
                        </span>
                      ) : (
                        <>
                          <span className="text-stone-700 font-semibold block">
                            Click to select a file
                          </span>
                          <span className="text-stone-400 text-[11px] block mt-0.5">
                            PDF, JPG, PNG, WEBP, or DOCX up to 10 MB
                          </span>
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
         * MODAL: SECURE DOCUMENT PREVIEW
         * ======================================================================= */}
        {previewItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl max-w-3xl w-full h-[85vh] flex flex-col shadow-2xl border border-stone-200 animate-scale-in">
              <div className="p-4 border-b border-stone-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-stone-900 text-sm">{previewItem.documentName}</h3>
                  <span className="text-[11px] text-stone-400 font-mono">
                    {previewItem.documentType} • {previewItem.fileSizeFormatted}
                    {previewItem.employeeName ? ` • ${previewItem.employeeName}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleDownload(previewItem, isHR)}
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
                        onClick={() => handleDownload(previewItem, isHR)}
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
         * MODAL: DELETE CONFIRMATION (PERSONAL)
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
