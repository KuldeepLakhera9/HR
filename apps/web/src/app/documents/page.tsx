'use client';

import React from 'react';
import { AppShell } from '../../layouts/AppShell';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
  DataTable,
} from '@hrms/ui';
import { Files, Download, FileText, FolderLock, Upload } from 'lucide-react';

export default function DocumentsPage() {
  const documents = [
    {
      id: '1',
      title: 'Company Code of Conduct & Ethics 2026',
      category: 'POLICY',
      fileSize: '2.4 MB',
      updatedAt: '2026-09-15',
      accessScope: 'ORGANIZATION',
    },
    {
      id: '2',
      title: 'Group Health Insurance Policy Guide',
      category: 'BENEFITS',
      fileSize: '1.8 MB',
      updatedAt: '2026-08-01',
      accessScope: 'ORGANIZATION',
    },
    {
      id: '3',
      title: 'IT Asset & Information Security Manual',
      category: 'COMPLIANCE',
      fileSize: '3.1 MB',
      updatedAt: '2026-10-01',
      accessScope: 'ORGANIZATION',
    },
    {
      id: '4',
      title: 'Standard Employment Agreement Template',
      category: 'HR_OPERATIONS',
      fileSize: '450 KB',
      updatedAt: '2026-07-20',
      accessScope: 'HR_INTERNAL',
    },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-stone-900">Document Repository</h1>
            <p className="text-xs md:text-sm text-stone-500 mt-1">
              Centralized self-hosted store for statutory policies, official letters, and employee
              files.
            </p>
          </div>
          <Button size="sm" className="self-start sm:self-auto flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Upload Document
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-xl border border-stone-200/80 shadow-xs flex items-center gap-4">
            <div className="p-3 bg-amber-50 text-amber-700 rounded-xl">
              <FolderLock className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-stone-500 font-medium">Secured Storage</p>
              <h4 className="text-lg font-bold text-stone-900 mt-0.5">Encrypted Vault</h4>
              <p className="text-[11px] text-emerald-700 font-medium mt-0.5">
                Self-hosted local disk
              </p>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-stone-200/80 shadow-xs flex items-center gap-4">
            <div className="p-3 bg-amber-50 text-amber-700 rounded-xl">
              <Files className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-stone-500 font-medium">Published Items</p>
              <h4 className="text-lg font-bold text-stone-900 mt-0.5">24 Files</h4>
              <p className="text-[11px] text-stone-500 mt-0.5">3 categories active</p>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-stone-200/80 shadow-xs flex items-center gap-4">
            <div className="p-3 bg-amber-50 text-amber-700 rounded-xl">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-stone-500 font-medium">Compliance Audits</p>
              <h4 className="text-lg font-bold text-stone-900 mt-0.5">100% Verified</h4>
              <p className="text-[11px] text-emerald-700 font-medium mt-0.5">
                Audited this quarter
              </p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Available Documents</CardTitle>
            <CardDescription>Standard organization publications</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={[
                {
                  key: 'title',
                  header: 'Document Name',
                  render: (row) => (
                    <div className="flex items-center gap-2.5">
                      <FileText className="h-4 w-4 text-amber-700 shrink-0" />
                      <span className="font-medium text-stone-900">{row.title}</span>
                    </div>
                  ),
                },
                {
                  key: 'category',
                  header: 'Category',
                  render: (row) => (
                    <Badge variant="primary" size="sm">
                      {row.category}
                    </Badge>
                  ),
                },
                { key: 'fileSize', header: 'Size' },
                { key: 'updatedAt', header: 'Last Modified' },
                {
                  key: 'action',
                  header: 'Action',
                  render: () => (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs flex items-center gap-1.5"
                    >
                      <Download className="h-3 w-3" />
                      Download
                    </Button>
                  ),
                },
              ]}
              data={documents}
            />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
