import { Injectable } from '@nestjs/common';
import { uuidv7 } from '../../common/ids';
import { type Prisma, type User } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** users + per-user token tables (not RLS-scoped; M01 §6). Only identity services call this. */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findManyByIds(ids: string[]) {
    return this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true },
    });
  }

  create(data: Omit<Prisma.UserCreateInput, 'id'>): Promise<User> {
    return this.prisma.user.create({ data: { id: uuidv7(), ...data } });
  }

  update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  // ─── password resets ───
  async createPasswordReset(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.passwordReset.create({ data: { id: uuidv7(), userId, tokenHash, expiresAt } });
  }

  findPasswordReset(tokenHash: string) {
    return this.prisma.passwordReset.findUnique({ where: { tokenHash } });
  }

  /**
   * Sets the new password, consumes every open reset of the user and revokes all sessions
   * (US-01-2) atomically. Returns false if the reset was consumed concurrently.
   */
  completePasswordReset(
    resetId: string,
    userId: string,
    data: Prisma.UserUpdateInput,
    now: Date,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordReset.updateMany({
        where: { id: resetId, usedAt: null },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) return false;
      await tx.passwordReset.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } });
      await tx.user.update({ where: { id: userId }, data });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
      return true;
    });
  }

  // ─── email verifications ───
  async createEmailVerification(
    data: Omit<Prisma.EmailVerificationUncheckedCreateInput, 'id'>,
  ): Promise<void> {
    await this.prisma.emailVerification.create({ data: { id: uuidv7(), ...data } });
  }

  findEmailVerification(tokenHash: string) {
    return this.prisma.emailVerification.findUnique({ where: { tokenHash } });
  }

  latestSignupVerification(userId: string) {
    return this.prisma.emailVerification.findFirst({
      where: { userId, purpose: 'signup' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async consumeEmailVerification(id: string, now: Date, tx?: Prisma.TransactionClient): Promise<boolean> {
    const r = await (tx ?? this.prisma).emailVerification.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: now },
    });
    return r.count === 1;
  }

  // ─── MFA recovery codes ───
  replaceRecoveryCodes(userId: string, codeHashes: string[], userData: Prisma.UserUpdateInput) {
    return this.prisma.$transaction([
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.mfaRecoveryCode.createMany({
        data: codeHashes.map((codeHash) => ({ id: uuidv7(), userId, codeHash })),
      }),
      this.prisma.user.update({ where: { id: userId }, data: userData }),
    ]);
  }

  async consumeRecoveryCode(userId: string, codeHash: string, now: Date): Promise<boolean> {
    const r = await this.prisma.mfaRecoveryCode.updateMany({
      where: { userId, codeHash, usedAt: null },
      data: { usedAt: now },
    });
    return r.count > 0;
  }

  disableMfa(userId: string) {
    return this.prisma.$transaction([
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.user.update({
        where: { id: userId },
        data: { mfaEnabledAt: null, mfaTotpSecretEnc: null },
      }),
    ]);
  }

  // ─── platform admin ───
  listForPlatform(
    filter: { q?: string; status?: User['status']; platformRole?: User['platformRole'] },
    cursor: string | undefined,
    take: number,
  ) {
    const where: Prisma.UserWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.platformRole ? { platformRole: filter.platformRole } : {}),
      ...(filter.q
        ? {
            OR: [
              { email: { contains: filter.q, mode: 'insensitive' } },
              { name: { contains: filter.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(cursor ? { id: { gt: cursor } } : {}),
    };
    return this.prisma.user.findMany({ where, orderBy: { id: 'asc' }, take });
  }
}
