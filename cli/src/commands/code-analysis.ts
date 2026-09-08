/**
 * Code Analysis Command
 */

import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeFileComplexity } from '../analysis/complexity-analyzer';
import { analyzeDependencies, detectCircularDependencies } from '../analysis/dependency-analyzer';
import { analyzePatterns } from '../analysis/pattern-analyzer';
import { scanFile } from '../analysis/security-scanner';
import {
  AnalysisIssue,
  AnalysisOptions,
  AnalysisResult,
  DependencyAnalysis,
  FileComplexityAnalysis,
  PatternDetection,
  SecurityVulnerability,
  Severity
} from '../analysis/types';

const SUPPORTED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const SEVERITY_ORDER: Severity[] = ['low', 'medium', 'high', 'critical'];

export async function codeAnalysisCommand(options: AnalysisOptions): Promise<void> {
  try {
    if (!options.file && !options.dir && !options.pattern) {
      console.error(chalk.red('Error: Must specify --file, --dir, or --pattern'));
      process.exit(1);
    }

    const files = await getFilesToAnalyze(options);
    if (files.length === 0) {
      console.log(chalk.yellow('No files found to analyze'));
      return;
    }

    console.log(chalk.blue(`\n🔍 Analyzing ${files.length} file(s)...\n`));
    const result = await performAnalysis(files, options);
    outputResults(result, options);
  } catch (error) {
    console.error(chalk.red(`Error during analysis: ${String(error)}`));
    process.exit(1);
  }
}

async function getFilesToAnalyze(options: AnalysisOptions): Promise<string[]> {
  const files = new Set<string>();

  if (options.file && fs.existsSync(options.file) && fs.statSync(options.file).isFile()) {
    files.add(path.resolve(options.file));
  }

  if (options.dir && fs.existsSync(options.dir) && fs.statSync(options.dir).isDirectory()) {
    for (const file of collectFilesRecursively(path.resolve(options.dir))) {
      files.add(file);
    }
  }

  if (options.pattern) {
    for (const file of resolvePatternFiles(options.pattern)) {
      files.add(file);
    }
  }

  return Array.from(files);
}

async function performAnalysis(files: string[], options: AnalysisOptions): Promise<AnalysisResult> {
  const result: AnalysisResult = {
    summary: {
      filesAnalyzed: files.length,
      issuesFound: 0,
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0
    },
    issues: []
  };

  switch (options.type) {
    case 'complexity':
      result.complexity = analyzeComplexity(files);
      result.issues = complexityToIssues(result.complexity, options.severity);
      break;
    case 'security':
      result.security = analyzeSecurity(files);
      result.issues = securityToIssues(result.security, options.severity);
      break;
    case 'dependencies':
      result.dependencies = analyzeDeps(files);
      result.issues = dependenciesToIssues(result.dependencies, options.severity);
      break;
    case 'patterns':
      result.patterns = analyzePatterns(files);
      result.issues = patternsToIssues(result.patterns, options.severity);
      break;
    case 'quality':
    default:
      result.complexity = analyzeComplexity(files);
      result.security = analyzeSecurity(files);
      result.dependencies = analyzeDeps(files);
      result.issues = [
        ...complexityToIssues(result.complexity, options.severity),
        ...securityToIssues(result.security, options.severity),
        ...dependenciesToIssues(result.dependencies, options.severity)
      ];
      break;
  }

  updateSummary(result);
  return result;
}

function analyzeComplexity(files: string[]): FileComplexityAnalysis[] {
  const results: FileComplexityAnalysis[] = [];

  for (const file of files) {
    try {
      results.push(analyzeFileComplexity(file));
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Failed to analyze ${file}: ${String(error)}`));
    }
  }

  return results;
}

function analyzeSecurity(files: string[]): SecurityVulnerability[] {
  const results: SecurityVulnerability[] = [];

  for (const file of files) {
    try {
      results.push(...scanFile(file));
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Failed to scan ${file}: ${String(error)}`));
    }
  }

  return results;
}

function analyzeDeps(files: string[]): DependencyAnalysis[] {
  const results: DependencyAnalysis[] = [];

  for (const file of files) {
    try {
      results.push(analyzeDependencies(file));
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Failed to analyze dependencies for ${file}: ${String(error)}`));
    }
  }

  const circularDeps = detectCircularDependencies(files);
  if (circularDeps.length > 0 && results.length > 0) {
    results[0].circularDependencies = circularDeps;
  }

  return results;
}

function complexityToIssues(complexity: FileComplexityAnalysis[], minSeverity: Severity): AnalysisIssue[] {
  const minIndex = SEVERITY_ORDER.indexOf(minSeverity);
  const issues: AnalysisIssue[] = [];

  for (const fileAnalysis of complexity) {
    for (const func of fileAnalysis.functions) {
      const severityIndex = SEVERITY_ORDER.indexOf(func.severity);
      if (severityIndex >= minIndex && func.severity !== 'low') {
        issues.push({
          file: fileAnalysis.file,
          line: func.startLine,
          type: 'complexity',
          severity: func.severity,
          message: `Function '${func.name}' has high complexity`,
          recommendation: `Cyclomatic: ${func.cyclomatic}, Cognitive: ${func.cognitive}. Consider refactoring.`
        });
      }
    }
  }

  return issues;
}

function securityToIssues(vulnerabilities: SecurityVulnerability[], minSeverity: Severity): AnalysisIssue[] {
  const minIndex = SEVERITY_ORDER.indexOf(minSeverity);

  return vulnerabilities
    .filter((vulnerability) => SEVERITY_ORDER.indexOf(vulnerability.severity) >= minIndex)
    .map((vulnerability) => ({
      file: vulnerability.file,
      line: vulnerability.line,
      column: vulnerability.column,
      type: vulnerability.type,
      severity: vulnerability.severity,
      message: vulnerability.description,
      recommendation: vulnerability.fix,
      code: vulnerability.cwe
    }));
}

function dependenciesToIssues(dependencies: DependencyAnalysis[], minSeverity: Severity): AnalysisIssue[] {
  const minIndex = SEVERITY_ORDER.indexOf(minSeverity);
  const issues: AnalysisIssue[] = [];

  for (const depAnalysis of dependencies) {
    for (const circular of depAnalysis.circularDependencies) {
      const severityIndex = SEVERITY_ORDER.indexOf(circular.severity);
      if (severityIndex >= minIndex) {
        issues.push({
          file: depAnalysis.file,
          line: 1,
          type: 'circular-dependency',
          severity: circular.severity,
          message: 'Circular dependency detected',
          recommendation: `Cycle: ${circular.cycle.join(' → ')}`
        });
      }
    }
  }

  return issues;
}

function patternsToIssues(patterns: PatternDetection[] | undefined, minSeverity: Severity): AnalysisIssue[] {
  if (!patterns || patterns.length === 0) {
    return [];
  }

  const minIndex = SEVERITY_ORDER.indexOf(minSeverity);
  const patternSeverity: Severity = 'medium';
  const severityIndex = SEVERITY_ORDER.indexOf(patternSeverity);

  if (severityIndex < minIndex) {
    return [];
  }

  return patterns.map((pattern) => ({
    file: pattern.file,
    line: pattern.line,
    type: pattern.type,
    severity: patternSeverity,
    message: pattern.description,
    recommendation: 'Extract the shared logic into a helper function or shared utility.'
  }));
}

function updateSummary(result: AnalysisResult): void {
  result.summary.issuesFound = result.issues.length;

  for (const issue of result.issues) {
    switch (issue.severity) {
      case 'critical':
        result.summary.criticalIssues += 1;
        break;
      case 'high':
        result.summary.highIssues += 1;
        break;
      case 'medium':
        result.summary.mediumIssues += 1;
        break;
      case 'low':
        result.summary.lowIssues += 1;
        break;
    }
  }

  if (result.complexity && result.complexity.length > 0) {
    const totalComplexity = result.complexity.reduce((sum, file) => sum + file.metrics.cyclomatic, 0);
    result.summary.averageComplexity = Math.round(totalComplexity / result.complexity.length);
  }
}

function outputResults(result: AnalysisResult, options: AnalysisOptions): void {
  if (options.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (options.format === 'markdown') {
    outputMarkdown(result);
    return;
  }

  outputText(result);
}

function outputText(result: AnalysisResult): void {
  const { summary, issues } = result;

  console.log(chalk.blue('\n📊 Analysis Summary\n'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`Files Analyzed:    ${summary.filesAnalyzed}`);
  console.log(`Issues Found:      ${summary.issuesFound}`);

  if (summary.criticalIssues > 0) console.log(chalk.red(`  Critical:        ${summary.criticalIssues}`));
  if (summary.highIssues > 0) console.log(chalk.red(`  High:            ${summary.highIssues}`));
  if (summary.mediumIssues > 0) console.log(chalk.yellow(`  Medium:          ${summary.mediumIssues}`));
  if (summary.lowIssues > 0) console.log(chalk.gray(`  Low:             ${summary.lowIssues}`));
  if (summary.averageComplexity !== undefined) console.log(`Average Complexity: ${summary.averageComplexity}`);

  if (issues.length > 0) {
    console.log(chalk.blue('\n🔍 Issues Found\n'));
    console.log(chalk.gray('─'.repeat(50)));

    for (const issue of issues) {
      const severityColor = getSeverityColor(issue.severity);
      const icon = getSeverityIcon(issue.severity);
      console.log(`\n${icon} ${severityColor(issue.severity.toUpperCase())}: ${issue.message}`);
      console.log(chalk.gray(`   File: ${issue.file}:${issue.line}`));
      if (issue.recommendation) console.log(chalk.cyan(`   Fix: ${issue.recommendation}`));
      if (issue.code) console.log(chalk.gray(`   Code: ${issue.code}`));
    }
  }

  console.log(chalk.gray(`\n${'─'.repeat(50)}\n`));
}

function outputMarkdown(result: AnalysisResult): void {
  console.log('# Code Analysis Report\n');
  console.log('## Summary\n');
  console.log(`- **Files Analyzed**: ${result.summary.filesAnalyzed}`);
  console.log(`- **Issues Found**: ${result.summary.issuesFound}`);
  console.log(`  - Critical: ${result.summary.criticalIssues}`);
  console.log(`  - High: ${result.summary.highIssues}`);
  console.log(`  - Medium: ${result.summary.mediumIssues}`);
  console.log(`  - Low: ${result.summary.lowIssues}`);

  if (result.summary.averageComplexity !== undefined) {
    console.log(`- **Average Complexity**: ${result.summary.averageComplexity}`);
  }

  if (result.issues.length > 0) {
    console.log('\n## Issues\n');
    for (const issue of result.issues) {
      console.log(`### ${issue.severity.toUpperCase()}: ${issue.message}\n`);
      console.log(`- **File**: \`${issue.file}:${issue.line}\``);
      if (issue.recommendation) console.log(`- **Fix**: ${issue.recommendation}`);
      if (issue.code) console.log(`- **Code**: ${issue.code}`);
      console.log('');
    }
  }
}

function getSeverityColor(severity: Severity): (text: string) => string {
  switch (severity) {
    case 'critical':
      return chalk.red.bold;
    case 'high':
      return chalk.red;
    case 'medium':
      return chalk.yellow;
    case 'low':
    default:
      return chalk.gray;
  }
}

function getSeverityIcon(severity: Severity): string {
  switch (severity) {
    case 'critical':
      return '🔴';
    case 'high':
      return '🟠';
    case 'medium':
      return '🟡';
    case 'low':
    default:
      return '🟢';
  }
}

function collectFilesRecursively(directory: string): string[] {
  const files: string[] = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFilesRecursively(fullPath));
      continue;
    }

    if (entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function resolvePatternFiles(pattern: string): string[] {
  const normalizedPattern = toPosix(pattern);
  if (!hasWildcard(normalizedPattern)) {
    const resolved = path.resolve(pattern);
    return fs.existsSync(resolved) && fs.statSync(resolved).isFile() ? [resolved] : [];
  }

  const baseDir = resolvePatternBaseDir(normalizedPattern);
  if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
    return [];
  }

  const matcher = globToRegExp(normalizedPattern);
  return collectFilesRecursively(baseDir).filter((file) => matcher.test(toPosix(path.relative(process.cwd(), file))));
}

function resolvePatternBaseDir(pattern: string): string {
  const wildcardIndex = pattern.search(/[*?]/);
  const prefix = wildcardIndex === -1 ? pattern : pattern.slice(0, wildcardIndex);
  const lastSlash = prefix.lastIndexOf('/');
  const base = lastSlash >= 0 ? prefix.slice(0, lastSlash) : '.';
  return path.resolve(base || '.');
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.')
    .replace(/::DOUBLE_STAR::/g, '.*');

  return new RegExp(`^${escaped}$`);
}

function hasWildcard(value: string): boolean {
  return value.includes('*') || value.includes('?');
}

function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}
