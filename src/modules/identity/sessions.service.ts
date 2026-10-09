import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { ProblemError } from '../../common/errors/problem';
import { type RequestMeta } from '../../common/http/request-meta';
import { uuidv7 } from '../../common/ids';
import { type User } from '../../generated/prisma/client';
import { RateLimiter } from '../../infra/rate-limit/rate-limiter';
import { AuditService } from '../audit';
import { expiresAt, hashToken, isTokenUsable, TTL } from './engine/tokens';
import { AuthEvents } from './events';
import { LIMITS } from './rate-limits';
import { SessionsRepository } from './sessions.repository';
import { TokenService } from './token.service';
import { UsersRepository } from './users.repository';
import { WorkspaceAccessService } from './workspace-access.service';

export const REFRESH_COOKIE = 'rs_refresh';
export const REFRESH_COOKIE_PATH = '/v1/auth';

export interface IssuedSession {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  workspaceId: string | null;
}

/** Sessions = refresh-token families with rotation and reuse detection (ADR-005, M01 §7.1). */
@Injectable()
export class SessionsService {
  constructor(
    private readonly sessions: SessionsRepository,
    private readonly users: UsersRepository,
    private readonly tokens: TokenService,
    private readonly access: WorkspaceAccessService,
    private readonly audit: AuditService,
    private readonly limiter: RateLimiter,
  ) {}

  /** Starts a session: new family, refresh cookie, access token for the default workspace. */
  async start(
    user: Pick<User, 'id' | 'platformRole'>,
    res: Response,
    meta: RequestMeta,
    requestedWorkspaceId?: string | null,
  ): Promise<IssuedSession> {
    const now = new Date();
    const last = await this.sessions.lastWorkspaceId(user.id);
    const ws = await this.access.defaultWorkspace(user, [requestedWorkspaceId, last], now);
    const familyId = uuidv7();
    const refresh = this.tokens.randomToken();
    await this.sessions.create({
      userId: user.id,
      familyId,
      tokenHash: hashToken(refresh),
      userAgent: meta.userAgent,
      ip: meta.ip,
      currentWorkspaceId: ws?.workspaceId ?? null,
      expiresAt: expiresAt(now, TTL.refreshTokenMs),
    });
    this.setCookie(res, refresh, now);
    const access = await this.tokens.signAccess({
      sub: user.id,
      wid: ws?.workspaceId ?? null,
      sid: familyId,
    });
    return {
      accessToken: access.token,
      tokenType: 'Bearer',
      expiresIn: access.expiresIn,
      workspaceId: ws?.workspaceId ?? null,
    };
  }

  /** Rotates the refresh token; a reused (already rotated) token revokes the whole family. */
  async refresh(refreshToken: string | null, res: Response, meta: RequestMeta): Promise<IssuedSession> {
    const now = new Date();
    const invalid = () => {
      this.clearCookie(res);
      return new ProblemError('unauthenticated', 'Session expired');
    };
    await this.limiter.enforce(LIMITS.refreshIp, meta.ip ?? 'unknown');
    if (!refreshToken || refreshToken.length > 256) throw invalid();
    const current = await this.sessions.findByHash(hashToken(refreshToken));
    if (!current) throw invalid();
    if (current.replacedBy || current.revokedAt) {
      if (current.replacedBy) await this.reuseDetected(current.familyId, current.userId, meta, now);
      throw invalid();
    }
    if (!isTokenUsable(current, now)) throw invalid();
    const user = await this.users.findById(current.userId);
    if (!user || user.status !== 'active') throw invalid();

    const ws = await this.access.defaultWorkspace(user, [current.currentWorkspaceId], now, true);
    const next = this.tokens.randomToken();
    const rotated = await this.sessions.rotate(
      current.id,
      {
        userId: user.id,
        familyId: current.familyId,
        tokenHash: hashToken(next),
        userAgent: meta.userAgent,
        ip: meta.ip,
        currentWorkspaceId: ws?.workspaceId ?? null,
        expiresAt: expiresAt(now, TTL.refreshTokenMs),
      },
      now,
    );
    if (!rotated) {
      await this.reuseDetected(current.familyId, current.userId, meta, now);
      throw invalid();
    }
    this.setCookie(res, next, now);
    const access = await this.tokens.signAccess({
      sub: user.id,
      wid: ws?.workspaceId ?? null,
      sid: current.familyId,
    });
    return {
      accessToken: access.token,
      tokenType: 'Bearer',
      expiresIn: access.expiresIn,
      workspaceId: ws?.workspaceId ?? null,
    };
  }

  private async reuseDetected(familyId: string, userId: string, meta: RequestMeta, now: Date): Promise<void> {
    await this.sessions.revokeFamily(familyId, now);
    await this.audit.record(
      {
        action: AuthEvents.refreshReuseDetected,
        entityType: 'session',
        entityId: familyId,
        actor: { type: 'user', id: userId },
      },
      meta,
    );
  }

  async revoke(familyId: string, now = new Date(), userId?: string): Promise<boolean> {
    return (await this.sessions.revokeFamily(familyId, now, userId)) > 0;
  }

  revokeAll(userId: string, exceptFamilyId?: string | null): Promise<void> {
    return this.sessions.revokeAllForUser(userId, new Date(), exceptFamilyId);
  }

  isActive(familyId: string, userId: string): Promise<boolean> {
    return this.sessions.isFamilyActive(familyId, userId, new Date());
  }

  async list(userId: string, currentFamilyId: string | null) {
    const rows = await this.sessions.listActive(userId, new Date());
    return rows.map((r) => ({
      id: r.familyId,
      userAgent: r.userAgent,
      ip: r.ip,
      lastActiveAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      current: r.familyId === currentFamilyId,
    }));
  }

  setWorkspace(familyId: string, workspaceId: string | null): Promise<void> {
    return this.sessions.setWorkspace(familyId, workspaceId);
  }

  private setCookie(res: Response, token: string, now: Date): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      expires: expiresAt(now, TTL.refreshTokenMs),
    });
  }

  clearCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
    });
  }
}
