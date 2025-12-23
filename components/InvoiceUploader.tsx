'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    processInvoiceImage,
    createPreviewUrl,
    revokePreviewUrl,
    ProcessingResult,
    ProcessingOptions,
    BoundingBox
} from '@/lib/imageProcessing';
import {
    isPdf,
    getPdfInfo,
    renderPdfPage,
    validatePdfForInvoice,
    RenderedPage
} from '@/lib/pdfProcessing';

// -------------------------------------------------------------------
// TYPES
// -------------------------------------------------------------------

export interface ProcessedPage {
    id: string;
    pageNo: number;
    blob: Blob;
    base64: string;
    previewUrl: string;
    mimeType: string;
    width: number;
    height: number;
    sizeKB: number;
    processingInfo: {
        originalWidth: number;
        originalHeight: number;
        skewAngle: number;
        cropBounds: BoundingBox;
    };
}

export interface InvoiceUploaderProps {
    workspaceId: string;
    onUploadComplete: (pages: ProcessedPage[]) => void;
    onError: (error: string) => void;
    maxPages?: number;
}

type UploadState = 'idle' | 'loading' | 'preview' | 'processing' | 'done';

// -------------------------------------------------------------------
// COMPONENT
// -------------------------------------------------------------------

export default function InvoiceUploader({
    workspaceId,
    onUploadComplete,
    onError,
    maxPages = 2
}: InvoiceUploaderProps) {
    const [state, setState] = useState<UploadState>('idle');
    const [pages, setPages] = useState<ProcessedPage[]>([]);
    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const [processingOptions, setProcessingOptions] = useState<ProcessingOptions>({
        autoCrop: true,
        autoDeskew: true,
        grayscale: true,
        enhanceContrast: true,
        manualRotation: 0
    });
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Cleanup preview URLs on unmount
    useEffect(() => {
        return () => {
            pages.forEach((p: ProcessedPage) => revokePreviewUrl(p.previewUrl));
        };
    }, []);

    // -------------------------------------------------------------------
    // FILE HANDLING
    // -------------------------------------------------------------------

    const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setError(null);
        setState('loading');
        setProgress(0);

        try {
            const newPages: ProcessedPage[] = [];

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                setProgress((i / files.length) * 50);

                if (isPdf(file)) {
                    // Validate PDF
                    const validationError = await validatePdfForInvoice(file);
                    if (validationError) {
                        throw new Error(validationError);
                    }

                    // Get PDF info
                    const info = await getPdfInfo(file);

                    // Render each page
                    for (let p = 1; p <= info.pageCount; p++) {
                        if (newPages.length >= maxPages) break;

                        const rendered = await renderPdfPage(file, p);

                        // Create a File from the blob for processing
                        const pageFile = new File([rendered.blob], `page-${p}.jpg`, { type: 'image/jpeg' });
                        const result = await processInvoiceImage(pageFile, processingOptions);

                        const previewUrl = createPreviewUrl(result.blob);
                        newPages.push({
                            id: `${Date.now()}-${p}`,
                            pageNo: newPages.length + 1,
                            blob: result.blob,
                            base64: result.base64,
                            previewUrl,
                            mimeType: 'image/jpeg',
                            width: result.width,
                            height: result.height,
                            sizeKB: result.sizeKB,
                            processingInfo: {
                                originalWidth: result.originalWidth,
                                originalHeight: result.originalHeight,
                                skewAngle: result.skewAngle,
                                cropBounds: result.cropBounds
                            }
                        });
                    }
                } else {
                    // Process image file
                    if (newPages.length >= maxPages) break;

                    const result = await processInvoiceImage(file, processingOptions);
                    const previewUrl = createPreviewUrl(result.blob);

                    newPages.push({
                        id: `${Date.now()}-${i}`,
                        pageNo: newPages.length + 1,
                        blob: result.blob,
                        base64: result.base64,
                        previewUrl,
                        mimeType: 'image/jpeg',
                        width: result.width,
                        height: result.height,
                        sizeKB: result.sizeKB,
                        processingInfo: {
                            originalWidth: result.originalWidth,
                            originalHeight: result.originalHeight,
                            skewAngle: result.skewAngle,
                            cropBounds: result.cropBounds
                        }
                    });
                }

                setProgress(50 + ((i + 1) / files.length) * 50);
            }

            if (newPages.length === 0) {
                throw new Error('No valid pages could be processed');
            }

            setPages(newPages);
            setCurrentPageIndex(0);
            setState('preview');
            setProgress(100);

        } catch (err: any) {
            setError(err.message);
            onError(err.message);
            setState('idle');
        }

        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, [processingOptions, maxPages, onError]);

    // -------------------------------------------------------------------
    // MANUAL ADJUSTMENTS
    // -------------------------------------------------------------------

    const handleRotateLeft = useCallback(async () => {
        if (pages.length === 0) return;

        setState('processing');
        const page = pages[currentPageIndex];

        try {
            // Reprocess with 90-degree rotation
            const newRotation = ((processingOptions.manualRotation || 0) - 90 + 360) % 360;

            // Get original file from blob
            const file = new File([page.blob], 'temp.jpg', { type: 'image/jpeg' });
            const result = await processInvoiceImage(file, {
                ...processingOptions,
                manualRotation: -90, // Rotate left
                autoDeskew: false // Don't auto-deskew after manual rotation
            });

            revokePreviewUrl(page.previewUrl);
            const newPreviewUrl = createPreviewUrl(result.blob);

            const updatedPages = [...pages];
            updatedPages[currentPageIndex] = {
                ...page,
                blob: result.blob,
                base64: result.base64,
                previewUrl: newPreviewUrl,
                width: result.width,
                height: result.height,
                sizeKB: result.sizeKB,
                processingInfo: {
                    originalWidth: result.originalWidth,
                    originalHeight: result.originalHeight,
                    skewAngle: result.skewAngle,
                    cropBounds: result.cropBounds
                }
            };

            setPages(updatedPages);
            setState('preview');
        } catch (err: any) {
            setError(err.message);
            setState('preview');
        }
    }, [pages, currentPageIndex, processingOptions]);

    const handleRotateRight = useCallback(async () => {
        if (pages.length === 0) return;

        setState('processing');
        const page = pages[currentPageIndex];

        try {
            const file = new File([page.blob], 'temp.jpg', { type: 'image/jpeg' });
            const result = await processInvoiceImage(file, {
                ...processingOptions,
                manualRotation: 90,
                autoDeskew: false
            });

            revokePreviewUrl(page.previewUrl);
            const newPreviewUrl = createPreviewUrl(result.blob);

            const updatedPages = [...pages];
            updatedPages[currentPageIndex] = {
                ...page,
                blob: result.blob,
                base64: result.base64,
                previewUrl: newPreviewUrl,
                width: result.width,
                height: result.height,
                sizeKB: result.sizeKB,
                processingInfo: {
                    originalWidth: result.originalWidth,
                    originalHeight: result.originalHeight,
                    skewAngle: result.skewAngle,
                    cropBounds: result.cropBounds
                }
            };

            setPages(updatedPages);
            setState('preview');
        } catch (err: any) {
            setError(err.message);
            setState('preview');
        }
    }, [pages, currentPageIndex, processingOptions]);

    const handleRemovePage = useCallback((index: number) => {
        const page = pages[index];
        revokePreviewUrl(page.previewUrl);

        const updatedPages = pages.filter((_: ProcessedPage, i: number) => i !== index).map((p: ProcessedPage, i: number) => ({
            ...p,
            pageNo: i + 1
        }));

        setPages(updatedPages);
        if (currentPageIndex >= updatedPages.length) {
            setCurrentPageIndex(Math.max(0, updatedPages.length - 1));
        }

        if (updatedPages.length === 0) {
            setState('idle');
        }
    }, [pages, currentPageIndex]);

    // -------------------------------------------------------------------
    // CONFIRM & UPLOAD
    // -------------------------------------------------------------------

    const handleConfirm = useCallback(() => {
        onUploadComplete(pages);
        setState('done');
    }, [pages, onUploadComplete]);

    const handleReset = useCallback(() => {
        pages.forEach((p: ProcessedPage) => revokePreviewUrl(p.previewUrl));
        setPages([]);
        setCurrentPageIndex(0);
        setState('idle');
        setError(null);
        setProgress(0);
    }, [pages]);

    // -------------------------------------------------------------------
    // RENDER
    // -------------------------------------------------------------------

    return (
        <div className="invoice-uploader">
            {/* Error Display */}
            {error && (
                <div className="upload-error">
                    <span>⚠️ {error}</span>
                    <button onClick={() => setError(null)}>×</button>
                </div>
            )}

            {/* Idle State - File Picker */}
            {state === 'idle' && (
                <div className="upload-zone" onClick={() => fileInputRef.current?.click()}>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,application/pdf"
                        multiple
                        onChange={handleFileSelect}
                        style={{ display: 'none' }}
                    />
                    <div className="upload-icon">📄</div>
                    <h3>Upload Invoice</h3>
                    <p>Click or drag files here</p>
                    <p className="upload-hint">
                        Supported: JPG, PNG, PDF (max {maxPages} pages)
                    </p>
                </div>
            )}

            {/* Loading State */}
            {state === 'loading' && (
                <div className="upload-loading">
                    <div className="spinner"></div>
                    <p>Processing images...</p>
                    <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                    </div>
                </div>
            )}

            {/* Preview State */}
            {(state === 'preview' || state === 'processing') && pages.length > 0 && (
                <div className="upload-preview">
                    {/* Page Navigation */}
                    {pages.length > 1 && (
                        <div className="page-tabs">
                            {pages.map((page, index) => (
                                <button
                                    key={page.id}
                                    className={`page-tab ${index === currentPageIndex ? 'active' : ''}`}
                                    onClick={() => setCurrentPageIndex(index)}
                                >
                                    Page {page.pageNo}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Image Preview */}
                    <div className="preview-container">
                        {state === 'processing' && (
                            <div className="preview-overlay">
                                <div className="spinner"></div>
                            </div>
                        )}
                        <img
                            src={pages[currentPageIndex].previewUrl}
                            alt={`Page ${pages[currentPageIndex].pageNo}`}
                            className="preview-image"
                        />
                    </div>

                    {/* Page Info */}
                    <div className="page-info">
                        <span>{pages[currentPageIndex].width} × {pages[currentPageIndex].height}px</span>
                        <span>{pages[currentPageIndex].sizeKB} KB</span>
                        {pages[currentPageIndex].processingInfo.skewAngle !== 0 && (
                            <span>Deskewed: {pages[currentPageIndex].processingInfo.skewAngle.toFixed(1)}°</span>
                        )}
                    </div>

                    {/* Controls */}
                    <div className="preview-controls">
                        <button
                            onClick={handleRotateLeft}
                            disabled={state === 'processing'}
                            title="Rotate Left"
                        >
                            ↺ Rotate Left
                        </button>
                        <button
                            onClick={handleRotateRight}
                            disabled={state === 'processing'}
                            title="Rotate Right"
                        >
                            ↻ Rotate Right
                        </button>
                        <button
                            onClick={() => handleRemovePage(currentPageIndex)}
                            disabled={state === 'processing'}
                            className="btn-danger"
                            title="Remove Page"
                        >
                            🗑 Remove
                        </button>
                    </div>

                    {/* Action Buttons */}
                    <div className="preview-actions">
                        <button
                            onClick={handleReset}
                            disabled={state === 'processing'}
                            className="btn-secondary"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={state === 'processing' || pages.length >= maxPages}
                            className="btn-secondary"
                        >
                            + Add Page
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={state === 'processing'}
                            className="btn-primary"
                        >
                            ✓ Confirm & Upload
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,application/pdf"
                            onChange={handleFileSelect}
                            style={{ display: 'none' }}
                        />
                    </div>
                </div>
            )}

            {/* Done State */}
            {state === 'done' && (
                <div className="upload-done">
                    <div className="done-icon">✓</div>
                    <h3>Upload Complete</h3>
                    <p>{pages.length} page(s) uploaded successfully</p>
                    <button onClick={handleReset} className="btn-primary">
                        Upload Another Invoice
                    </button>
                </div>
            )}

            <style jsx>{`
        .invoice-uploader {
          max-width: 600px;
          margin: 0 auto;
        }

        .upload-error {
          background: #ff4444;
          color: white;
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .upload-error button {
          background: none;
          border: none;
          color: white;
          font-size: 20px;
          cursor: pointer;
        }

        .upload-zone {
          border: 2px dashed #444;
          border-radius: 12px;
          padding: 48px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
        }

        .upload-zone:hover {
          border-color: #666;
          background: rgba(255,255,255,0.02);
        }

        .upload-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .upload-zone h3 {
          margin: 0 0 8px;
          color: #fff;
        }

        .upload-zone p {
          margin: 0;
          color: #888;
        }

        .upload-hint {
          font-size: 12px;
          margin-top: 8px !important;
        }

        .upload-loading {
          text-align: center;
          padding: 48px;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #333;
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 16px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .progress-bar {
          width: 100%;
          height: 4px;
          background: #333;
          border-radius: 2px;
          margin-top: 16px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: #4CAF50;
          transition: width 0.3s;
        }

        .upload-preview {
          background: #1a1a1a;
          border-radius: 12px;
          padding: 16px;
        }

        .page-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
        }

        .page-tab {
          padding: 8px 16px;
          border: none;
          background: #333;
          color: #888;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .page-tab.active {
          background: #4CAF50;
          color: white;
        }

        .preview-container {
          position: relative;
          background: #000;
          border-radius: 8px;
          overflow: hidden;
          min-height: 300px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .preview-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10;
        }

        .preview-image {
          max-width: 100%;
          max-height: 400px;
          object-fit: contain;
        }

        .page-info {
          display: flex;
          justify-content: center;
          gap: 16px;
          padding: 12px;
          color: #888;
          font-size: 12px;
        }

        .preview-controls {
          display: flex;
          justify-content: center;
          gap: 8px;
          margin-bottom: 16px;
        }

        .preview-controls button {
          padding: 8px 16px;
          border: none;
          background: #333;
          color: #fff;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .preview-controls button:hover:not(:disabled) {
          background: #444;
        }

        .preview-controls button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-danger {
          background: #ff4444 !important;
        }

        .btn-danger:hover:not(:disabled) {
          background: #cc3333 !important;
        }

        .preview-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }

        .preview-actions button {
          padding: 12px 24px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s;
        }

        .btn-secondary {
          background: #333;
          color: #fff;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #444;
        }

        .btn-primary {
          background: #4CAF50;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: #45a049;
        }

        .preview-actions button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .upload-done {
          text-align: center;
          padding: 48px;
        }

        .done-icon {
          width: 64px;
          height: 64px;
          background: #4CAF50;
          color: white;
          font-size: 32px;
          line-height: 64px;
          border-radius: 50%;
          margin: 0 auto 16px;
        }

        .upload-done h3 {
          margin: 0 0 8px;
          color: #fff;
        }

        .upload-done p {
          color: #888;
          margin: 0 0 24px;
        }
      `}</style>
        </div>
    );
}
