import { Global, Module } from '@nestjs/common';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

/** Minimal append-only audit trail (M12 §2.4); read API, hash chain and partitioning come with M12. */
@Global()
@Module({ providers: [AuditRepository, AuditService], exports: [AuditService, AuditRepository] })
export class AuditModule {}
