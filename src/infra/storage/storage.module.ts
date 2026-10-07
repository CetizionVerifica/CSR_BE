import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { CloudinaryStorageAdapter } from './cloudinary.storage';
import { LocalStorageAdapter } from './local.storage';
import { S3StorageAdapter } from './s3.storage';
import { STORAGE_ADAPTER, type StorageAdapter } from './storage.adapter';

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_ADAPTER,
      inject: [AppConfig],
      useFactory: (config: AppConfig): StorageAdapter => {
        switch (config.get('STORAGE_DRIVER')) {
          case 'cloudinary':
            return new CloudinaryStorageAdapter({
              cloudName: config.get('CLOUDINARY_CLOUD_NAME')!,
              apiKey: config.get('CLOUDINARY_API_KEY')!,
              apiSecret: config.get('CLOUDINARY_API_SECRET')!,
            });
          case 's3':
            return new S3StorageAdapter({
              endpoint: config.get('STORAGE_S3_ENDPOINT')!,
              region: config.get('STORAGE_S3_REGION'),
              bucket: config.get('STORAGE_S3_BUCKET')!,
              accessKey: config.get('STORAGE_S3_ACCESS_KEY')!,
              secretKey: config.get('STORAGE_S3_SECRET_KEY')!,
            });
          default:
            return new LocalStorageAdapter(
              config.get('STORAGE_LOCAL_DIR'),
              config.get('STORAGE_LOCAL_PUBLIC_URL'),
            );
        }
      },
    },
  ],
  exports: [STORAGE_ADAPTER],
})
export class StorageModule {}
