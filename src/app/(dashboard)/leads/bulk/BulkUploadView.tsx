"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";

const MAX_MB = 100;

type RowError = { row: number; company: string; reason: string };
type Result = { imported: number; failed: number; total: number; errors: RowError[]; truncated: boolean };

export default function BulkUploadView() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [dragging, setDragging] = useState(false);

  function choose(next: File | null) {
    setResult(null);
    setError(null);
    if (!next) return setFile(null);
    if (!/\.(csv|xlsx|xls)$/i.test(next.name)) {
      setError("Only .csv, .xlsx and .xls files are accepted.");
      return setFile(null);
    }
    if (next.size > MAX_MB * 1024 * 1024) {
      setError(`That file is ${(next.size / 1024 / 1024).toFixed(1)}MB — the limit is ${MAX_MB}MB.`);
      return setFile(null);
    }
    setFile(next);
  }

  async function upload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/leads/bulk", { method: "POST", body });
      if (!response.ok) {
        const message = (await response.json().catch(() => null))?.error ?? "Could not process that file.";
        setError(message);
        toast.error("Upload failed", message);
        return;
      }
      const data: Result = await response.json();
      setResult(data);
      if (data.imported > 0) {
        toast.success(`${data.imported} lead${data.imported === 1 ? "" : "s"} imported`);
        // The leads list is a server component behind a 4-minute router cache.
        router.refresh();
      }
      if (data.imported === 0) toast.error("Nothing imported", "Every row had a problem — see the list below.");
    } catch {
      setError("Could not process that file.");
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function downloadErrors() {
    if (!result) return;
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = ["Row,Company,Reason", ...result.errors.map((e) => [e.row, esc(e.company), esc(e.reason)].join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "lead-upload-errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="text-base font-semibold text-zinc-900">1. Start from the sample file</h2>
        <p className="mt-1 text-sm text-zinc-500">
          It has the expected column headers, two filled-in example rows, and (in the Excel version) a sheet listing
          every accepted lead source, priority, budget type and service name.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {/* Plain <a download>, not <Link>: these are file downloads, and
              client-side routing would never hand the browser the attachment. */}
          <a
            href="/api/leads/bulk/sample?format=xlsx"
            download
            className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <i className="ri-file-excel-2-line" aria-hidden="true" />
            Download sample (Excel)
          </a>
          <a
            href="/api/leads/bulk/sample?format=csv"
            download
            className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            <i className="ri-file-text-line" aria-hidden="true" />
            Download sample (CSV)
          </a>
        </div>
        <p className="mt-4 text-xs text-zinc-500">
          <strong className="font-medium text-zinc-700">Company name</strong>, <strong className="font-medium text-zinc-700">Phone</strong>,{" "}
          <strong className="font-medium text-zinc-700">Lead source</strong> and at least one{" "}
          <strong className="font-medium text-zinc-700">Service</strong> are required on every row. Everything else is optional.
          Separate multiple services with a semicolon.
        </p>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="text-base font-semibold text-zinc-900">2. Upload your file</h2>
        <p className="mt-1 text-sm text-zinc-500">CSV or Excel, up to {MAX_MB}MB.</p>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files?.[0] ?? null); }}
          className={`mt-4 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragging ? "border-brand-500 bg-brand-50" : "border-zinc-300 bg-zinc-50"
          }`}
        >
          <i className="ri-upload-cloud-2-line text-3xl text-zinc-400" aria-hidden="true" />
          {file ? (
            <>
              <p className="text-sm font-medium text-zinc-900">{file.name}</p>
              <p className="text-xs text-zinc-500">{(file.size / 1024).toFixed(0)} KB</p>
            </>
          ) : (
            <p className="text-sm text-zinc-600">Drag a file here, or</p>
          )}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            {file ? "Choose a different file" : "Browse files"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            aria-label="Lead file"
            className="hidden"
            onChange={(e) => choose(e.target.files?.[0] ?? null)}
          />
        </div>

        {error && (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm/5 text-red-700">
            <i className="ri-error-warning-line shrink-0 text-base leading-5" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push("/leads")}
            className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!file || uploading}
            onClick={upload}
            className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading && <i className="ri-loader-4-line animate-spin" aria-hidden="true" />}
            {uploading ? "Importing…" : "Import leads"}
          </button>
        </div>
      </section>

      {result && (
        <section className="rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="text-base font-semibold text-zinc-900">3. Result</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-2xl font-semibold text-emerald-700">{result.imported}</p>
              <p className="text-xs text-emerald-800">imported</p>
            </div>
            <div className={`rounded-lg border px-4 py-3 ${result.failed ? "border-red-200 bg-red-50" : "border-zinc-200 bg-zinc-50"}`}>
              <p className={`text-2xl font-semibold ${result.failed ? "text-red-700" : "text-zinc-500"}`}>{result.failed}</p>
              <p className={`text-xs ${result.failed ? "text-red-800" : "text-zinc-500"}`}>skipped</p>
            </div>
          </div>

          {result.failed > 0 && (
            <>
              <div className="mt-5 flex items-center justify-between gap-3">
                <p className="text-sm text-zinc-600">
                  These rows were skipped. Fix them in your file and upload just those again.
                  {result.truncated && " (showing the first 200)"}
                </p>
                <button
                  type="button"
                  onClick={downloadErrors}
                  className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                >
                  Download as CSV
                </button>
              </div>
              <div className="mt-3 max-h-80 overflow-auto rounded-md border border-zinc-200">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-zinc-50">
                    <tr className="border-b border-zinc-200 text-xs font-semibold text-zinc-500">
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Company</th>
                      <th className="px-3 py-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e, i) => (
                      <tr key={`${e.row}-${i}`} className="border-b border-zinc-100 last:border-0">
                        <td className="px-3 py-2 tabular-nums text-zinc-500">{e.row}</td>
                        <td className="px-3 py-2 text-zinc-900">{e.company}</td>
                        <td className="px-3 py-2 text-zinc-600">{e.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {result.imported > 0 && (
            <button
              type="button"
              onClick={() => router.push("/leads")}
              className="mt-5 inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              View imported leads
            </button>
          )}
        </section>
      )}
    </div>
  );
}
