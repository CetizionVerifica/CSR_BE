import { checkPasswordPolicy } from './password-policy';

describe('password policy (US-01-1)', () => {
  it.each([
    ['', ['too_short']],
    ['Sh0rt!pass', ['too_short']],
    ['elevenchars', ['too_short']],
    ['x'.repeat(257), ['too_long']],
    ['passwordpassword', ['too_weak']],
    ['123456789012', ['too_weak']],
    ['qwertyuiopas', ['too_weak']],
    ['correct horse battery staple', []],
    ['vX9#mQ2!pL7$wR4', []],
  ])('%j → %j', (password, issues) => {
    expect(checkPasswordPolicy(password)).toEqual(issues);
  });

  it('counts code points, not UTF-16 units', () => {
    expect(checkPasswordPolicy('🔒'.repeat(11))).toEqual(['too_short']);
  });

  it('rejects passwords built from the user details', () => {
    const inputs = ['jane.fairweather@acme-industries.com', 'Jane Fairweather'];
    expect(checkPasswordPolicy('fairweather-acme')).toEqual([]);
    expect(checkPasswordPolicy('fairweather-acme', inputs)).toEqual(['too_weak']);
  });
});
