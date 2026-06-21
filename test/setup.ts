import path from 'node:path';

process.env['XYPH_TRUST_DIR'] = path.resolve(process.cwd(), 'test/fixtures/trust');
process.env['XYPH_TEST_IN_MEMORY'] = 'true';

