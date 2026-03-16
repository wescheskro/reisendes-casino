import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  databaseUrl: process.env.DATABASE_URL!,
  jwtSecret: process.env.JWT_SECRET!,
  s3: {
    endpoint: process.env.S3_ENDPOINT!,
    accessKey: process.env.S3_ACCESS_KEY!,
    secretKey: process.env.S3_SECRET_KEY!,
    bucket: process.env.S3_BUCKET || 'avatar-assets',
  },
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').filter(Boolean),
};
