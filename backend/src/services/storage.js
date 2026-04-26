const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { logger } = require('../utils/logger');

const s3 = new S3Client({
  region: process.env.S3_REGION || 'auto',
  endpoint: process.env.S3_ENDPOINT, // For Cloudflare R2: https://<account>.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY
  }
  forcePathStyle: true
});

const BUCKET = process.env.S3_BUCKET || 'ibirdos-files';

async function uploadToS3(buffer, key, contentType) {
  try {
    console.log("📦 Uploading to S3:", {
      bucket: BUCKET,
      key,
      contentType
    });

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType
    }));

    const cdnBase = process.env.S3_CDN_URL || `https://${BUCKET}.s3.amazonaws.com`;
    const finalUrl = `${cdnBase}/${key}`;

    console.log("✅ Uploaded successfully:", finalUrl);

    return finalUrl;

  } catch (err) {
    console.error("❌ S3 ERROR FULL:", err);
    console.error("❌ MESSAGE:", err.message);
    console.error("❌ STACK:", err.stack);

    logger.error('S3 upload failed', err);

    throw err; // 👈 DO NOT hide error
  }
}

async function getSignedDownloadUrl(key, expiresIn = 3600) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return await getSignedUrl(s3, command, { expiresIn });
}

module.exports = { uploadToS3, getSignedDownloadUrl };
