'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { http } from '@/services/http';
import { isApiError } from '@/services/api-error';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1';

export function DataPortability() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  async function onExport() {
    setExporting(true);
    try {
      // Raw fetch — the export is a file download, not the usual JSON envelope.
      const res = await fetch(`${API_URL}/users/me/export`, { credentials: 'include' });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pawfecthome-data-export.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Your data has been downloaded.');
    } catch {
      toast.error('Could not export your data. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  async function onImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      // The server accepts only the profile subset and ignores everything else.
      await http.post('/users/me/import', parsed);
      toast.success('Your settings were restored from the file.');
      router.refresh();
    } catch (error) {
      if (error instanceof SyntaxError) {
        toast.error('That file is not valid JSON.');
      } else {
        toast.error(isApiError(error) ? error.message : 'Could not import that file.');
      }
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex max-w-md flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        Download a copy of everything we hold about you, or restore your profile and preferences from
        a previous export.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onExport} disabled={exporting} className="gap-1.5">
          {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          Export my data
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="gap-1.5"
        >
          {importing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          Import settings
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={onImportFile}
          className="hidden"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
