'use client';

import * as React from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { disputesApi, DisputeRow } from '../../lib/api/disputes';
import { DataTable } from '../../components/data-table';
import { PageHeader } from '../../components/page-header';
import { formatDistanceToNow } from 'date-fns';

const STATUSES = ['open', 'resolved', 'all'] as const;

function formatUsdFromCents(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function relativeAge(dateString: string) {
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true });
  } catch (e) {
    return dateString;
  }
}

export default function DisputeQueuePage() {
  const [status, setStatus] = React.useState<(typeof STATUSES)[number]>('open');
  const [pageState, setPageState] = React.useState({ page: 1, pageSize: 25 });

  const query = useQuery({
    queryKey: ['disputes', status, pageState.page, pageState.pageSize],
    queryFn: () => disputesApi.list({ status, ...pageState }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const columns: ColumnDef<DisputeRow, unknown>[] = [
    {
      header: 'Job',
      accessorKey: 'jobTitle',
      cell: ({ row }) => (
        <div className="min-w-[200px]">
          <Link
            href={`/disputes/${row.original.id}`}
            className="inline-block truncate font-medium text-slate-900 hover:underline focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 rounded-sm transition-colors"
            aria-label={`View dispute details for ${row.original.jobTitle}`}
          >
            {row.original.jobTitle}
          </Link>
          <div className="truncate text-xs text-slate-500 mt-1">
            {row.original.homeownerName ?? '—'} · {row.original.contractorName ?? '—'}
          </div>
        </div>
      ),
    },
    {
      header: 'Reason',
      accessorKey: 'disputeReason',
      cell: ({ row }) => (
        <div className="line-clamp-2 min-w-[250px] max-w-md text-sm text-slate-600" title={row.original.disputeReason || ''}>
          {row.original.disputeReason ?? '—'}
        </div>
      ),
    },
    {
      header: 'Value',
      accessorKey: 'agreedPriceCents',
      cell: ({ row }) => (
        <span className="tabular-nums text-slate-900 font-medium">
          {row.original.agreedPriceCents === null
            ? '—'
            : formatUsdFromCents(row.original.agreedPriceCents)}
        </span>
      ),
    },
    {
      header: 'Open for',
      accessorKey: 'disputedAt',
      cell: ({ row }) => (
        <span className="text-slate-600 whitespace-nowrap">
          {relativeAge(row.original.disputedAt)}
        </span>
      ),
    },
  ];

  return (
    <div className="p-6 md:p-10 max-w-[1200px] mx-auto space-y-6">
      <PageHeader
        title="Disputes"
        description="Jobs where the homeowner disputed the contractor's completion."
        action={
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as (typeof STATUSES)[number]);
              setPageState({ page: 1, pageSize: 25 });
            }}
            className="h-9 w-[160px] rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-slate-950"
            aria-label="Filter disputes by status"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        }
      />

      <DataTable
        columns={columns}
        data={query.data?.items}
        total={query.data?.total ?? 0}
        isLoading={query.isLoading}
        isError={query.isError}
        refetch={query.refetch}
        pageState={pageState}
        onPageChange={setPageState}
      />
    </div>
  );
}
