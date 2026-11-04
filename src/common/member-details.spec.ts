import { execFileSync } from 'node:child_process';

describe('member date calendar preservation', () => {
  it.each(['UTC', 'Asia/Seoul', 'America/Los_Angeles'])(
    'preserves JSON date and legacy input across storage round trips in %s',
    (timezone) => {
      const result = execFileSync(
        process.execPath,
        [
          '-r',
          'ts-node/register',
          '-e',
          `const { parseBirthDate, formatBirthDate } = require('./src/common/member-details');
          const values = ['1998-01-01', '2000-02-29', '1000-01-01', '980101'];
          process.stdout.write(JSON.stringify(values.map(value => {
            const date = parseBirthDate(value);
            const stored = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            return formatBirthDate(stored);
          })));`,
        ],
        {
          cwd: process.cwd(),
          env: { ...process.env, TZ: timezone },
          encoding: 'utf8',
        },
      );
      const output: unknown = JSON.parse(result);
      expect(output).toEqual([
        '1998-01-01',
        '2000-02-29',
        '1000-01-01',
        '1998-01-01',
      ]);
    },
  );
});
