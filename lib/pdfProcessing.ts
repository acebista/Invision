/**
 * PDF Processing Utilities
 * 
 * Handles:
 * - PDF to image conversion
 * - Multi-page PDF splitting
 * - Page count detection
 * 
 * Uses pdf.js for client-side PDF rendering
 */

// PDF.js types
declare global {
    interface Window {
        pdfjsLib: any;
    }
}

// CDN URL for pdf.js (loaded dynamically)
const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let pdfjsLoaded = false;

/**
 * Load pdf.js library dynamically
 */
async function loadPdfJs(): Promise<void> {
    if (pdfjsLoaded && window.pdfjsLib) return;

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = PDFJS_CDN;
        script.onload = () => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
            pdfjsLoaded = true;
            resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

export interface PdfPageInfo {
    pageNumber: number;
    width: number;
    height: number;
}

export interface PdfInfo {
    pageCount: number;
    pages: PdfPageInfo[];
}

/**
 * Get PDF information (page count, dimensions)
 */
export async function getPdfInfo(file: File): Promise<PdfInfo> {
    await loadPdfJs();

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const pages: PdfPageInfo[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        pages.push({
            pageNumber: i,
            width: viewport.width,
            height: viewport.height
        });
    }

    return {
        pageCount: pdf.numPages,
        pages
    };
}

export interface PdfRenderOptions {
    scale?: number;          // Render scale (default: 2.0 for good quality)
    maxWidth?: number;       // Max width in pixels
    format?: 'jpeg' | 'png'; // Output format
    quality?: number;        // JPEG quality (0-1)
}

const DEFAULT_RENDER_OPTIONS: PdfRenderOptions = {
    scale: 2.0,
    maxWidth: 2000,
    format: 'jpeg',
    quality: 0.85
};

export interface RenderedPage {
    pageNumber: number;
    blob: Blob;
    base64: string;
    width: number;
    height: number;
    sizeKB: number;
}

/**
 * Render a single PDF page to image
 */
export async function renderPdfPage(
    file: File,
    pageNumber: number,
    options: Partial<PdfRenderOptions> = {}
): Promise<RenderedPage> {
    await loadPdfJs();
    const opts = { ...DEFAULT_RENDER_OPTIONS, ...options };

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    if (pageNumber < 1 || pageNumber > pdf.numPages) {
        throw new Error(`Invalid page number: ${pageNumber}. PDF has ${pdf.numPages} pages.`);
    }

    const page = await pdf.getPage(pageNumber);

    // Calculate scale based on maxWidth
    let scale = opts.scale!;
    const viewport = page.getViewport({ scale: 1 });
    if (viewport.width * scale > opts.maxWidth!) {
        scale = opts.maxWidth! / viewport.width;
    }

    const scaledViewport = page.getViewport({ scale });

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;
    const ctx = canvas.getContext('2d')!;

    // Render page
    await page.render({
        canvasContext: ctx,
        viewport: scaledViewport
    }).promise;

    // Convert to blob
    const mimeType = opts.format === 'png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob(
            (b) => resolve(b!),
            mimeType,
            opts.quality
        );
    });

    // Convert to base64
    const base64 = await blobToBase64(blob);

    return {
        pageNumber,
        blob,
        base64,
        width: canvas.width,
        height: canvas.height,
        sizeKB: Math.round(blob.size / 1024)
    };
}

/**
 * Render all pages of a PDF to images
 */
export async function renderAllPdfPages(
    file: File,
    options: Partial<PdfRenderOptions> = {},
    onProgress?: (current: number, total: number) => void
): Promise<RenderedPage[]> {
    const info = await getPdfInfo(file);
    const pages: RenderedPage[] = [];

    for (let i = 1; i <= info.pageCount; i++) {
        const page = await renderPdfPage(file, i, options);
        pages.push(page);
        onProgress?.(i, info.pageCount);
    }

    return pages;
}

/**
 * Check if file is a PDF
 */
export function isPdf(file: File): boolean {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

/**
 * Validate PDF for invoice processing
 * Returns error message if invalid, null if valid
 */
export async function validatePdfForInvoice(file: File): Promise<string | null> {
    try {
        const info = await getPdfInfo(file);

        if (info.pageCount > 2) {
            return `PDF has ${info.pageCount} pages. Maximum allowed is 2 pages per invoice. Please split the PDF.`;
        }

        return null;
    } catch (err) {
        return 'Failed to read PDF file. It may be corrupted or password-protected.';
    }
}

// Helper
async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
        };
        reader.readAsDataURL(blob);
    });
}
