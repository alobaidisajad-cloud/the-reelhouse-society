import { escapeCsvCell } from '../csv';

describe('escapeCsvCell', () => {
  it('wraps plain values in double quotes', () => {
    expect(escapeCsvCell('Blade Runner')).toBe('"Blade Runner"');
  });

  it('renders null/undefined as an empty quoted cell', () => {
    expect(escapeCsvCell(null)).toBe('""');
    expect(escapeCsvCell(undefined)).toBe('""');
  });

  it('doubles embedded double-quotes (RFC-4180)', () => {
    expect(escapeCsvCell('The "Best" Film')).toBe('"The ""Best"" Film"');
  });

  it('preserves commas and newlines inside the quoted cell', () => {
    expect(escapeCsvCell('a, b\nc')).toBe('"a, b\nc"');
  });

  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tcmd', '\rcmd'])(
    'neutralizes formula trigger %p with a leading apostrophe',
    (payload) => {
      expect(escapeCsvCell(payload)).toBe(`"'${payload.replace(/"/g, '""')}"`);
    }
  );

  it('neutralizes a HYPERLINK injection payload', () => {
    expect(escapeCsvCell('=HYPERLINK("http://evil","click")')).toBe(
      '"\'=HYPERLINK(""http://evil"",""click"")"'
    );
  });

  it('does not alter values where the trigger char is not first', () => {
    expect(escapeCsvCell('1+1')).toBe('"1+1"');
    expect(escapeCsvCell('film @ home')).toBe('"film @ home"');
  });

  it('stringifies numbers', () => {
    expect(escapeCsvCell(2019)).toBe('"2019"');
  });
});
