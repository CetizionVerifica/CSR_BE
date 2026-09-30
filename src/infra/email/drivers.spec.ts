import { LogEmailAdapter, PostmarkEmailAdapter } from './drivers';
import { maskEmail } from './email.adapter';

const message = { to: 'jane.doe@example.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' };

describe('email drivers', () => {
  it('masks addresses for logs', () => {
    expect(maskEmail('jane.doe@example.com')).toBe('j***@example.com');
  });

  it('log driver records without sending', async () => {
    const driver = new LogEmailAdapter();
    await expect(driver.send(message)).resolves.toEqual({ provider: 'log' });
    expect(driver.sent).toHaveLength(1);
  });

  it('postmark driver posts the message and returns the provider id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ErrorCode: 0, MessageID: 'pm-1' }),
    });
    const driver = new PostmarkEmailAdapter('token', 'ResiliSense <n@resilisense.org>', fetchMock);
    await expect(driver.send({ ...message, stream: 'survey-invite' })).resolves.toEqual({
      provider: 'postmark',
      providerMessageId: 'pm-1',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.postmarkapp.com/email');
    expect(JSON.parse(init.body as string)).toMatchObject({ To: message.to, MessageStream: 'survey-invite' });
  });

  it('postmark driver throws on provider errors without echoing secrets', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ ErrorCode: 300, Message: 'Invalid email request' }),
    });
    const driver = new PostmarkEmailAdapter('secret-token', 'x@y.z', fetchMock);
    await expect(driver.send(message)).rejects.toThrow(/status 422, code 300/);
    await expect(driver.send(message)).rejects.not.toThrow(/secret-token/);
  });
});
