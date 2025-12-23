'use client';

import { useState, useCallback } from 'react';
import { ProcessedPage } from '@/components/InvoiceUploader';

export type UploadStatus =
    | 'idle'
    | 'uploading'
    | 'processing'
    | 'extracting'
    | 'complete'
    | 'error';

export interface UseInvoiceUploadOptions {
    workspaceId: string;
    onSuccess?: (invoiceId: string) => void;
    onError?: (error: string) => void;
}

export interface UseInvoiceUploadReturn {
    status: UploadStatus;
    progress: number;
    invoiceId: string | null;
    jobId: string | null;
    error: string | null;
    uploadPages: (pages: ProcessedPage[]) => Promise<void>;
    reset: () => void;
}

/**
 * Hook for handling the complete invoice upload flow:
 * 1. Upload processed pages to server
 * 2. Create invoice record
 * 3. Trigger extraction job
 */
export function useInvoiceUpload({
    workspaceId,
    onSuccess,
    onError
}: UseInvoiceUploadOptions): UseInvoiceUploadReturn {
    const [status, setStatus] = useState<UploadStatus>('idle');
    const [progress, setProgress] = useState(0);
    const [invoiceId, setInvoiceId] = useState<string | null>(null);
    const [jobId, setJobId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const getAuthToken = useCallback(async (): Promise<string | null> => {
        // Get token from supabase client
        const { supabase } = await import('@/lib/supabaseClient');
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token || null;
    }, []);

    const uploadPages = useCallback(async (pages: ProcessedPage[]) => {
        setStatus('uploading');
        setProgress(0);
        setError(null);

        try {
            const token = await getAuthToken();
            if (!token) {
                throw new Error('Not authenticated');
            }

            // 1. Create invoice with pages
            setProgress(10);

            const pagesPayload = pages.map(p => ({
                base64: p.base64,
                mimeType: p.mimeType,
                pageNo: p.pageNo
            }));

            const createResponse = await fetch('/api/invoices/create', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    workspaceId,
                    pages: pagesPayload
                })
            });

            if (!createResponse.ok) {
                const errData = await createResponse.json();
                throw new Error(errData.error || 'Failed to create invoice');
            }

            const createData = await createResponse.json();
            setInvoiceId(createData.invoiceId);
            setProgress(50);

            // 2. Trigger extraction
            setStatus('extracting');

            const finalizeResponse = await fetch('/api/invoices/finalize', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    invoiceId: createData.invoiceId
                })
            });

            if (!finalizeResponse.ok) {
                const errData = await finalizeResponse.json();
                throw new Error(errData.error || 'Failed to trigger extraction');
            }

            const finalizeData = await finalizeResponse.json();
            setJobId(finalizeData.jobId);
            setProgress(100);
            setStatus('complete');

            onSuccess?.(createData.invoiceId);

        } catch (err: any) {
            setError(err.message);
            setStatus('error');
            onError?.(err.message);
        }
    }, [workspaceId, getAuthToken, onSuccess, onError]);

    const reset = useCallback(() => {
        setStatus('idle');
        setProgress(0);
        setInvoiceId(null);
        setJobId(null);
        setError(null);
    }, []);

    return {
        status,
        progress,
        invoiceId,
        jobId,
        error,
        uploadPages,
        reset
    };
}

/**
 * Hook for polling invoice status
 */
export function useInvoiceStatus(invoiceId: string | null) {
    const [status, setStatus] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchStatus = useCallback(async () => {
        if (!invoiceId) return;

        setLoading(true);
        setError(null);

        try {
            const { supabase } = await import('@/lib/supabaseClient');
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                throw new Error('Not authenticated');
            }

            const response = await fetch(`/api/invoices/status?invoiceId=${invoiceId}`, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Failed to fetch status');
            }

            const data = await response.json();
            setStatus(data);

        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [invoiceId]);

    return {
        status,
        loading,
        error,
        refetch: fetchStatus
    };
}
