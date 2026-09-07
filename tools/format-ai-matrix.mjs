import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const formatAiMatrix = summary => {
  const percent = (wins, games) => `${(wins / games * 100).toFixed(1)}%`;
  const table = pooled => [
    pooled ? 'Both AIs pooled — faction/placement win rate:' : 'V10 win rate against V9:',
    '', '| Faction | Bottom-left | Upper-right |', '|---|---:|---:|',
    ...['human', 'undead'].map(faction => {
      const values = ['bottom-left', 'upper-right'].map(side => {
        const cells = (pooled ? ['v9', 'v10'] : ['v10']).map(ai => summary.cells[`${ai}/${faction}/${side}`]);
        return percent(cells.reduce((n, c) => n + c.wins, 0), cells.reduce((n, c) => n + c.games, 0));
      });
      return `| ${faction === 'human' ? 'Human' : 'Undead'} | ${values.join(' | ')} |`;
    }),
  ].join('\n');
  return [`${summary.games} matches: V10 ${summary.v10.wins} wins, ${summary.v10.losses} losses, ${summary.v10.draws} draws.`,
    table(false), table(true), '12 games per V10 cell. Fixed-node budgets; Humans always move first.',
    `Replay failures: ${summary.replayFailures}. Reports: ${summary.output}`].join('\n\n');
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Provide a saved summary.json path.');
  console.log(formatAiMatrix(JSON.parse(readFileSync(process.argv[2], 'utf8'))));
}
