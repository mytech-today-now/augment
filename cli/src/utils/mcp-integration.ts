/**
 * MCP Integration Utilities
 * 
 * Provides integration with Model Context Protocol (MCP) servers
 * using mcporter-inspired patterns for CLI wrapping.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn, type ChildProcess } from 'child_process';

export const SUPPORTED_MCP_TRANSPORT = 'stdio' as const;
export type MCPTransport = typeof SUPPORTED_MCP_TRANSPORT;
export const UNSUPPORTED_MCP_TRANSPORT_MESSAGE =
  'HTTP transport is not yet supported, use stdio';

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  transport: MCPTransport;
  url?: string;
  env?: Record<string, string>;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

export interface MCPServerInfo {
  config: MCPServerConfig;
  tools: MCPTool[];
  connected: boolean;
}

export interface MCPWrapperTarget {
  category: string;
  skillId: string;
  skillsDir: string;
  outputPath: string;
}

export interface MCPProcessOptions {
  timeoutMs?: number;
  outputLimitChars?: number;
  killGraceMs?: number;
}

const DEFAULT_MCP_PROCESS_TIMEOUT_MS = 10_000;
const DEFAULT_MCP_OUTPUT_LIMIT_CHARS = 64 * 1024;
const DEFAULT_MCP_KILL_GRACE_MS = 1_000;
const MCP_JSONRPC_VERSION = '2.0';
const MCP_JSONRPC_REQUEST_ID = 1;

interface CapturedStream {
  text: string;
  totalChars: number;
  truncated: boolean;
}

interface ResolvedMCPProcessOptions {
  timeoutMs: number;
  outputLimitChars: number;
  killGraceMs: number;
}

type MCPLineInterpretation<T> =
  | {
      kind: 'ignore';
    }
  | {
      kind: 'match';
      value: T;
    }
  | {
      kind: 'error';
      message: string;
    };

const MCP_WRAPPER_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function normalizeMCPWrapperSegment(
  segment: string,
  fieldName: 'category' | 'skill id'
): string {
  const normalized = segment.trim();

  if (normalized.length === 0) {
    throw new Error(`Invalid MCP wrapper ${fieldName}: value is empty`);
  }

  if (!MCP_WRAPPER_SEGMENT_PATTERN.test(normalized)) {
    throw new Error(
      `Invalid MCP wrapper ${fieldName}: "${segment}" must be a simple slug without path separators or whitespace`
    );
  }

  return normalized;
}

function isPathWithinRoot(rootPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);
  return (
    relativePath.length === 0 ||
    (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  );
}

function resolveMCPProcessOptions(options: MCPProcessOptions = {}): ResolvedMCPProcessOptions {
  return {
    timeoutMs: Math.max(0, options.timeoutMs ?? DEFAULT_MCP_PROCESS_TIMEOUT_MS),
    outputLimitChars: Math.max(0, options.outputLimitChars ?? DEFAULT_MCP_OUTPUT_LIMIT_CHARS),
    killGraceMs: Math.max(0, options.killGraceMs ?? DEFAULT_MCP_KILL_GRACE_MS)
  };
}

function createCapturedStream(): CapturedStream {
  return {
    text: '',
    totalChars: 0,
    truncated: false
  };
}

function appendCapturedStream(
  capture: CapturedStream,
  chunk: string,
  limitChars: number
): void {
  capture.totalChars += chunk.length;

  if (limitChars <= 0) {
    capture.text = '';
    capture.truncated = capture.totalChars > 0;
    return;
  }

  if (capture.text.length + chunk.length <= limitChars) {
    capture.text += chunk;
    return;
  }

  capture.truncated = true;
  capture.text = (capture.text + chunk).slice(-limitChars);
}

function formatCapturedStream(
  label: string,
  capture: CapturedStream,
  limitChars: number
): string {
  if (capture.totalChars === 0) {
    return `${label}: <empty>`;
  }

  if (!capture.truncated) {
    return `${label}: ${capture.text}`;
  }

  return `${label} (truncated to last ${Math.min(capture.text.length, limitChars)} chars of ${capture.totalChars}): ${capture.text}`;
}

function formatMCPCommandTarget(serverName: string, toolName: string): string {
  return `${serverName}/${toolName}`;
}

function createMCPProcessError(
  serverName: string,
  toolName: string,
  summary: string,
  details: string[] = []
): Error {
  const lines = [`MCP ${formatMCPCommandTarget(serverName, toolName)} ${summary}`];

  for (const detail of details) {
    if (detail) {
      lines.push(detail);
    }
  }

  return new Error(lines.join('\n'));
}

function parseJsonLine(line: string): any | null {
  const trimmed = line.trim();

  if (trimmed.length === 0) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function buildStdoutStderrDetails(
  stdout: CapturedStream,
  stderr: CapturedStream,
  outputLimitChars: number
): string[] {
  return [
    formatCapturedStream('Stdout', stdout, outputLimitChars),
    formatCapturedStream('Stderr', stderr, outputLimitChars)
  ];
}

function interpretMCPExecLine(
  parsed: any
): MCPLineInterpretation<any> {
  if (parsed?.jsonrpc !== MCP_JSONRPC_VERSION || parsed?.id !== MCP_JSONRPC_REQUEST_ID) {
    return { kind: 'ignore' };
  }

  if (parsed.error) {
    return {
      kind: 'error',
      message: `returned a JSON-RPC error: ${parsed.error.message || JSON.stringify(parsed.error)}`
    };
  }

  if (parsed.result === undefined) {
    return {
      kind: 'error',
      message: 'returned malformed JSON-RPC output: expected a result payload'
    };
  }

  return {
    kind: 'match',
    value: parsed.result || parsed
  };
}

function interpretMCPDiscoverLine(
  parsed: any
): MCPLineInterpretation<MCPTool[]> {
  if (parsed?.jsonrpc !== MCP_JSONRPC_VERSION || parsed?.id !== MCP_JSONRPC_REQUEST_ID) {
    return { kind: 'ignore' };
  }

  if (parsed.error) {
    return {
      kind: 'error',
      message: `returned a JSON-RPC error: ${parsed.error.message || JSON.stringify(parsed.error)}`
    };
  }

  const tools = parsed.result?.tools;

  if (!Array.isArray(tools)) {
    return {
      kind: 'error',
      message: 'returned malformed JSON-RPC output: expected a tools array'
    };
  }

  return {
    kind: 'match',
    value: tools.map((tool: any) => ({
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema || {}
    }))
  };
}

async function runMCPJSONRPCRequest<T>(
  serverName: string,
  toolName: string,
  request: Record<string, unknown>,
  repoRoot: string | undefined,
  interpretLine: (parsed: any) => MCPLineInterpretation<T>,
  processOptions: MCPProcessOptions = {},
  resolveMissingResponse?: () => T
): Promise<T> {
  const configs = loadMCPConfigs(repoRoot);
  const config = configs.find(c => c.name === serverName);

  if (!config) {
    throw new Error(`MCP server not found: ${serverName}`);
  }

  if (config.transport !== SUPPORTED_MCP_TRANSPORT) {
    throw new Error(UNSUPPORTED_MCP_TRANSPORT_MESSAGE);
  }

  const limits = resolveMCPProcessOptions(processOptions);

  return new Promise((resolve, reject) => {
    let child: ChildProcess;

    try {
      child = spawn(config.command, config.args || [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...config.env }
      });
    } catch (error) {
      reject(new Error(`Failed to spawn MCP server: ${error instanceof Error ? error.message : String(error)}`));
      return;
    }

    let stdout = createCapturedStream();
    let stderr = createCapturedStream();
    let stdoutLineBuffer = '';
    let settled = false;
    let exited = false;
    let timeoutTimer: NodeJS.Timeout | null = null;
    let forceKillTimer: NodeJS.Timeout | null = null;
    let matchedValue: T | null = null;

    const cleanup = (): void => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }

      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
        forceKillTimer = null;
      }

      child.stdout?.off('data', onStdoutData);
      child.stderr?.off('data', onStderrData);
      child.off('error', onError);
      child.off('close', onClose);
    };

    const settleResolve = (value: T): void => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(value);
    };

    const settleReject = (error: Error): void => {
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    };

    const requestTermination = (): void => {
      if (forceKillTimer) {
        return;
      }

      try {
        child.kill('SIGTERM');
      } catch {
        // Best effort only; the follow-up timer will try again.
      }

      forceKillTimer = setTimeout(() => {
        forceKillTimer = null;

        if (!exited) {
          try {
            child.kill('SIGKILL');
          } catch {
            // Best effort only.
          }
        }

        cleanup();
      }, limits.killGraceMs);
    };

    const onStdoutLine = (line: string): void => {
      if (settled || matchedValue !== null) {
        return;
      }

      const parsed = parseJsonLine(line);

      if (parsed === null) {
        return;
      }

      const interpretation = interpretLine(parsed);

      if (interpretation.kind === 'ignore') {
        return;
      }

      if (interpretation.kind === 'match') {
        matchedValue = interpretation.value;
        return;
      }

      requestTermination();
      settleReject(
        createMCPProcessError(
          serverName,
          toolName,
          interpretation.message,
          buildStdoutStderrDetails(stdout, stderr, limits.outputLimitChars)
        )
      );
    };

    const onStdoutData = (data: Buffer | string): void => {
      const chunk = Buffer.isBuffer(data) ? data.toString('utf8') : data;

      appendCapturedStream(stdout, chunk, limits.outputLimitChars);

      stdoutLineBuffer += chunk;
      if (stdoutLineBuffer.length > limits.outputLimitChars) {
        stdoutLineBuffer = stdoutLineBuffer.slice(-limits.outputLimitChars);
      }

      let newlineIndex = stdoutLineBuffer.indexOf('\n');
      while (newlineIndex !== -1 && !settled) {
        const line = stdoutLineBuffer.slice(0, newlineIndex);
        stdoutLineBuffer = stdoutLineBuffer.slice(newlineIndex + 1);
        onStdoutLine(line);
        newlineIndex = stdoutLineBuffer.indexOf('\n');
      }
    };

    const onStderrData = (data: Buffer | string): void => {
      const chunk = Buffer.isBuffer(data) ? data.toString('utf8') : data;
      appendCapturedStream(stderr, chunk, limits.outputLimitChars);
    };

    const onError = (error: Error): void => {
      if (settled) {
        cleanup();
        return;
      }

      cleanup();
      reject(new Error(`Failed to spawn MCP server: ${error.message}`));
    };

    const onClose = (code: number | null, signal: NodeJS.Signals | null): void => {
      exited = true;

      if (settled) {
        cleanup();
        return;
      }

      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }

      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
        forceKillTimer = null;
      }

      if (signal) {
        settleReject(
          createMCPProcessError(
            serverName,
            toolName,
            `terminated by signal ${signal}`,
            buildStdoutStderrDetails(stdout, stderr, limits.outputLimitChars)
          )
        );
        cleanup();
        return;
      }

      if (code !== 0) {
        settleReject(
          createMCPProcessError(
            serverName,
            toolName,
            `exited with code ${code ?? 'unknown'}`,
            buildStdoutStderrDetails(stdout, stderr, limits.outputLimitChars)
          )
        );
        cleanup();
        return;
      }

      if (matchedValue !== null) {
        settleResolve(matchedValue);
        return;
      }

      if (resolveMissingResponse) {
        settleResolve(resolveMissingResponse());
        return;
      }

      settleReject(
        createMCPProcessError(
          serverName,
          toolName,
          'completed without a valid JSON-RPC response',
          buildStdoutStderrDetails(stdout, stderr, limits.outputLimitChars)
        )
      );
      cleanup();
    };

    timeoutTimer = setTimeout(() => {
      if (settled || exited) {
        return;
      }

      requestTermination();
      settleReject(
        createMCPProcessError(
          serverName,
          toolName,
          `timed out after ${limits.timeoutMs}ms`,
          buildStdoutStderrDetails(stdout, stderr, limits.outputLimitChars)
        )
      );
    }, limits.timeoutMs);

    child.stdout?.on('data', onStdoutData);
    child.stderr?.on('data', onStderrData);
    child.on('error', onError);
    child.on('close', onClose);

    try {
      child.stdin?.write(JSON.stringify(request) + '\n');
      child.stdin?.end();
    } catch (error) {
      cleanup();
      reject(
        new Error(
          `Failed to write MCP request for ${formatMCPCommandTarget(serverName, toolName)}: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      );
    }
  });
}

/**
 * Resolve the target path for an MCP skill wrapper.
 *
 * The category and skill ID must be simple slugs. The returned path is always
 * anchored beneath `skills/<category>`.
 */
export function resolveMCPWrapperTarget(
  category: string,
  skillId: string,
  repoRoot: string = process.cwd()
): MCPWrapperTarget {
  const rootPath = path.resolve(repoRoot);
  const safeCategory = normalizeMCPWrapperSegment(category, 'category');
  const safeSkillId = normalizeMCPWrapperSegment(skillId, 'skill id');
  const skillsDir = path.join(rootPath, 'skills', safeCategory);
  const outputPath = path.join(skillsDir, `${safeSkillId}.md`);

  if (!isPathWithinRoot(skillsDir, outputPath)) {
    throw new Error(
      `Invalid MCP wrapper path: ${outputPath} escapes the skills/${safeCategory} directory`
    );
  }

  return {
    category: safeCategory,
    skillId: safeSkillId,
    skillsDir,
    outputPath
  };
}

/**
 * Get MCP configuration directory
 */
export function getMCPConfigDir(repoRoot?: string): string {
  const root = repoRoot || process.cwd();
  return path.join(root, '.augment', 'mcp');
}

/**
 * Load MCP server configurations
 */
export function loadMCPConfigs(repoRoot?: string): MCPServerConfig[] {
  const configDir = getMCPConfigDir(repoRoot);
  const configFile = path.join(configDir, 'servers.json');

  if (!fs.existsSync(configFile)) {
    return [];
  }

  try {
    const content = fs.readFileSync(configFile, 'utf-8');
    const config = JSON.parse(content);
    return config.servers || [];
  } catch (error) {
    console.warn(`Failed to load MCP configs: ${error}`);
    return [];
  }
}

/**
 * Save MCP server configurations
 */
export function saveMCPConfigs(configs: MCPServerConfig[], repoRoot?: string): void {
  const configDir = getMCPConfigDir(repoRoot);
  const configFile = path.join(configDir, 'servers.json');

  // Ensure directory exists
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(
    configFile,
    JSON.stringify({ servers: configs }, null, 2),
    'utf-8'
  );
}

/**
 * Add MCP server configuration
 */
export function addMCPServer(config: MCPServerConfig, repoRoot?: string): void {
  if (config.transport !== SUPPORTED_MCP_TRANSPORT) {
    throw new Error(UNSUPPORTED_MCP_TRANSPORT_MESSAGE);
  }

  const configs = loadMCPConfigs(repoRoot);
  
  // Check if server already exists
  const existing = configs.findIndex(c => c.name === config.name);
  if (existing >= 0) {
    configs[existing] = config;
  } else {
    configs.push(config);
  }

  saveMCPConfigs(configs, repoRoot);
}

/**
 * Remove MCP server configuration
 */
export function removeMCPServer(name: string, repoRoot?: string): boolean {
  const configs = loadMCPConfigs(repoRoot);
  const filtered = configs.filter(c => c.name !== name);
  
  if (filtered.length === configs.length) {
    return false; // Server not found
  }

  saveMCPConfigs(filtered, repoRoot);
  return true;
}

/**
 * Execute MCP server command (stdio transport)
 */
export function executeMCPCommand(
  serverName: string,
  toolName: string,
  args: any,
  repoRoot?: string,
  options: MCPProcessOptions = {}
): Promise<any> {
  const request = {
    jsonrpc: MCP_JSONRPC_VERSION,
    id: MCP_JSONRPC_REQUEST_ID,
    method: `tools/${toolName}`,
    params: args
  };

  return runMCPJSONRPCRequest(
    serverName,
    toolName,
    request,
    repoRoot,
    interpretMCPExecLine,
    options
  );
}

/**
 * Generate CLI wrapper for MCP server
 *
 * This creates a skill file that wraps an MCP server tool as a CLI command.
 */
export function generateMCPSkillWrapper(
  serverName: string,
  toolName: string,
  skillId: string,
  category: string,
  repoRoot?: string
): string {
  const configs = loadMCPConfigs(repoRoot);
  const config = configs.find(c => c.name === serverName);

  if (!config) {
    throw new Error(`MCP server not found: ${serverName}`);
  }

  // Generate skill file content
  const skillContent = `---
id: ${skillId}
name: ${toolName} (MCP)
version: 1.0.0
category: ${category}
tags: [mcp, ${serverName}, ${toolName}]
tokenBudget: 1500
priority: medium
dependencies: []
cliCommand: augx mcp exec ${serverName} ${toolName}
mcpServer: ${serverName}
autoLoad: false
---

# ${toolName} (MCP Tool)

## Purpose

This skill wraps the \`${toolName}\` tool from the \`${serverName}\` MCP server.

## Usage

Execute this skill using the MCP integration:

\`\`\`bash
augx mcp exec ${serverName} ${toolName} --args '{"key": "value"}'
\`\`\`

Or inject into context:

\`\`\`bash
augx skill inject ${skillId}
\`\`\`

## MCP Server Configuration

- **Server**: ${serverName}
- **Transport**: ${config.transport}
- **Command**: ${config.command}

## Notes

This is an auto-generated skill wrapper for an MCP server tool.
The actual tool execution is handled by the MCP integration layer.
`;

  return skillContent;
}

/**
 * Discover available MCP tools from a server
 *
 * Connects to the MCP server and retrieves the list of available tools.
 */
export async function discoverMCPTools(
  serverName: string,
  repoRoot?: string,
  options: MCPProcessOptions = {}
): Promise<MCPTool[]> {
  const request = {
    jsonrpc: MCP_JSONRPC_VERSION,
    id: MCP_JSONRPC_REQUEST_ID,
    method: 'tools/list',
    params: {}
  };

  return runMCPJSONRPCRequest(
    serverName,
    'tools/list',
    request,
    repoRoot,
    interpretMCPDiscoverLine,
    options,
    () => []
  );
}

/**
 * Check if mcporter is available
 */
export function isMCPorterAvailable(): boolean {
  try {
    const { execSync } = require('child_process');
    execSync('npx mcporter --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate CLI using mcporter (if available)
 */
export async function generateCLIWithMCPorter(
  serverCommand: string,
  outputPath: string
): Promise<void> {
  const { spawn } = require('child_process');

  return new Promise((resolve, reject) => {
    const child = spawn('npx', [
      'mcporter',
      'generate-cli',
      '--command',
      serverCommand,
      '--bundle',
      outputPath
    ], {
      stdio: 'inherit'
    });

    child.on('error', (error: Error) => {
      reject(new Error(`Failed to run mcporter: ${error.message}`));
    });

    child.on('exit', (code: number) => {
      if (code !== 0) {
        reject(new Error(`mcporter exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

