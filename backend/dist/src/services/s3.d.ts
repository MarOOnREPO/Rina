import { S3Client } from '@aws-sdk/client-s3';
declare const BUCKET_NAME: string;
export declare const s3Client: S3Client;
export declare function getPresignedUploadUrl(key: string, contentType: string, expiresIn?: number): Promise<string>;
export declare function getPresignedDownloadUrl(key: string, expiresIn?: number): Promise<string>;
export { BUCKET_NAME };
//# sourceMappingURL=s3.d.ts.map