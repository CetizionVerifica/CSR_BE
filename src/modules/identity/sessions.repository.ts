import { Injectable } from '@nestjs/common';
import { uuidv7 } from '../../common/ids';
import { type RefreshToken } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface NewRefreshToken {
  userId: string;
  familyId: string;
  tokenHash: string;
  userAgent: string | null;
  ip: string | null;
  currentWorkspaceId: string | null;
  expiresAt: Date;
}

/** refresh_tokens: one family per session, rotation + reuse detection (ADR-005). */
@Injectable()
export class SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(row: NewRefreshToken): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({ data: { id: uuidv7(), ...row } });
  }

  findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  /** Atomically retires `oldId` and inserts its successor; false if `oldId` was already used. */
  rotate(oldId: string, next: NewRefreshToken, now: Date): Promise<RefreshToken | null> {
    return this.prisma.$transaction(async (tx) => {
      const id = uuidv7();
      const retired = await tx.refreshToken.updateMany({
        where: { id: oldId, revokedAt: null, replacedBy: null },
        data: { revokedAt: now, replacedBy: id },
      });
      if (retired.count !== 1) return null;
      return tx.refreshToken.create({ data: { id, ...next } });
    });
  }

  async revokeFamily(familyId: string, now: Date, userId?: string): Promise<number> {
    const r = await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null, ...(userId ? { userId } : {}) },
      data: { revokedAt: now },
    });
    return r.count;
  }

  async revokeAllForUser(userId: string, now: Date, exceptFamilyId?: string | null): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null, ...(exceptFamilyId ? { familyId: { not: exceptFamilyId } } : {}) },
      data: { revokedAt: now },
    });
  }

  /** A session is active while its latest token is neither revoked nor expired. */
  async isFamilyActive(familyId: string, userId: string, now: Date): Promise<boolean> {
    const n = await this.prisma.refreshToken.count({
      where: { familyId, userId, revokedAt: null, expiresAt: { gt: now } },
    });
    return n > 0;
  }

  listActive(userId: string, now: Date): Promise<RefreshToken[]> {
    return this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async setWorkspace(familyId: string, workspaceId: string | null): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { currentWorkspaceId: workspaceId },
    });
  }

  async lastWorkspaceId(userId: string): Promise<string | null> {
    const t = await this.prisma.refreshToken.findFirst({
      where: { userId, currentWorkspaceId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { currentWorkspaceId: true },
    });
    return t?.currentWorkspaceId ?? null;
  }

  /** Daily cleanup (M01 §6): tokens expired for more than a day, consumed resets/verifications. */
  async deleteExpired(now: Date): Promise<Record<string, number>> {
    const cutoff = new Date(now.getTime() - 24 * 3600 * 1000);
    const [refresh, resets, verifications] = await this.prisma.$transaction([
      this.prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
      this.prisma.passwordReset.deleteMany({
        where: { OR: [{ expiresAt: { lt: cutoff } }, { usedAt: { lt: cutoff } }] },
      }),
      this.prisma.emailVerification.deleteMany({
        where: { OR: [{ expiresAt: { lt: cutoff } }, { usedAt: { lt: cutoff } }] },
      }),
    ]);
    return {
      refreshTokens: refresh.count,
      passwordResets: resets.count,
      emailVerifications: verifications.count,
    };
  }
}
