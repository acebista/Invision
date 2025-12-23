/**
 * Image Preprocessing Pipeline for Invoice Ingestion
 * 
 * This module handles:
 * 1. EXIF rotation correction
 * 2. Document boundary detection & auto-crop
 * 3. Auto-deskew
 * 4. Grayscale conversion & contrast enhancement
 * 5. Compression to target size
 */

// -------------------------------------------------------------------
// EXIF ORIENTATION HANDLING
// -------------------------------------------------------------------

/**
 * Read EXIF orientation from image file
 */
export async function getExifOrientation(file: File): Promise<number> {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const view = new DataView(e.target?.result as ArrayBuffer);

            // Check for JPEG marker
            if (view.getUint16(0, false) !== 0xFFD8) {
                resolve(1);
                return;
            }

            const length = view.byteLength;
            let offset = 2;

            while (offset < length) {
                if (view.getUint16(offset + 2, false) <= 8) {
                    resolve(1);
                    return;
                }

                const marker = view.getUint16(offset, false);
                offset += 2;

                if (marker === 0xFFE1) {
                    // EXIF marker
                    if (view.getUint32(offset += 2, false) !== 0x45786966) {
                        resolve(1);
                        return;
                    }

                    const little = view.getUint16(offset += 6, false) === 0x4949;
                    offset += view.getUint32(offset + 4, little);

                    const tags = view.getUint16(offset, little);
                    offset += 2;

                    for (let i = 0; i < tags; i++) {
                        if (view.getUint16(offset + (i * 12), little) === 0x0112) {
                            resolve(view.getUint16(offset + (i * 12) + 8, little));
                            return;
                        }
                    }
                } else if ((marker & 0xFF00) !== 0xFF00) {
                    break;
                } else {
                    offset += view.getUint16(offset, false);
                }
            }
            resolve(1);
        };
        reader.readAsArrayBuffer(file.slice(0, 65536));
    });
}

/**
 * Apply EXIF orientation correction to canvas
 */
export function applyExifOrientation(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    orientation: number
): void {
    const width = img.width;
    const height = img.height;

    // Set canvas dimensions based on orientation
    if (orientation > 4 && orientation < 9) {
        canvas.width = height;
        canvas.height = width;
    } else {
        canvas.width = width;
        canvas.height = height;
    }

    // Transform based on orientation
    switch (orientation) {
        case 2: ctx.transform(-1, 0, 0, 1, width, 0); break;
        case 3: ctx.transform(-1, 0, 0, -1, width, height); break;
        case 4: ctx.transform(1, 0, 0, -1, 0, height); break;
        case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
        case 6: ctx.transform(0, 1, -1, 0, height, 0); break;
        case 7: ctx.transform(0, -1, -1, 0, height, width); break;
        case 8: ctx.transform(0, -1, 1, 0, 0, width); break;
        default: break;
    }

    ctx.drawImage(img, 0, 0);
}

// -------------------------------------------------------------------
// DOCUMENT BOUNDARY DETECTION
// -------------------------------------------------------------------

export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Detect document boundaries using edge detection
 * Returns bounding box of detected document area
 */
export function detectDocumentBounds(
    imageData: ImageData,
    threshold: number = 30
): BoundingBox {
    const { data, width, height } = imageData;

    // Convert to grayscale and find edges
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
        gray[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }

    // Simple edge detection using Sobel-like kernel
    const edges = new Uint8Array(width * height);
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            const gx =
                -gray[idx - width - 1] + gray[idx - width + 1] +
                -2 * gray[idx - 1] + 2 * gray[idx + 1] +
                -gray[idx + width - 1] + gray[idx + width + 1];
            const gy =
                -gray[idx - width - 1] - 2 * gray[idx - width] - gray[idx - width + 1] +
                gray[idx + width - 1] + 2 * gray[idx + width] + gray[idx + width + 1];
            edges[idx] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
        }
    }

    // Find bounding box of high-edge regions
    let minX = width, minY = height, maxX = 0, maxY = 0;
    const margin = Math.round(Math.min(width, height) * 0.02); // 2% margin

    for (let y = margin; y < height - margin; y++) {
        for (let x = margin; x < width - margin; x++) {
            if (edges[y * width + x] > threshold) {
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }
    }

    // Add small padding
    const padding = Math.round(Math.min(width, height) * 0.01);
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(width, maxX + padding);
    maxY = Math.min(height, maxY + padding);

    // Validate bounds - if detection failed, return full image
    if (maxX <= minX || maxY <= minY ||
        (maxX - minX) < width * 0.3 || (maxY - minY) < height * 0.3) {
        return { x: 0, y: 0, width, height };
    }

    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
    };
}

// -------------------------------------------------------------------
// DESKEW DETECTION
// -------------------------------------------------------------------

/**
 * Detect skew angle using Hough transform approximation
 * Returns angle in degrees (-45 to 45)
 */
export function detectSkewAngle(imageData: ImageData): number {
    const { data, width, height } = imageData;

    // Convert to grayscale
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
        gray[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }

    // Edge detection (horizontal edges only for text lines)
    const edges: Array<{ x: number; y: number }> = [];
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            const gy = Math.abs(gray[idx - width] - gray[idx + width]);
            if (gy > 50) {
                edges.push({ x, y });
            }
        }
    }

    if (edges.length < 100) return 0;

    // Sample edges for faster processing
    const sampleSize = Math.min(edges.length, 1000);
    const samples = edges.sort(() => Math.random() - 0.5).slice(0, sampleSize);

    // Accumulator for angles (-10 to 10 degrees, 0.5 degree resolution)
    const angles: { [key: number]: number } = {};

    for (let i = 0; i < samples.length - 1; i++) {
        for (let j = i + 1; j < Math.min(i + 20, samples.length); j++) {
            const dx = samples[j].x - samples[i].x;
            const dy = samples[j].y - samples[i].y;
            if (Math.abs(dx) < 10) continue;

            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            if (Math.abs(angle) <= 10) {
                const quantized = Math.round(angle * 2) / 2;
                angles[quantized] = (angles[quantized] || 0) + 1;
            }
        }
    }

    // Find most common angle
    let bestAngle = 0;
    let bestCount = 0;
    for (const [angle, count] of Object.entries(angles)) {
        if (count > bestCount) {
            bestCount = count;
            bestAngle = parseFloat(angle);
        }
    }

    return -bestAngle; // Negative to correct the skew
}

// -------------------------------------------------------------------
// GRAYSCALE & CONTRAST ENHANCEMENT
// -------------------------------------------------------------------

/**
 * Convert to grayscale and enhance contrast
 */
export function enhanceImage(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    contrastFactor: number = 1.3
): void {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Find min/max for histogram stretching
    let min = 255, max = 0;
    for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        min = Math.min(min, gray);
        max = Math.max(max, gray);
    }

    const range = max - min || 1;

    for (let i = 0; i < data.length; i += 4) {
        // Convert to grayscale
        let gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

        // Histogram stretch
        gray = ((gray - min) / range) * 255;

        // Apply contrast
        gray = ((gray / 255 - 0.5) * contrastFactor + 0.5) * 255;
        gray = Math.max(0, Math.min(255, gray));

        data[i] = data[i + 1] = data[i + 2] = gray;
    }

    ctx.putImageData(imageData, 0, 0);
}

// -------------------------------------------------------------------
// COMPRESSION & RESIZING
// -------------------------------------------------------------------

export interface CompressionOptions {
    maxWidth: number;
    targetQuality: number;
    targetSizeKB: number;
    maxSizeKB: number;
}

const DEFAULT_OPTIONS: CompressionOptions = {
    maxWidth: 2000,
    targetQuality: 0.75,
    targetSizeKB: 500,
    maxSizeKB: 700
};

/**
 * Compress image to target size
 */
export async function compressImage(
    canvas: HTMLCanvasElement,
    options: Partial<CompressionOptions> = {}
): Promise<Blob> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Resize if needed
    let targetCanvas = canvas;
    if (canvas.width > opts.maxWidth) {
        const scale = opts.maxWidth / canvas.width;
        targetCanvas = document.createElement('canvas');
        targetCanvas.width = opts.maxWidth;
        targetCanvas.height = Math.round(canvas.height * scale);
        const ctx = targetCanvas.getContext('2d')!;
        ctx.drawImage(canvas, 0, 0, targetCanvas.width, targetCanvas.height);
    }

    // Binary search for optimal quality
    let quality = opts.targetQuality;
    let blob = await canvasToBlob(targetCanvas, quality);

    // If too large, reduce quality
    let attempts = 0;
    while (blob.size > opts.maxSizeKB * 1024 && quality > 0.3 && attempts < 5) {
        quality -= 0.1;
        blob = await canvasToBlob(targetCanvas, quality);
        attempts++;
    }

    // If still too large, reduce dimensions
    if (blob.size > opts.maxSizeKB * 1024) {
        const scale = Math.sqrt((opts.targetSizeKB * 1024) / blob.size);
        const smallerCanvas = document.createElement('canvas');
        smallerCanvas.width = Math.round(targetCanvas.width * scale);
        smallerCanvas.height = Math.round(targetCanvas.height * scale);
        const ctx = smallerCanvas.getContext('2d')!;
        ctx.drawImage(targetCanvas, 0, 0, smallerCanvas.width, smallerCanvas.height);
        blob = await canvasToBlob(smallerCanvas, opts.targetQuality);
    }

    return blob;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
    return new Promise((resolve) => {
        canvas.toBlob(
            (blob) => resolve(blob!),
            'image/jpeg',
            quality
        );
    });
}

// -------------------------------------------------------------------
// MAIN PROCESSING PIPELINE
// -------------------------------------------------------------------

export interface ProcessingResult {
    blob: Blob;
    base64: string;
    width: number;
    height: number;
    originalWidth: number;
    originalHeight: number;
    skewAngle: number;
    cropBounds: BoundingBox;
    sizeKB: number;
}

export interface ProcessingOptions {
    autoCrop: boolean;
    autoDeskew: boolean;
    grayscale: boolean;
    enhanceContrast: boolean;
    manualRotation: number; // degrees: 0, 90, 180, 270
    manualCrop?: BoundingBox;
}

const DEFAULT_PROCESSING: ProcessingOptions = {
    autoCrop: true,
    autoDeskew: true,
    grayscale: true,
    enhanceContrast: true,
    manualRotation: 0
};

/**
 * Full image preprocessing pipeline
 */
export async function processInvoiceImage(
    file: File,
    options: Partial<ProcessingOptions> = {}
): Promise<ProcessingResult> {
    const opts = { ...DEFAULT_PROCESSING, ...options };

    // 1. Load image
    const img = await loadImage(file);
    const orientation = await getExifOrientation(file);

    // 2. Create canvas and apply EXIF orientation
    let canvas = document.createElement('canvas');
    let ctx = canvas.getContext('2d')!;
    applyExifOrientation(canvas, ctx, img, orientation);

    const originalWidth = canvas.width;
    const originalHeight = canvas.height;

    // 3. Apply manual rotation if specified
    if (opts.manualRotation !== 0) {
        canvas = rotateCanvas(canvas, opts.manualRotation);
        ctx = canvas.getContext('2d')!;
    }

    // 4. Detect and apply crop
    let cropBounds: BoundingBox = { x: 0, y: 0, width: canvas.width, height: canvas.height };

    if (opts.manualCrop) {
        cropBounds = opts.manualCrop;
    } else if (opts.autoCrop) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        cropBounds = detectDocumentBounds(imageData);
    }

    if (cropBounds.x !== 0 || cropBounds.y !== 0 ||
        cropBounds.width !== canvas.width || cropBounds.height !== canvas.height) {
        const croppedCanvas = document.createElement('canvas');
        croppedCanvas.width = cropBounds.width;
        croppedCanvas.height = cropBounds.height;
        const croppedCtx = croppedCanvas.getContext('2d')!;
        croppedCtx.drawImage(
            canvas,
            cropBounds.x, cropBounds.y, cropBounds.width, cropBounds.height,
            0, 0, cropBounds.width, cropBounds.height
        );
        canvas = croppedCanvas;
        ctx = croppedCtx;
    }

    // 5. Detect and apply deskew
    let skewAngle = 0;
    if (opts.autoDeskew) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        skewAngle = detectSkewAngle(imageData);

        if (Math.abs(skewAngle) > 0.5) {
            canvas = rotateCanvas(canvas, skewAngle);
            ctx = canvas.getContext('2d')!;
        }
    }

    // 6. Convert to grayscale and enhance contrast
    if (opts.grayscale || opts.enhanceContrast) {
        enhanceImage(ctx, canvas.width, canvas.height, opts.enhanceContrast ? 1.3 : 1.0);
    }

    // 7. Compress
    const blob = await compressImage(canvas);

    // 8. Convert to base64
    const base64 = await blobToBase64(blob);

    return {
        blob,
        base64,
        width: canvas.width,
        height: canvas.height,
        originalWidth,
        originalHeight,
        skewAngle,
        cropBounds,
        sizeKB: Math.round(blob.size / 1024)
    };
}

// -------------------------------------------------------------------
// HELPER FUNCTIONS
// -------------------------------------------------------------------

function loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

function rotateCanvas(canvas: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
    const radians = (degrees * Math.PI) / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));

    const newWidth = Math.round(canvas.width * cos + canvas.height * sin);
    const newHeight = Math.round(canvas.width * sin + canvas.height * cos);

    const rotated = document.createElement('canvas');
    rotated.width = newWidth;
    rotated.height = newHeight;

    const ctx = rotated.getContext('2d')!;
    ctx.translate(newWidth / 2, newHeight / 2);
    ctx.rotate(radians);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

    return rotated;
}

async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]); // Remove data:image/jpeg;base64, prefix
        };
        reader.readAsDataURL(blob);
    });
}

/**
 * Create a preview URL for display
 */
export function createPreviewUrl(blob: Blob): string {
    return URL.createObjectURL(blob);
}

/**
 * Revoke preview URL to free memory
 */
export function revokePreviewUrl(url: string): void {
    URL.revokeObjectURL(url);
}
