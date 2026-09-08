/**
 * Pattern Analyzer Module
 */

import chalk from 'chalk';
import { parseFile, traverseAST } from './ast-parser';
import { ASTNode, PatternDetection } from './types';

interface PatternSample {
  file: string;
  line: number;
  pattern: string;
}

const FUNCTION_NODE_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const DUPLICATE_FUNCTION_BODY_PATTERN = 'duplicate-function-body';

export function analyzePatterns(files: string[]): PatternDetection[] {
  const samples: PatternSample[] = [];

  for (const file of files) {
    try {
      const { ast, sourceCode } = parseFile(file);
      samples.push(...collectPatternSamples(ast, file, sourceCode));
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Failed to analyze patterns for ${file}: ${String(error)}`));
    }
  }

  return findDuplicateFunctionBodies(samples);
}

function collectPatternSamples(ast: ASTNode, file: string, sourceCode: string): PatternSample[] {
  const samples: PatternSample[] = [];

  traverseAST(ast, {
    enter: (node) => {
      if (!FUNCTION_NODE_TYPES.has(node.type)) {
        return;
      }

      const body = getFunctionBodyText(node, sourceCode);
      if (!body) {
        return;
      }

      samples.push({
        file,
        line: node.loc?.start.line ?? 0,
        pattern: normalizePatternSource(body)
      });
    }
  });

  return samples;
}

function findDuplicateFunctionBodies(samples: PatternSample[]): PatternDetection[] {
  const grouped = new Map<string, PatternSample[]>();

  for (const sample of samples) {
    const bucket = grouped.get(sample.pattern) ?? [];
    bucket.push(sample);
    grouped.set(sample.pattern, bucket);
  }

  const detections: PatternDetection[] = [];

  for (const bucket of grouped.values()) {
    if (bucket.length < 2) {
      continue;
    }

    const [firstSample, ...duplicateSamples] = bucket;

    for (const duplicate of duplicateSamples) {
      detections.push({
        file: duplicate.file,
        pattern: DUPLICATE_FUNCTION_BODY_PATTERN,
        type: 'anti-pattern',
        line: duplicate.line,
        description: `Repeated function body matches ${firstSample.file}:${firstSample.line}`
      });
    }
  }

  return detections;
}

function getFunctionBodyText(node: ASTNode, sourceCode: string): string {
  const body = node.body;
  const range = getRange(body);

  if (!range) {
    return '';
  }

  return sourceCode.slice(range[0], range[1]).trim();
}

function getRange(node: unknown): [number, number] | null {
  if (!isAstNode(node)) {
    return null;
  }

  const range = node.range;
  if (!Array.isArray(range) || range.length !== 2) {
    return null;
  }

  const [start, end] = range;
  if (typeof start !== 'number' || typeof end !== 'number') {
    return null;
  }

  return [start, end];
}

function normalizePatternSource(source: string): string {
  return source.replace(/\s+/g, ' ').trim();
}

function isAstNode(value: unknown): value is ASTNode {
  return typeof value === 'object' && value !== null && typeof (value as ASTNode).type === 'string';
}
