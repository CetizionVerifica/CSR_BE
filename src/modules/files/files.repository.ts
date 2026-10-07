import { Injectable } from '@nestjs/common';
import { type File, type FileVersion, type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export type FileWithVersions = File & { versions: FileVersion[] };

type NewFile = Pick<
  Prisma.FileUncheckedCreateInput,
  'id' | 'purpose' | 'name' | 'mimeType' | 'sizeBytes' | 'uploadedBy'
>;
type NewVersion = Pick<
  Prisma.FileVersionUncheckedCreateInput,
  'id' | 's3Key' | 'name' | 'mimeType' | 'sizeBytes' | 'uploadedBy'
>;

/** Versions that occupy storage (and count against the workspace quota). */
const STORED: Prisma.FileVersionWhereInput = {
  status: { in: ['pending', 'scanning', 'ready', 'quarantined'] },
};

/** files, file_versions (tenant-owned, RLS) and logo references (M14 §3). */
@Injectable()
export class FilesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(workspaceId: string, file: NewFile, version: NewVersion): Promise<File> {
    return this.prisma.withTenant(workspaceId, async (tx) => {
      const created = await tx.file.create({ data: { ...file, workspaceId, status: 'pending' } });
      await tx.fileVersion.create({ data: { ...version, workspaceId, fileId: file.id } });
      return created;
    });
  }

  addVersion(workspaceId: string, fileId: string, version: NewVersion): Promise<FileVersion> {
    return this.prisma.withTenant(workspaceId, (tx) =>
      tx.fileVersion.create({ data: { ...version, workspaceId, fileId } }),
    );
  }

  find(workspaceId: string, id: string): Promise<FileWithVersions | null> {
    return this.prisma.withTenant(workspaceId, (tx) =>
      tx.file.findFirst({
        where: { id, workspaceId },
        include: { versions: { orderBy: { id: 'desc' } } },
      }),
    );
  }

  list(
    workspaceId: string,
    filter: { purpose?: File['purpose'] | undefined; status?: File['status'] | undefined },
    cursor: string | undefined,
    take: number,
  ): Promise<File[]> {
    return this.prisma.withTenant(workspaceId, (tx) =>
      tx.file.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          status: filter.status ?? { not: 'deleted' },
          ...(filter.purpose ? { purpose: filter.purpose } : {}),
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        orderBy: { id: 'desc' },
        take,
      }),
    );
  }

  findVersion(workspaceId: string, versionId: string): Promise<(FileVersion & { file: File }) | null> {
    return this.prisma.withTenant(workspaceId, (tx) =>
      tx.fileVersion.findFirst({ where: { id: versionId, workspaceId }, include: { file: true } }),
    );
  }

  /**
   * Moves a version from `from` to its next state; false when another request moved it first
   * (complete is called twice, a job runs twice).
   */
  async transitionVersion(
    workspaceId: string,
    versionId: string,
    from: FileVersion['status'],
    data: Prisma.FileVersionUncheckedUpdateInput,
    fileData?: Prisma.FileUncheckedUpdateInput,
  ): Promise<boolean> {
    return this.prisma.withTenant(workspaceId, async (tx) => {
      const res = await tx.fileVersion.updateMany({ where: { id: versionId, status: from }, data });
      if (res.count === 0) return false;
      if (fileData) {
        const v = await tx.fileVersion.findUniqueOrThrow({ where: { id: versionId } });
        await tx.file.update({ where: { id: v.fileId }, data: fileData });
      }
      return true;
    });
  }

  softDelete(workspaceId: string, id: string, now: Date): Promise<File> {
    return this.prisma.withTenant(workspaceId, (tx) =>
      tx.file.update({ where: { id }, data: { status: 'deleted', deletedAt: now } }),
    );
  }

  /** The workspace's entitlement limits JSON (storage quota). */
  async limits(workspaceId: string): Promise<unknown> {
    const ent = await this.prisma.withTenant(workspaceId, (tx) =>
      tx.entitlement.findUnique({ where: { workspaceId }, select: { limits: true } }),
    );
    return ent?.limits ?? null;
  }

  /** Bytes stored by the workspace (all versions not rejected, until purged). */
  async storedBytes(workspaceId: string): Promise<number> {
    const agg = await this.prisma.withTenant(workspaceId, (tx) =>
      tx.fileVersion.aggregate({ where: { workspaceId, ...STORED }, _sum: { sizeBytes: true } }),
    );
    return Number(agg._sum.sizeBytes ?? 0n);
  }

  /** Whether the file is the logo of the workspace or of one of its companies (live or deleted). */
  async usedAsLogo(workspaceId: string, fileId: string): Promise<boolean> {
    const ws = await this.prisma.workspace.count({ where: { id: workspaceId, logoFileId: fileId } });
    if (ws > 0) return true;
    const companies = await this.prisma.withTenant(workspaceId, (tx) =>
      tx.company.count({ where: { workspaceId, logoFileId: fileId } }),
    );
    return companies > 0;
  }

  /** Files deleted before `before` (purge candidates) with their versions. */
  deletedBefore(workspaceId: string, before: Date): Promise<FileWithVersions[]> {
    return this.prisma.withTenant(workspaceId, (tx) =>
      tx.file.findMany({
        where: { workspaceId, deletedAt: { lt: before } },
        include: { versions: true },
        take: 500,
      }),
    );
  }

  /** Versions still waiting for their upload since before `before`. */
  abandonedVersions(workspaceId: string, before: Date): Promise<Array<FileVersion & { file: File }>> {
    return this.prisma.withTenant(workspaceId, (tx) =>
      tx.fileVersion.findMany({
        where: { workspaceId, status: 'pending', createdAt: { lt: before } },
        include: { file: true },
        take: 500,
      }),
    );
  }

  hardDelete(workspaceId: string, id: string): Promise<unknown> {
    return this.prisma.withTenant(workspaceId, (tx) => tx.file.deleteMany({ where: { id, workspaceId } }));
  }

  /** Every workspace id (the purge job runs per tenant, under RLS). */
  async allWorkspaceIds(): Promise<string[]> {
    const rows = await this.prisma.workspace.findMany({ select: { id: true } });
    return rows.map((r) => r.id);
  }
}
