import Tesseract from 'tesseract.js';

let worker: Tesseract.Worker | null = null;

/**
 * Initialize the Tesseract worker (lazy, singleton).
 * Portuguese language for better accuracy with Brazilian text.
 */
async function getWorker(): Promise<Tesseract.Worker> {
    if (!worker) {
        worker = await Tesseract.createWorker('por', 1, {
            logger: m => console.log('[OCR]', m.status, m.progress ? `${(m.progress * 100).toFixed(0)}%` : ''),
        });
        // Set PSM mode for sparse text (better for app screenshots)
        await worker.setParameters({
            tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT, // PSM 11
        });
    }
    return worker;
}

/**
 * Preprocess image for better OCR on dark mode screenshots.
 * - Invert colors (dark mode -> light mode)
 * - Convert to grayscale
 * - Boost contrast
 * - Upscale 2x for better recognition
 */
async function preprocessImage(imageFile: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            // Create canvas at 2x size for better OCR
            const scale = 2;
            const canvas = document.createElement('canvas');
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            const ctx = canvas.getContext('2d')!;

            // Draw scaled image
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // Get image data for pixel manipulation
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            // Process each pixel: invert + grayscale + contrast boost
            const contrastFactor = 1.5; // Boost contrast
            for (let i = 0; i < data.length; i += 4) {
                // Get RGB values
                let r = data[i];
                let g = data[i + 1];
                let b = data[i + 2];

                // Invert colors (for dark mode)
                r = 255 - r;
                g = 255 - g;
                b = 255 - b;

                // Convert to grayscale
                const gray = 0.299 * r + 0.587 * g + 0.114 * b;

                // Apply contrast boost
                let adjusted = ((gray - 128) * contrastFactor) + 128;
                adjusted = Math.max(0, Math.min(255, adjusted));

                // Apply threshold for binarization (makes text sharper)
                const threshold = 128;
                const final = adjusted > threshold ? 255 : 0;

                data[i] = final;     // R
                data[i + 1] = final; // G
                data[i + 2] = final; // B
                // Alpha stays the same
            }

            // Put processed image back
            ctx.putImageData(imageData, 0, 0);

            // Return as base64
            const result = canvas.toDataURL('image/png');
            console.log('[OCR] Image preprocessed: inverted, grayscale, contrast boosted, 2x upscaled');
            resolve(result);
        };
        img.onerror = reject;

        // Load image from file
        const reader = new FileReader();
        reader.onload = () => {
            img.src = reader.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
    });
}

/**
 * Extract text from an image file using Tesseract OCR.
 * Applies preprocessing for better results on dark mode screenshots.
 * @param imageFile - The image file (PNG, JPG, etc.)
 * @returns The extracted text as a string.
 */
export async function extractTextFromImage(imageFile: File): Promise<string> {
    const w = await getWorker();

    // Preprocess image for dark mode
    console.log('[OCR] Starting preprocessing...');
    const processedImage = await preprocessImage(imageFile);

    console.log('[OCR] Starting recognition...');
    const result = await w.recognize(processedImage);

    console.log('[OCR] Recognition complete. Confidence:', result.data.confidence);
    return result.data.text;
}

/**
 * Terminate the OCR worker (call on component unmount to free resources).
 */
export async function terminateOCRWorker(): Promise<void> {
    if (worker) {
        await worker.terminate();
        worker = null;
    }
}

