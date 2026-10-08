import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data?: TData[];
  total: number;
  isLoading: boolean;
  isError?: boolean;
  refetch?: () => void;
  pageState: { page: number; pageSize: number };
  onPageChange: (state: { page: number; pageSize: number }) => void;
}

export function DataTable<TData, TValue>({
  columns,
  data = [],
  total,
  isLoading,
  isError,
  refetch,
  pageState,
  onPageChange,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const startItem = total === 0 ? 0 : (pageState.page - 1) * pageState.pageSize + 1;
  const endItem = Math.min(pageState.page * pageState.pageSize, total);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="h-10 px-4 text-left align-middle font-medium text-slate-500 whitespace-nowrap">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isError ? (
                <tr>
                  <td colSpan={columns.length} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <p className="text-slate-500">Unable to load disputes<br/>Please try again.</p>
                      {refetch && (
                        <button 
                          onClick={() => refetch()}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-medium shadow-sm transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : isLoading && data.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="h-16">
                    {columns.map((_, j) => (
                      <td key={j} className="p-4 align-middle">
                        <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="transition-colors hover:bg-slate-50/50"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="p-4 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length} className="h-32 text-center text-slate-500">
                    <p className="text-base font-medium text-slate-900 mb-1">No disputes found</p>
                    <p className="text-sm">There are currently no disputes matching this filter.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="flex items-center justify-between px-1">
        <div className="text-sm text-slate-500">
          {total === 0 ? (
            'No disputes found'
          ) : total === 1 ? (
            'Showing 1 of 1 dispute'
          ) : (
            `Showing ${startItem}–${endItem} of ${total} disputes`
          )}
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onPageChange({ ...pageState, page: pageState.page - 1 })}
            disabled={pageState.page === 1 || isLoading}
            className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={() => onPageChange({ ...pageState, page: pageState.page + 1 })}
            disabled={pageState.page * pageState.pageSize >= total || isLoading}
            className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
