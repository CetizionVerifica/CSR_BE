import { createHmac, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { type RequestMeta } from '../../common/http/request-meta';
import { AppConfig } from '../../config/app-config';
import { type Prisma } from '../../generated/prisma/client';
import { type TenantTx } from '../../infra/prisma/prisma.service';
import { AuditRepository } from './audit.repository';

export interface AuditActor {
  type: 'user' | 'system' | 'anonymous';
  id?: string | null;
  impersonatorId?: string | null;
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  workspaceId?: string | null;
  actor: AuditActor;
  /** Before/after or facts about the change. Never passwords, tokens or email addresses. */
  diff?: Record<string, unknown>;
}

/** Writes audit_events (M12 §2.4). IPs are stored only as a keyed hash. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private readonly ipKey: Buffer;

  constructor(
    private readonly repo: AuditRepository,
    config: AppConfig,
  ) {
    const key = config.get('IP_HASH_KEY');
    if (!key) this.logger.warn('IP_HASH_KEY not set: using an ephemeral key (development only)');
    this.ipKey = key ? Buffer.from(key, 'base64') : randomBytes(32);
  }

  hashIp(ip: string | null): string | null {
    return ip ? createHmac('sha256', this.ipKey).update(ip).digest('hex') : null;
  }

  async record(entries: AuditEntry | AuditEntry[], meta: RequestMeta | null, tx?: TenantTx): Promise<void> {
    const list = Array.isArray(entries) ? entries : [entries];
    if (list.length === 0) return;
    await this.repo.insert(
      list.map((e) => ({
        workspaceId: e.workspaceId ?? null,
        actorType: e.actor.type,
        actorId: e.actor.id ?? null,
        impersonatorId: e.actor.impersonatorId ?? null,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId ?? null,
        ...(e.diff ? { diff: e.diff as Prisma.InputJsonValue } : {}),
        requestId: meta?.requestId ?? null,
        ipHash: this.hashIp(meta?.ip ?? null),
        userAgent: meta?.userAgent ?? null,
      })),
      tx,
    );
  }
}
