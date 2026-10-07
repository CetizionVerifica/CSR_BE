import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { LocalStorageAdapter } from './local.storage';
import { S3StorageAdapter } from './s3.storage';
import { STORAGE_ADAPTER, type StorageAdapter } from './storage.adapter';

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_ADAPTER,
      inject: [AppConfig],
      useFactory: (config: AppConfig): StorageAdapter =>
        config.get('STORAGE_DRIVER') === 's3'
          ? new S3StorageAdapter({
              endpoint: config.get('STORAGE_S3_ENDPOINT')!,
              region: config.get('STORAGE_S3_REGION'),
              bucket: config.get('STORAGE_S3_BUCKET')!,
              accessKey: config.get('STORAGE_S3_ACCESS_KEY')!,
              secretKey: config.get('STORAGE_S3_SECRET_KEY')!,
            })
          : new LocalStorageAdapter(config.get('STORAGE_LOCAL_DIR'), config.get('STORAGE_LOCAL_PUBLIC_URL')),
    },
  ],
  exports: [STORAGE_ADAPTER],
})
export class StorageModule {}
