import { readCookie } from './request-meta';

describe('readCookie', () => {
  it.each([
    [undefined, null],
    ['', null],
    ['a=1; rs_refresh=abc%2Fd; b=2', 'abc/d'],
    ['rs_refresh=first; rs_refresh=second', 'first'],
    ['xrs_refresh=nope', null],
    ['rs_refresh=%E0%A4%A', null],
  ])('%j → %j', (header, value) => {
    expect(readCookie(header, 'rs_refresh')).toBe(value);
  });
});
