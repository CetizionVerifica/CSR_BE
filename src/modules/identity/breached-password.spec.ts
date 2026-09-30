import { HibpChecker } from './breached-password';

// SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
const response = (body: string, ok = true) =>
  vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 503, text: () => Promise.resolve(body) });

describe('HibpChecker', () => {
  it('sends only the 5-char prefix and matches the suffix', async () => {
    const fetchMock = response(
      '1E4C9B93F3F0682250B6CF8331B7EE68FD8:3861493\r\n0000000000000000000000000000000000A:0',
    );
    await expect(new HibpChecker(fetchMock).isBreached('password')).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.pwnedpasswords.com/range/5BAA6');
    expect(init.headers).toMatchObject({ 'Add-Padding': 'true' });
  });

  it('ignores padding entries with count 0', async () => {
    const fetchMock = response('1E4C9B93F3F0682250B6CF8331B7EE68FD8:0');
    await expect(new HibpChecker(fetchMock).isBreached('password')).resolves.toBe(false);
  });

  it('fails open when the service is unavailable', async () => {
    await expect(new HibpChecker(response('', false)).isBreached('password')).resolves.toBe(false);
    const throwing = vi.fn().mockRejectedValue(new Error('network'));
    await expect(new HibpChecker(throwing).isBreached('password')).resolves.toBe(false);
  });
});
