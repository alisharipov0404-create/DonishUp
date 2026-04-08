/**
 * Utility for client-side image compression and resizing.
 * Makes uploads faster by reducing payload size before sending to server/AI.
 */
export class ImageUtils {
    /**
     * Compresses and resizes an image file.
     * @param {File} file - The original image file.
     * @param {Object} options - Compression options.
     * @param {number} options.maxWidth - Maximum width in pixels.
     * @param {number} options.maxHeight - Maximum height in pixels.
     * @param {number} options.quality - JPEG quality (0 to 1).
     * @returns {Promise<Blob>} - The compressed image blob.
     */
    static async compress(file, options = { maxWidth: 1200, maxHeight: 1200, quality: 0.7 }) {
        if (!file.type.startsWith('image/')) {
            return file; // Not an image, return as is
        }

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    // Calculate new dimensions
                    if (width > height) {
                        if (width > options.maxWidth) {
                            height *= options.maxWidth / width;
                            width = options.maxWidth;
                        }
                    } else {
                        if (height > options.maxHeight) {
                            width *= options.maxHeight / height;
                            height = options.maxHeight;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob(
                        (blob) => {
                            if (blob) {
                                resolve(blob);
                            } else {
                                reject(new Error('Canvas toBlob failed'));
                            }
                        },
                        'image/jpeg',
                        options.quality
                    );
                };
                img.onerror = (err) => reject(err);
            };
            reader.onerror = (err) => reject(err);
        });
    }

    /**
     * Converts a Blob to a base64 string (without the data: prefix).
     * @param {Blob} blob 
     * @returns {Promise<string>}
     */
    static async blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = () => {
                const base64String = reader.result.split(',')[1];
                resolve(base64String);
            };
            reader.onerror = reject;
        });
    }
}
