'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '../../../layouts/AppShell';
import {
  Button,
  Input,
  Badge,
  Toast,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Dialog,
  Switch,
} from '@hrms/ui';
import {
  MapPin,
  Plus,
  Compass,
  Edit2,
  Trash2,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Building2,
  Radio,
  Navigation,
  RefreshCw,
  Sliders,
} from 'lucide-react';
import { officeLocationsApi, organizationApi } from '../../../lib/api-client';
import { useAuth } from '../../../context/AuthContext';
import {
  OfficeLocationDto,
  LocationValidationOutcome,
  LocationValidationResultDto,
} from '@hrms/types';

export default function OfficeLocationsPage() {
  const { isAuthenticated } = useAuth();
  const [locations, setLocations] = useState<OfficeLocationDto[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [toastMessage, setToastMessage] = useState<{
    type: 'success' | 'error' | 'warning';
    title: string;
    message: string;
  } | null>(null);

  // Modal State for Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<OfficeLocationDto | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    branchId: '',
    address: '',
    latitude: '',
    longitude: '',
    geofenceRadiusMeters: 100,
    timezone: 'Asia/Kolkata',
    isActive: true,
  });

  // Modal State for Live Testing Sandbox
  const [isSandboxOpen, setIsSandboxOpen] = useState(false);
  const [sandboxTargetId, setSandboxTargetId] = useState<string>('');
  const [sandboxLat, setSandboxLat] = useState<string>('');
  const [sandboxLng, setSandboxLng] = useState<string>('');
  const [sandboxAccuracy, setSandboxAccuracy] = useState<string>('15');
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<LocationValidationResultDto | null>(
    null,
  );

  // Delete Confirm State
  const [deletingLocation, setDeletingLocation] = useState<OfficeLocationDto | null>(null);

  const fetchLocations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await officeLocationsApi.getAll({
        search: search.trim() || undefined,
        branchId: selectedBranch !== 'ALL' ? selectedBranch : undefined,
      });
      if (res.data) {
        setLocations(res.data);
      }
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        title: 'Failed to load locations',
        message: err.message || 'Could not fetch office locations.',
      });
    } finally {
      setLoading(false);
    }
  }, [search, selectedBranch]);

  const fetchBranches = async () => {
    try {
      const res = await organizationApi.getBranches({ limit: 100 });
      if (Array.isArray(res)) {
        setBranches(res);
      }
    } catch {
      // Branch list fetch optional
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchLocations();
      fetchBranches();
    }
  }, [fetchLocations, isAuthenticated]);

  const handleOpenCreateModal = () => {
    setEditingLocation(null);
    setFormData({
      name: '',
      code: '',
      branchId: branches[0]?.id || '',
      address: '',
      latitude: '',
      longitude: '',
      geofenceRadiusMeters: 100,
      timezone: 'Asia/Kolkata',
      isActive: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (loc: OfficeLocationDto) => {
    setEditingLocation(loc);
    setFormData({
      name: loc.name,
      code: loc.code || '',
      branchId: loc.branchId || '',
      address: loc.address || '',
      latitude: String(loc.latitude),
      longitude: String(loc.longitude),
      geofenceRadiusMeters: loc.geofenceRadiusMeters,
      timezone: loc.timezone || 'Asia/Kolkata',
      isActive: loc.isActive,
    });
    setIsModalOpen(true);
  };

  const handleGetDeviceCoordsForForm = () => {
    if (!navigator.geolocation) {
      setToastMessage({
        type: 'warning',
        title: 'Geolocation Unavailable',
        message: 'Browser does not support HTML5 geolocation.',
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData((prev) => ({
          ...prev,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        setToastMessage({
          type: 'success',
          title: 'Coordinates Detected',
          message: `Captured lat: ${pos.coords.latitude.toFixed(4)}, lng: ${pos.coords.longitude.toFixed(4)}`,
        });
      },
      (err) => {
        setToastMessage({
          type: 'error',
          title: 'GPS Access Denied',
          message: err.message || 'Please grant browser location permissions.',
        });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setToastMessage({
        type: 'warning',
        title: 'Validation Error',
        message: 'Office name is required.',
      });
      return;
    }
    const lat = parseFloat(formData.latitude);
    const lng = parseFloat(formData.longitude);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      setToastMessage({
        type: 'warning',
        title: 'Invalid Latitude',
        message: 'Latitude must be between -90 and 90.',
      });
      return;
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      setToastMessage({
        type: 'warning',
        title: 'Invalid Longitude',
        message: 'Longitude must be between -180 and 180.',
      });
      return;
    }

    if (!isAuthenticated) {
      setToastMessage({
        type: 'error',
        title: 'Authentication Required',
        message: 'You must be signed in as Admin to save office locations.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        code: formData.code.trim() || undefined,
        branchId: formData.branchId || undefined,
        address: formData.address.trim() || undefined,
        latitude: lat,
        longitude: lng,
        geofenceRadiusMeters: Number(formData.geofenceRadiusMeters) || 100,
        timezone: formData.timezone || 'Asia/Kolkata',
        isActive: formData.isActive,
      };

      if (editingLocation) {
        await officeLocationsApi.update(editingLocation.id, payload);
        setToastMessage({
          type: 'success',
          title: 'Office Location Updated',
          message: `${formData.name} updated successfully.`,
        });
      } else {
        await officeLocationsApi.create(payload);
        setToastMessage({
          type: 'success',
          title: 'Office Location Created',
          message: `${formData.name} perimeter configured successfully.`,
        });
      }

      setIsModalOpen(false);
      fetchLocations();
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        title: 'Operation Failed',
        message: err.message || 'Could not save office location.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingLocation) return;
    try {
      await officeLocationsApi.delete(deletingLocation.id);
      setToastMessage({
        type: 'success',
        title: 'Location Removed',
        message: `${deletingLocation.name} removed successfully.`,
      });
      setDeletingLocation(null);
      fetchLocations();
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        title: 'Delete Failed',
        message: err.message || 'Could not delete location.',
      });
    }
  };

  // Sandbox Functions
  const handleOpenSandbox = (loc?: OfficeLocationDto) => {
    const target = loc || locations[0];
    if (target) {
      setSandboxTargetId(target.id);
      // Pre-fill with office coordinates as a starting test point
      setSandboxLat(String(target.latitude));
      setSandboxLng(String(target.longitude));
    }
    setSandboxAccuracy('15');
    setValidationResult(null);
    setIsSandboxOpen(true);
  };

  const handleGetDeviceCoordsForSandbox = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSandboxLat(pos.coords.latitude.toFixed(6));
        setSandboxLng(pos.coords.longitude.toFixed(6));
        setSandboxAccuracy(Math.round(pos.coords.accuracy).toString());
      },
      (err) => {
        setToastMessage({
          type: 'error',
          title: 'GPS Error',
          message: err.message || 'Could not acquire browser GPS.',
        });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleRunValidation = async () => {
    const lat = parseFloat(sandboxLat);
    const lng = parseFloat(sandboxLng);
    if (isNaN(lat) || isNaN(lng)) {
      setToastMessage({
        type: 'warning',
        title: 'Invalid Coordinates',
        message: 'Please provide valid latitude and longitude numbers.',
      });
      return;
    }

    setIsValidating(true);
    try {
      const res = await officeLocationsApi.validateLocation({
        officeLocationId: sandboxTargetId || undefined,
        latitude: lat,
        longitude: lng,
        accuracyMeters: parseFloat(sandboxAccuracy) || undefined,
        timestamp: new Date().toISOString(),
      });
      setValidationResult(res);
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        title: 'Validation Failed',
        message: err.message || 'Failed to execute validation request.',
      });
    } finally {
      setIsValidating(false);
    }
  };

  const getOutcomeBadge = (outcome: LocationValidationOutcome) => {
    switch (outcome) {
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            VERIFIED — INSIDE GEOFENCE
          </span>
        );
      case 'OUTSIDE_GEOFENCE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-300">
            <AlertTriangle className="h-4 w-4 text-rose-600" />
            OUTSIDE GEOFENCE PERIMETER
          </span>
        );
      case 'LOW_ACCURACY':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
            <Radio className="h-4 w-4 text-amber-600" />
            LOW GPS ACCURACY (IMPRECISE)
          </span>
        );
      case 'STALE_LOCATION':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-300">
            <Clock className="h-4 w-4 text-purple-600" />
            STALE LOCATION TIMESTAMP
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-stone-100 text-stone-700 border border-stone-300">
            <AlertTriangle className="h-4 w-4 text-stone-500" />
            LOCATION UNAVAILABLE
          </span>
        );
    }
  };

  const activeLocationsCount = locations.filter((l) => l.isActive).length;
  const avgRadius =
    locations.length > 0
      ? Math.round(
          locations.reduce((acc, l) => acc + (l.geofenceRadiusMeters || 100), 0) / locations.length,
        )
      : 100;

  return (
    <AppShell requireAuth={true}>
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50">
          <Toast
            type={toastMessage.type}
            title={toastMessage.title}
            message={toastMessage.message}
            onClose={() => setToastMessage(null)}
          />
        </div>
      )}

      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-200">
          <div>
            <div className="flex items-center gap-2">
              <MapPin className="h-6 w-6 text-amber-700" />
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-stone-900">
                Office Locations & Geofence Perimeters
              </h1>
            </div>
            <p className="text-xs md:text-sm text-stone-600 mt-1">
              Admin-configurable physical office coordinates, radius thresholds, and server-side
              Haversine validation.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenSandbox()}
              leftIcon={<Compass className="h-4 w-4 text-amber-800" />}
              className="border-stone-300 hover:bg-stone-100 text-stone-800"
            >
              Test Geofence Sandbox
            </Button>
            <Button
              size="sm"
              onClick={handleOpenCreateModal}
              leftIcon={<Plus className="h-4 w-4" />}
              className="bg-amber-800 hover:bg-amber-900 text-white shadow-sm"
            >
              Add Office Location
            </Button>
          </div>
        </div>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-stone-200 bg-white shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                  Total Offices
                </p>
                <p className="text-2xl font-bold text-stone-900 mt-1">{locations.length}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-stone-100 flex items-center justify-center text-stone-700">
                <Building2 className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-stone-200 bg-white shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                  Active Geofences
                </p>
                <p className="text-2xl font-bold text-emerald-700 mt-1">{activeLocationsCount}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-stone-200 bg-white shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                  Avg Geofence Radius
                </p>
                <p className="text-2xl font-bold text-amber-800 mt-1">{avgRadius} m</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-800">
                <Radio className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-stone-200 bg-white shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                  Haversine Engine
                </p>
                <p className="text-sm font-semibold text-emerald-800 mt-1">
                  Server-side (Zero API Cost)
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700">
                <Compass className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-stone-50 p-3 rounded-lg border border-stone-200">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
            <Input
              placeholder="Search office name, code, address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm bg-white"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <select
              aria-label="Filter by assigned branch"
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="h-9 px-3 rounded-md border border-stone-300 bg-white text-xs text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-800"
            >
              <option value="ALL">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchLocations}
              className="h-9 px-3 bg-white"
              leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />}
            >
              Refresh
            </Button>
          </div>
        </div>

        {/* Office Locations Table */}
        <Card className="border-stone-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs md:text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/80 text-stone-600 font-medium">
                  <th className="py-3 px-4">Office Name & Code</th>
                  <th className="py-3 px-4">Assigned Branch</th>
                  <th className="py-3 px-4">Coordinates (Lat, Lng)</th>
                  <th className="py-3 px-4">Perimeter Radius</th>
                  <th className="py-3 px-4">Timezone</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-stone-800">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-stone-400">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-stone-400" />
                      Loading office locations...
                    </td>
                  </tr>
                ) : locations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-stone-500">
                      <MapPin className="h-8 w-8 mx-auto mb-2 text-stone-300" />
                      <p className="font-medium text-stone-700">No office locations found.</p>
                      <p className="text-xs text-stone-400 mt-1">
                        Add a new office location to configure automated geofenced check-in.
                      </p>
                      <Button
                        size="sm"
                        onClick={handleOpenCreateModal}
                        className="mt-4 bg-amber-800 hover:bg-amber-900 text-white"
                      >
                        Create First Office Location
                      </Button>
                    </td>
                  </tr>
                ) : (
                  locations.map((loc) => (
                    <tr key={loc.id} className="hover:bg-amber-50/20 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-stone-900">{loc.name}</div>
                        <div className="text-xs text-stone-500 flex items-center gap-2 mt-0.5">
                          {loc.code && (
                            <span className="font-mono bg-stone-100 px-1 rounded">{loc.code}</span>
                          )}
                          {loc.address && <span className="truncate max-w-xs">{loc.address}</span>}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-stone-700">
                        {loc.branch ? (
                          <span className="font-medium">
                            {loc.branch.name}
                            <span className="text-xs text-stone-400 ml-1">({loc.branch.code})</span>
                          </span>
                        ) : (
                          <span className="text-xs text-stone-400 italic">
                            Unassigned (HQ Default)
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-stone-600">
                        {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 font-mono text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200">
                          <Radio className="h-3 w-3 text-amber-700" />
                          {loc.geofenceRadiusMeters} meters
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-stone-600 font-mono">
                        {loc.timezone || 'Asia/Kolkata'}
                      </td>
                      <td className="py-3.5 px-4">
                        {loc.isActive ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="outline">Inactive</Badge>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenSandbox(loc)}
                            title="Test Geofence Perimeter"
                            className="text-stone-600 hover:text-amber-800"
                          >
                            <Compass className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEditModal(loc)}
                            title="Edit Office Location"
                            className="text-stone-600 hover:text-stone-900"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingLocation(loc)}
                            title="Delete / Deactivate"
                            className="text-rose-600 hover:text-rose-800 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* ======================================================================== */}
      {/* ADD / EDIT OFFICE LOCATION DIALOG */}
      {/* ======================================================================== */}
      <Dialog
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingLocation ? 'Edit Office Location Perimeter' : 'Add New Office Location'}
      >
        <form onSubmit={handleSubmitForm} className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-stone-700">Office Name *</label>
              <Input
                placeholder="e.g. Prestige Tech Cloud Campus"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-700">Location Code</label>
              <Input
                placeholder="e.g. BLR-TECH-01"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-stone-700">Assigned Branch</label>
            <select
              aria-label="Assigned corporate branch"
              value={formData.branchId}
              onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
              className="mt-1 w-full h-9 px-3 rounded-md border border-stone-300 bg-white text-xs text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-800"
            >
              <option value="">None (Organization Wide Default)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-stone-700">Physical Address</label>
            <Input
              placeholder="e.g. Tower 4, Level 6, Bellary Road, Bengaluru"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="mt-1"
            />
          </div>

          {/* Coordinates Header with GPS Autodetect Button */}
          <div className="p-3 bg-amber-50/50 rounded-lg border border-amber-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                <Navigation className="h-3.5 w-3.5 text-amber-700" />
                Geofence Coordinates (WGS 84)
              </span>
              <button
                type="button"
                onClick={handleGetDeviceCoordsForForm}
                className="text-xs text-amber-800 hover:text-amber-900 font-medium underline flex items-center gap-1"
              >
                <Compass className="h-3.5 w-3.5" />
                Capture My Current GPS
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-stone-600">Latitude (-90 to +90) *</label>
                <Input
                  type="number"
                  step="any"
                  placeholder="12.9716"
                  value={formData.latitude}
                  onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                  required
                  className="mt-1 font-mono text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-xs text-stone-600">Longitude (-180 to +180) *</label>
                <Input
                  type="number"
                  step="any"
                  placeholder="77.5946"
                  value={formData.longitude}
                  onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                  required
                  className="mt-1 font-mono text-xs bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-xs text-stone-600">Geofence Radius (meters) *</label>
                <Input
                  type="number"
                  min="10"
                  max="5000"
                  value={formData.geofenceRadiusMeters}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      geofenceRadiusMeters: parseInt(e.target.value) || 100,
                    })
                  }
                  required
                  className="mt-1 font-mono text-xs bg-white"
                />
                <span className="text-[11px] text-stone-500">Recommended: 100m - 200m</span>
              </div>
              <div>
                <label className="text-xs text-stone-600">Timezone</label>
                <Input
                  value={formData.timezone}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                  className="mt-1 font-mono text-xs bg-white"
                />
              </div>
            </div>
          </div>

          <div className="pt-1">
            <Switch
              label="Active Status"
              description="When enabled, employee attendance punches are verified against this geofence."
              checked={formData.isActive}
              onChange={(checked: any) =>
                setFormData({
                  ...formData,
                  isActive: typeof checked === 'boolean' ? checked : !!checked?.target?.checked,
                })
              }
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-stone-200">
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-amber-800 hover:bg-amber-900 text-white"
            >
              {isSubmitting ? 'Saving...' : editingLocation ? 'Update Location' : 'Create Location'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ======================================================================== */}
      {/* LIVE GEOFENCE TESTING SANDBOX MODAL */}
      {/* ======================================================================== */}
      <Dialog
        isOpen={isSandboxOpen}
        onClose={() => setIsSandboxOpen(false)}
        title="Live Geofence Testing Sandbox"
      >
        <div className="space-y-4 pt-1">
          <p className="text-xs text-stone-600">
            Simulate or test live browser coordinates against server-side Haversine distance
            calculation. Calculated entirely in pure TypeScript with zero Google Maps API costs.
          </p>

          <div className="space-y-3 p-3 bg-stone-50 rounded-lg border border-stone-200">
            <div>
              <label className="text-xs font-semibold text-stone-700">Target Office</label>
              <select
                aria-label="Target office to validate against"
                value={sandboxTargetId}
                onChange={(e) => {
                  setSandboxTargetId(e.target.value);
                  const loc = locations.find((l) => l.id === e.target.value);
                  if (loc) {
                    setSandboxLat(String(loc.latitude));
                    setSandboxLng(String(loc.longitude));
                  }
                  setValidationResult(null);
                }}
                className="mt-1 w-full h-9 px-3 rounded-md border border-stone-300 bg-white text-xs text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-800"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} (Radius: {l.geofenceRadiusMeters}m)
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-medium text-stone-600">Simulated Device Location</span>
              <button
                type="button"
                onClick={handleGetDeviceCoordsForSandbox}
                className="text-xs text-amber-800 hover:text-amber-900 font-medium underline flex items-center gap-1"
              >
                <Compass className="h-3.5 w-3.5" />
                Detect My Current GPS
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-stone-500">Latitude</label>
                <Input
                  type="number"
                  step="any"
                  value={sandboxLat}
                  onChange={(e) => setSandboxLat(e.target.value)}
                  className="mt-1 font-mono text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-stone-500">Longitude</label>
                <Input
                  type="number"
                  step="any"
                  value={sandboxLng}
                  onChange={(e) => setSandboxLng(e.target.value)}
                  className="mt-1 font-mono text-xs bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-stone-500">Reported GPS Accuracy (meters)</label>
                <Input
                  type="number"
                  value={sandboxAccuracy}
                  onChange={(e) => setSandboxAccuracy(e.target.value)}
                  className="mt-1 font-mono text-xs bg-white"
                />
                <span className="text-[10px] text-stone-400">Must be ≤ 100m to pass</span>
              </div>
              <div className="flex items-end">
                <Button
                  onClick={handleRunValidation}
                  disabled={isValidating || !sandboxTargetId}
                  className="w-full bg-amber-800 hover:bg-amber-900 text-white text-xs h-9"
                  leftIcon={
                    <Compass className={`h-3.5 w-3.5 ${isValidating ? 'animate-spin' : ''}`} />
                  }
                >
                  {isValidating ? 'Computing...' : 'Run Validation'}
                </Button>
              </div>
            </div>
          </div>

          {/* Validation Result Box */}
          {validationResult && (
            <div className="p-4 rounded-lg border border-stone-200 bg-white shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-600 uppercase tracking-wider">
                  Validation Outcome
                </span>
                {getOutcomeBadge(validationResult.outcome)}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div className="p-2.5 rounded bg-stone-50 border border-stone-100">
                  <span className="text-stone-500 block text-[11px]">
                    Computed Haversine Distance
                  </span>
                  <span className="font-mono text-stone-900 font-semibold text-sm">
                    {validationResult.distanceMeters !== null
                      ? `${validationResult.distanceMeters} m`
                      : 'N/A'}
                  </span>
                </div>
                <div className="p-2.5 rounded bg-stone-50 border border-stone-100">
                  <span className="text-stone-500 block text-[11px]">Allowed Geofence Radius</span>
                  <span className="font-mono text-stone-900 font-semibold text-sm">
                    {validationResult.allowedRadiusMeters} m
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded bg-stone-50 border border-stone-100 text-xs">
                <span className="text-stone-500 block text-[11px] mb-0.5">
                  Server Engine Assessment
                </span>
                <p className="text-stone-800 font-medium">{validationResult.message}</p>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setIsSandboxOpen(false)}>
              Close Sandbox
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ======================================================================== */}
      {/* DELETE CONFIRMATION DIALOG */}
      {/* ======================================================================== */}
      <Dialog
        isOpen={!!deletingLocation}
        onClose={() => setDeletingLocation(null)}
        title="Confirm Office Location Removal"
      >
        <div className="space-y-3 pt-2">
          <p className="text-xs text-stone-600">
            Are you sure you want to delete or deactivate{' '}
            <strong className="text-stone-900">{deletingLocation?.name}</strong>?
          </p>
          <p className="text-xs text-stone-500">
            If any historical attendance events are associated with this office location, it will be
            safely soft-deactivated instead of permanently deleted to preserve audit integrity.
          </p>
          <div className="flex items-center justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeletingLocation(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Confirm Removal
            </Button>
          </div>
        </div>
      </Dialog>
    </AppShell>
  );
}
