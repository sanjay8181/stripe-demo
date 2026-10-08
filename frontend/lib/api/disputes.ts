export interface DisputeRow {
  id: string;
  jobTitle: string;
  homeownerName: string | null;
  contractorName: string | null;
  disputeReason: string | null;
  agreedPriceCents: number | null;
  disputedAt: string;
  resolvedAt: string | null;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListDisputesOptions {
  status: 'open' | 'resolved' | 'all';
  page: number;
  pageSize: number;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

export const disputesApi = {
  list: async (
    options: ListDisputesOptions,
  ): Promise<PageResult<DisputeRow>> => {
    const params = new URLSearchParams({
      status: options.status,
      page: String(options.page),
      pageSize: String(options.pageSize),
    });

    const response = await fetch(
      `${API_BASE_URL}/admin/disputes/queue?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch disputes: ${response.status}`);
    }

    return response.json() as Promise<PageResult<DisputeRow>>;
  },

  get: async (id: string): Promise<DisputeRow> => {
    const response = await fetch(`${API_BASE_URL}/admin/disputes/${id}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('NotFound');
      }
      throw new Error(`Failed to fetch dispute: ${response.status}`);
    }

    return response.json() as Promise<DisputeRow>;
  },
};