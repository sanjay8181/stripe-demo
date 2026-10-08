'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import { disputesApi } from '../../../lib/api/disputes';

function formatUsdFromCents(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

export default function DisputeDetailPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ['dispute', id],
    queryFn: () => disputesApi.get(id as string),
    enabled: !!id,
    retry: (failureCount, err) => {
      if (err.message === 'NotFound') return false;
      return failureCount < 3;
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 md:p-10 max-w-[800px] mx-auto space-y-6">
        <div className="animate-pulse space-y-6">
          <div className="h-6 w-32 bg-slate-200 rounded"></div>
          <div className="space-y-4">
            <div className="h-10 w-3/4 bg-slate-200 rounded"></div>
            <div className="h-4 w-1/2 bg-slate-200 rounded"></div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 space-y-8">
            <div className="space-y-4">
              <div className="h-4 w-24 bg-slate-200 rounded"></div>
              <div className="h-16 w-full bg-slate-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && error.message === 'NotFound') {
    return (
      <div className="p-6 md:p-10 max-w-[800px] mx-auto space-y-6 text-center mt-20">
        <h1 className="text-2xl font-bold text-slate-900">Dispute not found</h1>
        <p className="text-slate-500">The dispute you are looking for does not exist or has been removed.</p>
        <Link
          href="/disputes"
          className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-6 font-medium text-white shadow-sm hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
        >
          Return to Queue
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 md:p-10 max-w-[800px] mx-auto space-y-6 text-center mt-20">
        <h1 className="text-2xl font-bold text-slate-900">Unable to load dispute</h1>
        <p className="text-slate-500">There was a problem loading this dispute. Please try again.</p>
        <Link
          href="/disputes"
          className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-6 font-medium text-slate-900 shadow-sm hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
        >
          Back to Queue
        </Link>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-6 md:p-10 max-w-[800px] mx-auto space-y-6">
      <Link
        href="/disputes"
        className="inline-flex items-center text-sm font-medium text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-sm"
      >
        &larr; Back to Disputes
      </Link>

      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{data.jobTitle}</h1>
        <p className="text-base text-slate-500">
          {data.homeownerName ?? 'Unknown Homeowner'} &middot; {data.contractorName ?? 'Unknown Contractor'}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-6 space-y-8">

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-slate-500">Contract Value</h3>
              <p className="text-lg font-semibold tabular-nums text-slate-900">
                {data.agreedPriceCents === null ? '—' : formatUsdFromCents(data.agreedPriceCents)}
              </p>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-slate-500">Status</h3>
              <div className="flex items-center mt-1">
                {data.resolvedAt ? (
                  <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700 ring-1 ring-inset ring-green-600/20">
                    Resolved
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                    Open
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1 border-t border-slate-100 pt-6">
            <h3 className="text-sm font-medium text-slate-500">Dispute Reason</h3>
            <div className="prose prose-slate max-w-none text-slate-700 text-sm whitespace-pre-wrap break-words">
              {data.disputeReason ? data.disputeReason : <span className="italic text-slate-400">No reason provided.</span>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-t border-slate-100 pt-6">
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-slate-500">Disputed At</h3>
              <p className="text-sm text-slate-900">
                {data.disputedAt ? format(new Date(data.disputedAt), 'PPpp') : '—'}
              </p>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-slate-500">Open For</h3>
              <p className="text-sm text-slate-900">
                {data.disputedAt ? formatDistanceToNow(new Date(data.disputedAt)) : '—'}
              </p>
            </div>
            {data.resolvedAt && (
              <div className="space-y-1">
                <h3 className="text-sm font-medium text-slate-500">Resolved At</h3>
                <p className="text-sm text-slate-900">
                  {format(new Date(data.resolvedAt), 'PPpp')}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-slate-50 border-t border-slate-200 p-4 text-center">
          <p className="text-xs text-slate-500">
            Note: Dispute resolution is handled via the existing client workflow and is read-only in this queue view.
          </p>
        </div>
      </div>
    </div>
  );
}
