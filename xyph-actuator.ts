#!/usr/bin/env -S npx tsx
import { runActuator } from './src/cli/actuatorEntry.js';

process.exit(await runActuator());
