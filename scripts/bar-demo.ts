#!/usr/bin/env -S npx tsx

import { lerp3, CYAN_MAGENTA, TEAL_ORANGE_PINK, ensureXyphContext } from '../src/tui/theme/index.js';
import type { GradientStop } from '../src/tui/theme/index.js';

ensureXyphContext();

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

function printBar(progress: number, total: number, length: number, trackChar: string, stops: GradientStop[]): string {
  const filledFloat = (progress / total) * length;
  const fullBlocks = Math.floor(filledFloat);
  const remainder = filledFloat - fullBlocks;

  let bar = "";

  for (let i = 0; i < length; i++) {
    const t = length > 1 ? i / (length - 1) : 1;
    const [r, g, b] = lerp3(stops, t);

    const colorCode = `\x1b[38;2;${r};${g};${b}m`;

    if (i < fullBlocks) {
      bar += `${colorCode}█`;
    } else if (i === fullBlocks) {
      if (remainder < 0.25) {
        bar += `\x1b[38;2;80;80;80m${trackChar}`;
      } else if (remainder < 0.50) {
        bar += `${colorCode}░`;
      } else if (remainder < 0.75) {
        bar += `${colorCode}▒`;
      } else {
        bar += `${colorCode}▓`;
      }
    } else {
      bar += `\x1b[38;2;80;80;80m${trackChar}`;
    }
  }

  const pct = `${Math.round((progress / total) * 100)}%`.padStart(4);
  return `${pct} ${bar}\x1b[0m`;
}

async function animateBar(trackChar: string, width: number, stops: GradientStop[]): Promise<void> {
  for (let i = 0; i <= 100; i++) {
    process.stdout.write(`\r     ${printBar(i, 100, width, trackChar, stops)}`);
    await sleep(30);
  }
  console.log();
}

async function runDemo(): Promise<void> {
  const samples = [3, 17, 42, 68, 91, 100];
  const width = 50;
  const trackChar = '⠐';

  const gradients: Array<[string, GradientStop[]]> = [
    ['A: cyan → magenta (current)', CYAN_MAGENTA.gradient.brand],
    ['B: teal → orange → pink (candidate)', TEAL_ORANGE_PINK.gradient.brand],
  ];

  for (const [label, stops] of gradients) {
    console.log(`\n  \x1b[1m${label}\x1b[0m\n`);
    for (const p of samples) console.log(printBar(p, 100, width, trackChar, stops));
    console.log();
    await animateBar(trackChar, width, stops);
  }

  console.log();
}

runDemo();
