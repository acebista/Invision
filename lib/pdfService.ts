// lib/pdfService.ts
// This service converts PDF files to individual JPEG images
// Uses dynamic import to avoid SSR issues with pdfjs-dist

export const convertPdfToImages = async (
    file: File,
    onProgress?: (current: number, total: number) => void
): Promise<File[]> => {
    // Dynamic import to ensure client-side only
    const pdfjsLib = await import('pdfjs-dist');

    // Configure worker for browser environment
    if (typeof window !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
    }

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;
    const images: File[] = [];

    for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 }); // 2x scale for quality

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        if (!context) throw new Error('Canvas context not available');

        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;

        const blob = await new Promise<Blob | null>(resolve =>
            canvas.toBlob(resolve, 'image/jpeg', 0.92)
        );

        if (blob) {
            const imageFile = new File([blob], `page_${i.toString().padStart(4, '0')}.jpg`, {
                type: 'image/jpeg',
                lastModified: Date.now()
            });
            images.push(imageFile);
        }

        if (onProgress) {
            onProgress(i, totalPages);
        }
    }

    return images;
};
