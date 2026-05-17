import * as tus from 'tus-js-client';

export interface UploadOptions {
  file: File;
  metadata?: Record<string, string>;
  onProgress?: (bytesUploaded: number, bytesTotal: number) => void;
  onSuccess?: (uploadUrl: string) => void;
  onError?: (error: Error) => void;
}

export function createUpload(options: UploadOptions): tus.Upload {
  const upload = new tus.Upload(options.file, {
    endpoint: '/api/upload',
    retryDelays: [0, 3000, 5000, 10000, 20000],
    metadata: {
      filename: options.file.name,
      filetype: options.file.type,
      ...options.metadata
    },
    onError: (error) => {
      console.error('[Tus] Upload failed:', error);
      options.onError?.(error);
    },
    onProgress: (bytesUploaded, bytesTotal) => {
      options.onProgress?.(bytesUploaded, bytesTotal);
    },
    onSuccess: () => {
      console.log('[Tus] Upload complete:', upload.url);
      if (upload.url) {
        options.onSuccess?.(upload.url);
      }
    }
  });

  return upload;
}

export function startUpload(options: UploadOptions): tus.Upload {
  const upload = createUpload(options);
  upload.start();
  return upload;
}
