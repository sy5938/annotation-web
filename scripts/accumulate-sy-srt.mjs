#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const statisticsPattern = /^(\d+)\s*\/\s*(\d+)\s+(\d+(?:\.\d+)?)%$/gmu;

function usage() {
  console.error('用法：node scripts/accumulate-sy-srt.mjs <首段.srt> <后续段.srt> [...]');
  process.exitCode = 1;
}

function readStatistics(srt, file) {
  const statistics = [...srt.matchAll(new RegExp(statisticsPattern.source, statisticsPattern.flags))]
    .map((match) => ({ made: Number(match[1]), attempted: Number(match[2]) }));

  if (statistics.length === 0) {
    throw new Error(`${file} 中没有找到“命中 / 出手 命中率”统计行。`);
  }

  for (const { made, attempted } of statistics) {
    if (made > attempted) {
      throw new Error(`${file} 中存在命中数大于出手数的统计。`);
    }
  }

  return statistics;
}

function outputPath(input) {
  if (!input.endsWith('.srt') || input.endsWith('_累计.srt')) {
    throw new Error(`请输入原始 .srt 文件，而不是累计文件：${input}`);
  }
  return `${input.slice(0, -4)}_累计.srt`;
}

async function main() {
  const inputs = process.argv.slice(2);
  if (inputs.length < 2) {
    usage();
    return;
  }

  const firstSrt = await readFile(inputs[0], 'utf8');
  let cumulative = readStatistics(firstSrt, inputs[0]).at(-1);
  console.log(`基数：${path.basename(inputs[0])}，${cumulative.made} / ${cumulative.attempted}`);

  for (const input of inputs.slice(1)) {
    const srt = await readFile(input, 'utf8');
    const localStatistics = readStatistics(srt, input);
    const updated = srt.replaceAll(statisticsPattern, (_match, made, attempted) => {
      const totalMade = cumulative.made + Number(made);
      const totalAttempted = cumulative.attempted + Number(attempted);
      const percentage = totalAttempted === 0 ? '0.0' : ((totalMade / totalAttempted) * 100).toFixed(1);
      return `${totalMade} / ${totalAttempted} ${percentage}%`;
    });

    const localFinal = localStatistics.at(-1);
    cumulative = {
      made: cumulative.made + localFinal.made,
      attempted: cumulative.attempted + localFinal.attempted,
    };
    const output = outputPath(input);
    await writeFile(output, updated, 'utf8');
    console.log(`已生成：${output}（最终 ${cumulative.made} / ${cumulative.attempted}）`);
  }
}

main().catch((error) => {
  console.error(`失败：${error.message}`);
  process.exitCode = 1;
});
