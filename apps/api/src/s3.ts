import { S3Client } from "@aws-sdk/client-s3";
import { env } from "./env";

// WHEN_REQUIRED stops the SDK from adding default CRC32 checksum parameters to
// presigned URLs, which otherwise make browser PUT uploads fail with checksum errors.
export const s3 = new S3Client({
  region: env.AWS_REGION,
  requestChecksumCalculation: "WHEN_REQUIRED",
});
