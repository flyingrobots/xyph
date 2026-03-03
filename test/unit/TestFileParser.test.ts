import { describe, it, expect } from 'vitest';
import { parseTestFile } from '../../src/domain/services/analysis/TestFileParser.js';

describe('TestFileParser', () => {
  it('should extract file name from path', () => {
    const result = parseTestFile('', 'test/unit/Story.test.ts');
    expect(result.fileName).toBe('Story.test.ts');
    expect(result.filePath).toBe('test/unit/Story.test.ts');
  });

  it('should preserve raw content', () => {
    const content = 'const x = 1;';
    const result = parseTestFile(content, 'test.ts');
    expect(result.content).toBe(content);
  });

  it('should extract named imports', () => {
    const content = `
import { Story, StoryProps } from '../../src/domain/entities/Story.js';
import { scanAnnotations } from '../../src/domain/services/TraceabilityScan.js';
`;
    const result = parseTestFile(content, 'test.ts');
    expect(result.imports).toHaveLength(2);
    expect(result.imports[0]?.moduleSpecifier).toBe('../../src/domain/entities/Story.js');
    expect(result.imports[0]?.namedImports).toEqual(['Story', 'StoryProps']);
    expect(result.imports[1]?.namedImports).toEqual(['scanAnnotations']);
  });

  it('should extract default imports', () => {
    const content = `import WarpGraph from '@git-stunts/git-warp';`;
    const result = parseTestFile(content, 'test.ts');
    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]?.defaultImport).toBe('WarpGraph');
  });

  it('should extract describe blocks with description', () => {
    const content = `
describe('Story Entity', () => {
  it('should create a valid story', () => {});
});
`;
    const result = parseTestFile(content, 'test.ts');
    expect(result.describeBlocks).toHaveLength(1);
    expect(result.describeBlocks[0]?.description).toBe('Story Entity');
  });

  it('should extract it blocks inside describe', () => {
    const content = `
describe('Story Entity', () => {
  it('should create a valid story', () => {
    const s = new Story(props);
  });
  it('should reject invalid id', () => {});
});
`;
    const result = parseTestFile(content, 'test.ts');
    expect(result.describeBlocks[0]?.itBlocks).toHaveLength(2);
    expect(result.describeBlocks[0]?.itBlocks[0]?.description).toBe('should create a valid story');
    expect(result.describeBlocks[0]?.itBlocks[1]?.description).toBe('should reject invalid id');
  });

  it('should extract nested describe blocks', () => {
    const content = `
describe('outer', () => {
  describe('inner', () => {
    it('test', () => {});
  });
});
`;
    const result = parseTestFile(content, 'test.ts');
    expect(result.describeBlocks).toHaveLength(1);
    expect(result.describeBlocks[0]?.children).toHaveLength(1);
    expect(result.describeBlocks[0]?.children[0]?.description).toBe('inner');
    expect(result.describeBlocks[0]?.children[0]?.itBlocks).toHaveLength(1);
  });

  it('should extract top-level it blocks (no describe wrapper)', () => {
    const content = `
test('standalone test', () => {});
it('another standalone', () => {});
`;
    const result = parseTestFile(content, 'test.ts');
    expect(result.itBlocks).toHaveLength(2);
    expect(result.itBlocks[0]?.description).toBe('standalone test');
    expect(result.itBlocks[1]?.description).toBe('another standalone');
  });

  it('should extract function calls from test body', () => {
    const content = `
describe('test', () => {
  it('should compute', () => {
    const result = computeFrontier(tasks, edges);
    validateResult(result);
  });
});
`;
    const result = parseTestFile(content, 'test.ts');
    const itBlock = result.describeBlocks[0]?.itBlocks[0];
    expect(itBlock?.calledFunctions).toContain('computeFrontier');
    expect(itBlock?.calledFunctions).toContain('validateResult');
  });

  it('should extract method calls from test body', () => {
    const content = `
describe('test', () => {
  it('should query graph', () => {
    const nodes = graph.getNodes();
    const props = graph.getNodeProps('task:A');
  });
});
`;
    const result = parseTestFile(content, 'test.ts');
    const itBlock = result.describeBlocks[0]?.itBlocks[0];
    expect(itBlock?.calledMethods).toContain('getNodes');
    expect(itBlock?.calledMethods).toContain('getNodeProps');
  });

  it('should not include test framework calls in calledFunctions', () => {
    const content = `
describe('test', () => {
  it('should work', () => {
    expect(true).toBe(true);
  });
});
`;
    const result = parseTestFile(content, 'test.ts');
    const itBlock = result.describeBlocks[0]?.itBlocks[0];
    expect(itBlock?.calledFunctions).not.toContain('expect');
  });

  it('should handle empty file', () => {
    const result = parseTestFile('', 'test.ts');
    expect(result.imports).toHaveLength(0);
    expect(result.describeBlocks).toHaveLength(0);
    expect(result.itBlocks).toHaveLength(0);
  });

  it('should extract line numbers for describe and it blocks', () => {
    const content = `describe('test', () => {
  it('first', () => {});
  it('second', () => {});
});`;
    const result = parseTestFile(content, 'test.ts');
    expect(result.describeBlocks[0]?.lineNumber).toBe(1);
    expect(result.describeBlocks[0]?.itBlocks[0]?.lineNumber).toBe(2);
    expect(result.describeBlocks[0]?.itBlocks[1]?.lineNumber).toBe(3);
  });

  it('should handle type-only imports by including them', () => {
    const content = `import type { QuestStatus } from '../../src/domain/entities/Quest.js';`;
    const result = parseTestFile(content, 'test.ts');
    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]?.namedImports).toEqual(['QuestStatus']);
  });
});
