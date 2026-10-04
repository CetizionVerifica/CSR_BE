import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** Global reference data (M02 §6): sectors and countries. */
@Injectable()
export class ReferenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  sectors() {
    return this.prisma.sector.findMany({
      orderBy: [{ parentCode: { sort: 'asc', nulls: 'first' } }, { sortOrder: 'asc' }],
    });
  }

  countries() {
    return this.prisma.country.findMany({ orderBy: { code: 'asc' } });
  }

  async sectorExists(code: string): Promise<boolean> {
    return (await this.prisma.sector.count({ where: { code } })) > 0;
  }

  async countryExists(code: string): Promise<boolean> {
    return (await this.prisma.country.count({ where: { code } })) > 0;
  }
}
