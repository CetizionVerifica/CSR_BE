import {
  abandonedUploadBefore,
  checkDeclared,
  contentDisposition,
  contentMatches,
  detectKinds,
  extensionOf,
  isPlainText,
  HEAD_BYTES,
  isPreviewable,
  kindOfMime,
  needsTail,
  TAIL_BYTES,
  isSvgDocument,
  MB,
  mimeTypeOf,
  officeKind,
  purgeDeletedBefore,
  PURPOSE_RULES,
  quarantineKey,
  safeFileName,
  storageKey,
  svgProblem,
  URL_TTL_SECONDS,
  usedMegabytes,
  withinStorageQuota,
} from './file-rules';

const bytes = (...b: number[]) => Uint8Array.from(b);
const text = (s: string) => new Uint8Array(Buffer.from(s, 'utf8'));
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const zip = (...names: string[]) =>
  Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(names.join('\0'))]);

describe('file rules (M14 §2, §7)', () => {
  describe('purpose rules', () => {
    it('evidence: 50 MB, documents and images; logo: 2 MB, PNG/SVG/JPG', () => {
      expect(PURPOSE_RULES.evidence).toEqual({
        maxBytes: 50 * MB,
        kinds: ['pdf', 'docx', 'xlsx', 'pptx', 'png', 'jpg', 'txt', 'csv'],
      });
      expect(PURPOSE_RULES.logo).toEqual({ maxBytes: 2 * MB, kinds: ['png', 'svg', 'jpg'] });
      expect(MB).toBe(1_048_576);
    });

    it.each([
      ['evidence', 'report.pdf', 'application/pdf', 'pdf'],
      ['evidence', 'Report.PDF', 'APPLICATION/PDF', 'pdf'],
      ['evidence', 'policy.docx', DOCX, 'docx'],
      ['evidence', 'data.xlsx', XLSX, 'xlsx'],
      ['evidence', 'deck.pptx', PPTX, 'pptx'],
      ['evidence', 'photo.jpeg', 'image/jpeg', 'jpg'],
      ['evidence', 'photo.jpg', 'image/jpeg', 'jpg'],
      ['evidence', 'scan.png', 'image/png', 'png'],
      ['evidence', 'notes.txt', 'text/plain', 'txt'],
      ['evidence', 'table.csv', 'text/csv', 'csv'],
      ['logo', 'logo.svg', 'image/svg+xml', 'svg'],
      ['logo', 'logo.png', 'image/png', 'png'],
    ] as const)('%s accepts %s (%s) as %s', (purpose, name, mimeType, kind) => {
      expect(checkDeclared(purpose, { name, mimeType, size: 10 })).toEqual({ ok: true, kind });
    });

    it.each([
      ['evidence', 'logo.svg', 'image/svg+xml', 10, 'mimeType'],
      ['evidence', 'run.exe', 'application/x-msdownload', 10, 'mimeType'],
      ['logo', 'logo.pdf', 'application/pdf', 10, 'mimeType'],
      ['evidence', 'report.exe', 'application/pdf', 10, 'name'],
      ['evidence', 'report', 'application/pdf', 10, 'name'],
      ['evidence', 'big.pdf', 'application/pdf', 50 * MB + 1, 'size'],
      ['logo', 'big.png', 'image/png', 2 * MB + 1, 'size'],
    ] as const)('%s rejects %s (%s, %d bytes) on %s', (purpose, name, mimeType, size, path) => {
      const r = checkDeclared(purpose, { name, mimeType, size });
      expect(r).toMatchObject({ ok: false, path });
    });

    it('accepts exactly the size limit and names the limit in the message', () => {
      expect(checkDeclared('logo', { name: 'a.png', mimeType: 'image/png', size: 2 * MB }).ok).toBe(true);
      expect(checkDeclared('logo', { name: 'a.png', mimeType: 'image/png', size: 2 * MB + 1 })).toEqual({
        ok: false,
        path: 'size',
        message: 'The file is larger than 2 MB',
      });
      expect(checkDeclared('logo', { name: 'a.pdf', mimeType: 'application/pdf', size: 1 })).toEqual({
        ok: false,
        path: 'mimeType',
        message: 'This type of file is not allowed for logo',
      });
      expect(checkDeclared('logo', { name: 'a.jpg', mimeType: 'image/png', size: 1 })).toEqual({
        ok: false,
        path: 'name',
        message: 'The file extension does not match its type',
      });
    });

    it('maps stored MIME types back to their kind', () => {
      expect(kindOfMime('image/jpeg')).toBe('jpg');
      expect(kindOfMime('IMAGE/SVG+XML')).toBe('svg');
      expect(kindOfMime('application/x-msdownload')).toBeNull();
    });

    it('reads the tail only for ZIP containers', () => {
      expect(needsTail(zip('[Content_Types].xml'))).toBe(true);
      expect(needsTail(text('%PDF-1.7'))).toBe(false);
      expect(HEAD_BYTES).toBe(65_536);
      expect(TAIL_BYTES).toBe(262_144);
    });

    it('stores the canonical MIME type of a kind', () => {
      expect(mimeTypeOf('jpg')).toBe('image/jpeg');
      expect(mimeTypeOf('docx')).toBe(DOCX);
    });
  });

  describe('names', () => {
    it.each([
      ['report.pdf', 'pdf'],
      ['archive.tar.GZ', 'gz'],
      ['.hidden', ''],
      ['noext', ''],
      ['trailing.', ''],
    ])('extension of %s is %s', (name, ext) => {
      expect(extensionOf(name)).toBe(ext);
    });

    it.each([
      ['../../etc/passwd', 'passwd'],
      ['C:\\Users\\me\\report.pdf', 'report.pdf'],
      ['  spaced.pdf  ', 'spaced.pdf'],
      ['bad\u0000na\u001fme\u007f.pdf', 'badname.pdf'],
      ['folder/', 'file'],
      ['', 'file'],
    ])('safe name of %j is %j', (name, safe) => {
      expect(safeFileName(name)).toBe(safe);
    });

    it('cuts names at 255 characters', () => {
      expect(safeFileName('a'.repeat(300))).toHaveLength(255);
    });
  });

  describe('magic bytes', () => {
    it.each([
      ['pdf', text('%PDF-1.7\n')],
      ['png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)],
      ['jpg', bytes(0xff, 0xd8, 0xff, 0xe0)],
    ])('detects %s', (kind, head) => {
      expect(detectKinds(head)).toEqual([kind]);
    });

    it('detects Office documents from their part names, in the head or the central directory', () => {
      expect(detectKinds(zip('[Content_Types].xml', 'word/document.xml'))).toEqual(['docx']);
      expect(detectKinds(zip('[Content_Types].xml', 'xl/workbook.xml'))).toEqual(['xlsx']);
      expect(detectKinds(zip('[Content_Types].xml', 'ppt/presentation.xml'))).toEqual(['pptx']);
      expect(detectKinds(zip('[Content_Types].xml'), text('word/document.xml'))).toEqual(['docx']);
      expect(detectKinds(zip('word/document.xml'))).toEqual([]);
      expect(detectKinds(zip('[Content_Types].xml', 'other/x.xml'))).toEqual([]);
      expect(officeKind(text('no zip'))).toBeNull();
    });

    it('text matches txt and csv; an SVG document also matches svg', () => {
      expect(detectKinds(text('a,b\n1,2\n'))).toEqual(['txt', 'csv']);
      expect(detectKinds(text('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toEqual(['txt', 'csv', 'svg']);
    });

    it('rejects empty, binary and unknown content', () => {
      expect(detectKinds(new Uint8Array())).toEqual([]);
      expect(detectKinds(bytes(0x4d, 0x5a, 0x90, 0x00))).toEqual([]); // MZ (Windows executable)
      expect(detectKinds(bytes(0x89, 0x50, 0x4e))).toEqual([]); // truncated PNG signature
      expect(detectKinds(text('%PDF'))).toEqual(['txt', 'csv']); // too short for the PDF signature
    });

    it('a renamed executable does not pass as a PDF, nor a PDF as an image', () => {
      expect(contentMatches('pdf', bytes(0x4d, 0x5a, 0x90, 0x00))).toBe(false);
      expect(contentMatches('png', text('%PDF-1.4'))).toBe(false);
      expect(contentMatches('pdf', text('%PDF-1.4'))).toBe(true);
      expect(contentMatches('docx', zip('[Content_Types].xml'), text('word/'))).toBe(true);
    });

    it.each([
      ['plain ascii\twith tab\r\n', true],
      ['form\ffeed', true],
      ['unicode — ✓ ü', true],
      ['nul\u0000byte', false],
      ['bell\u0007', false],
      ['vertical\u000btab', false],
      ['escape\u001b[0m', false],
      ['delete\u007f', false],
    ])('isPlainText(%j) = %s', (s, expected) => {
      expect(isPlainText(text(s))).toBe(expected);
    });

    it('treats invalid UTF-8 as binary but tolerates a character cut at the end', () => {
      expect(isPlainText(bytes(0xc3, 0x28))).toBe(false);
      expect(isPlainText(bytes(0x61, 0xe2, 0x82))).toBe(true);
    });
  });

  describe('SVG', () => {
    it.each([
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      '\uFEFF<?xml version="1.0"?>\n<!-- logo -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x">\n<svg>',
      '  <SVG\nviewBox="0 0 1 1">',
    ])('recognises %j as an SVG document', (s) => {
      expect(isSvgDocument(text(s))).toBe(true);
    });

    it.each(['<html><svg></svg></html>', 'svg', '<svgx>', '<?xml version="1.0"?><root/>'])(
      'does not take %j for an SVG document',
      (s) => {
        expect(isSvgDocument(text(s))).toBe(false);
      },
    );

    it('accepts a plain logo with internal references and embedded raster images', () => {
      const ok =
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
        '<defs><linearGradient id="g"/></defs><rect fill="url(#g)" href=""/>' +
        '<use xlink:href="#g"/><image href="data:image/png;base64,AAAA"/></svg>';
      expect(svgProblem(ok)).toBeNull();
    });

    it.each([
      ['<svg><script>alert(1)</script></svg>', 'script element'],
      ['<svg><script/></svg>', 'script element'],
      ['<svg><foreignObject><div/></foreignObject></svg>', 'foreignObject element'],
      ['<svg><iframe src="#"/></svg>', 'embedded content'],
      ['<svg><embed src="#"/></svg>', 'embedded content'],
      ['<svg><object data="x"></object></svg>', 'embedded content'],
      ['<svg><audio src="#"/></svg>', 'embedded content'],
      ['<svg><video src="#"/></svg>', 'embedded content'],
      ['<!DOCTYPE svg [<!ENTITY x "y">]><svg/>', 'entity declaration'],
      ['<svg onload="alert(1)"/>', 'event handler attribute'],
      ['<svg><a onclick = "x"/></svg>', 'event handler attribute'],
      ['<svg><a href="javascript:alert(1)"/></svg>', 'javascript: URL'],
      ['<svg><style>@import "x.css";</style></svg>', 'CSS import'],
      ['<svg><image href="https://evil.test/p.png"/></svg>', 'external reference'],
      ['<svg><use xlink:href="other.svg#a"/></svg>', 'external reference'],
      ['<svg><image src=evil.png /></svg>', 'external reference'],
      ['<svg><image href="data:image/svg+xml;base64,AA"/></svg>', 'external reference'],
      ['<svg><rect fill="url(https://evil.test/a)"/></svg>', 'external CSS url()'],
      ["<svg><style>a{background:url( 'x.png')}</style></svg>", 'external CSS url()'],
    ])('rejects %j (%s)', (svg, label) => {
      expect(svgProblem(svg)).toBe(label);
    });
  });

  describe('keys, quota, retention, download', () => {
    it('download and upload links live 5 minutes', () => {
      expect(URL_TTL_SECONDS).toBe(300);
    });

    it('builds keys from server ids and moves quarantined objects under their own prefix', () => {
      expect(storageKey('w', 'evidence', 'f', 'v')).toBe('w/evidence/f/v');
      expect(quarantineKey('w/evidence/f/v')).toBe('quarantine/w/evidence/f/v');
    });

    it.each([
      [null, 10 * MB, 1, true],
      [undefined, 10 * MB, 1, true],
      [10, 9 * MB, MB, true],
      [10, 9 * MB, MB + 1, false],
      [0, 0, 1, false],
      [0, 0, 0, true],
    ])('quota %s MB, used %d, adding %d → %s', (limit, used, adding, ok) => {
      expect(withinStorageQuota(limit, used, adding)).toBe(ok);
    });

    it.each([
      [0, 0],
      [1, 1],
      [MB, 1],
      [MB + 1, 2],
    ])('%d bytes are %d MB', (b, mb) => {
      expect(usedMegabytes(b)).toBe(mb);
    });

    it('purges deleted files after 30 days and abandoned uploads after 24 hours', () => {
      const now = new Date('2026-10-31T12:00:00Z');
      expect(purgeDeletedBefore(now).toISOString()).toBe('2026-10-01T12:00:00.000Z');
      expect(abandonedUploadBefore(now).toISOString()).toBe('2026-10-30T12:00:00.000Z');
    });

    it.each([
      ['application/pdf', true],
      ['image/png', true],
      ['image/jpeg', true],
      ['image/svg+xml', false],
      ['text/plain', false],
      [DOCX, false],
    ])('%s previewable: %s', (mime, inline) => {
      expect(isPreviewable(mime)).toBe(inline);
    });

    it('writes an RFC 6266 disposition with an ASCII fallback', () => {
      expect(contentDisposition('report.pdf', true)).toBe(
        `inline; filename="report.pdf"; filename*=UTF-8''report.pdf`,
      );
      expect(contentDisposition('Bericht "Q1" (ü)*.pdf', false)).toBe(
        `attachment; filename="Bericht _Q1_ (_)*.pdf"; filename*=UTF-8''Bericht%20%22Q1%22%20%28%C3%BC%29%2A.pdf`,
      );
      expect(contentDisposition("it's.txt", false)).toBe(
        `attachment; filename="it's.txt"; filename*=UTF-8''it%27s.txt`,
      );
    });
  });
});
