/**
 * Company reference data (M02 §6): sectors (legacy two-level cascader, FE legacy
 * `src/common/enum/companySectors.js`) and ISO 3166-1 alpha-2 countries with their UN M49 region.
 *
 * Sector codes keep the legacy values (including the `heatlhSocialCare` typo) so migrated companies
 * map 1:1; labels are corrected. ISIC/NACE codes are not assigned yet (M02 §13).
 */

export interface SectorSeed {
  code: string;
  parentCode: string | null;
  label: string;
  sortOrder: number;
}

const GROUPS: Array<[code: string, label: string, children: Array<[string, string]>]> = [
  [
    'primarySectorExtractionOfRawMaterials',
    'Primary sector - Extraction of raw materials',
    [
      ['fishing', 'Fishing'],
      ['farming', 'Farming'],
      ['landMining', 'Land mining'],
      ['seaMining', 'Sea mining'],
      ['quarrying', 'Quarrying'],
      ['forestry', 'Forestry'],
      ['agriculture', 'Agriculture'],
      ['oilgas', 'Oil and gas'],
    ],
  ],
  [
    'secondarySectorManufacturing',
    'Secondary sector - Manufacturing',
    [
      ['automotiveIndustry', 'Automotive industry'],
      ['electricalIndustry', 'Electrical industry'],
      ['chemicalIndustry', 'Chemical industry'],
      ['metallurgicalIndustry', 'Metallurgical industry'],
      ['constructionIndustry', 'Construction industry'],
      ['foodBeverageIndustry', 'Food & beverage industry'],
      ['glassIndustry', 'Glass industry'],
      ['textileClothingIndustry', 'Textile & clothing industry'],
      ['consumerGoodsIndustry', 'Consumer goods industry'],
      ['hardware', 'Hardware'],
      ['aeronauticalIndustry', 'Aeronautical industry'],
      ['shippingIndustry', 'Shipping industry'],
      ['spaceIndustry', 'Space industry'],
    ],
  ],
  [
    'tertiarySectorServices',
    'Tertiary sector - Services',
    [
      ['retail', 'Retail'],
      ['shipping', 'Shipping'],
      ['hotelAccommodation', 'Hotel & accommodation'],
      ['storage', 'Storage'],
      ['craftsRepairs', 'Crafts & repairs'],
      ['governmentPublicAdministration', 'Government & public administration'],
      ['tourism', 'Tourism'],
      ['tradeProcurement', 'Trade and procurement'],
      ['entertainmentCultureSport', 'Entertainment, culture and sport'],
      ['distributionLogistics', 'Distribution & logistics'],
      ['aeronautical', 'Aeronautical'],
      ['militaryServices', 'Military services'],
      ['cleaning', 'Cleaning'],
    ],
  ],
  [
    'quaternarySectorSpecialisedKnowledgeSkills',
    'Quaternary sector - Specialised knowledge and skills',
    [
      ['computingSoftwareDevelopment', 'Computing & software development'],
      ['informationCommunicationsTechnology', 'Information and communications technology (ICT)'],
      ['consultancyAdviceLegalExpertServices', 'Consultancy, advice, legal and expert services'],
      ['researchDevelopment', 'Research & development (R&D)'],
      ['researchInnovation', 'Research & innovation (R&I)'],
      ['mediaInformationPromotion', 'Media, information and promotion (incl. marketing)'],
      ['heatlhSocialCare', 'Health and social care'],
      ['financialServices', 'Financial services'],
      ['education', 'Education'],
    ],
  ],
];

export const SECTORS: SectorSeed[] = GROUPS.flatMap(([code, label, children], g) => [
  { code, parentCode: null, label, sortOrder: g },
  ...children.map(([c, l], i) => ({ code: c, parentCode: code, label: l, sortOrder: i })),
]);

const REGIONS: Record<string, string> = {
  africa:
    'DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU YT MA MZ NA NE NG RE RW SH ST SN SC SL SO ZA SS SD TZ TG TN UG EH ZM ZW IO TF',
  americas:
    'AI AG AR AW BS BB BZ BM BO BQ BV BR CA KY CL CO CR CU CW DM DO EC SV FK GF GL GD GP GT GY HT HN JM MQ MX MS NI PA PY PE PR BL KN LC MF PM VC SX GS SR TT TC US UY VE VG VI',
  asia: 'AF AM AZ BH BD BT BN KH CN CY GE HK IN ID IR IQ IL JP JO KZ KW KG LA LB MO MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY TW TJ TH TL TR TM AE UZ VN YE',
  europe:
    'AX AL AD AT BY BE BA BG HR CZ DK EE FO FI FR DE GI GR GG VA HU IS IE IM IT JE LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SJ SE CH UA GB',
  oceania: 'AS AU CX CC CK FJ PF GU HM KI MH FM NR NC NZ NU NF MP PW PG PN WS SB TK TO TV UM VU WF',
  antarctica: 'AQ',
};

export const COUNTRIES: Array<{ code: string; region: string }> = Object.entries(REGIONS)
  .flatMap(([region, codes]) => codes.split(' ').map((code) => ({ code, region })))
  .sort((a, b) => a.code.localeCompare(b.code));
