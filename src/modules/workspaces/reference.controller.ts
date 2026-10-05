import { Controller, Get, Header } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Authenticated } from '../../common/auth/decorators';
import { ApiZodOk } from '../../common/validation/zod';
import { countryList, sectorList } from './dto/reference.dto';
import { ReferenceRepository } from './reference.repository';

const CACHE = 'private, max-age=86400';

/** M02 §8 reference lists (global, cacheable). */
@ApiTags('reference')
@ApiBearerAuth()
@Authenticated()
@Controller('reference')
export class ReferenceController {
  constructor(private readonly reference: ReferenceRepository) {}

  @Get('sectors')
  @Header('Cache-Control', CACHE)
  @ApiZodOk(sectorList)
  async sectors() {
    const rows = await this.reference.sectors();
    return {
      items: rows.map((s) => ({
        code: s.code,
        parentCode: s.parentCode,
        label: s.label,
        labelKey: s.labelKey,
        sortOrder: s.sortOrder,
        isicCode: s.isicCode,
        naceCode: s.naceCode,
      })),
    };
  }

  @Get('countries')
  @Header('Cache-Control', CACHE)
  @ApiZodOk(countryList)
  async countries() {
    const rows = await this.reference.countries();
    return { items: rows.map((c) => ({ code: c.code, region: c.region, labelKey: c.labelKey })) };
  }
}
