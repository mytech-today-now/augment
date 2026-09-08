import chalk from 'chalk';
import {
  getAllCompletedTasks,
  filterTasksByDateRange,
  filterTasksBySearch,
  filterTasksByLabels,
  sortTasks,
  CompletedTask
} from '../utils/beadsCompletedChecker';

interface ShowCompletedOptions {
  since?: string;
  until?: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  limit?: number;
  search?: string;
  taskSearch?: string;
  labels?: string;
  type?: string;
  priority?: number;
  assignee?: string;
  sort?: 'date' | 'title' | 'priority';
  order?: 'asc' | 'desc';
}

/**
 * Format task status with color-coded indicators
 */
function formatStatus(status: string): string {
  switch (status.toLowerCase()) {
    case 'closed':
      return chalk.green('✓ closed');
    case 'in-progress':
      return chalk.yellow('⚙ in-progress');
    case 'open':
      return chalk.blue('○ open');
    case 'blocked':
      return chalk.red('✖ blocked');
    default:
      return chalk.gray(`• ${status}`);
  }
}

/**
 * Format task in bd-style output
 */
function formatTaskBdStyle(task: CompletedTask, verbose: boolean = false): string {
  const lines: string[] = [];

  // Header line with ID and title
  lines.push(chalk.bold.cyan(`${task.id}`) + chalk.gray('  ') + chalk.white(task.title));

  // Status and priority
  const statusLine = [
    formatStatus(task.status),
    task.priority !== undefined ? chalk.gray(`P${task.priority}`) : null,
    task.issue_type ? chalk.gray(`[${task.issue_type}]`) : null
  ].filter(Boolean).join(' ');
  lines.push('  ' + statusLine);

  // Description (if present)
  if (task.description) {
    if (verbose) {
      lines.push('  ' + chalk.gray(task.description));
    } else {
      lines.push('  ' + chalk.gray(task.description.substring(0, 100) + (task.description.length > 100 ? '...' : '')));
    }
  }

  // Dates
  if (task.closed_at) {
    lines.push('  ' + chalk.gray(`Closed: ${new Date(task.closed_at).toLocaleString()}`));
  }

  // Verbose: show created_at and updated_at
  if (verbose) {
    if (task.created_at) {
      lines.push('  ' + chalk.gray(`Created: ${new Date(task.created_at).toLocaleString()}`));
    }
    if (task.updated_at) {
      lines.push('  ' + chalk.gray(`Updated: ${new Date(task.updated_at).toLocaleString()}`));
    }
  }

  // Close reason
  if (task.close_reason) {
    if (verbose) {
      lines.push('  ' + chalk.green(`Reason: ${task.close_reason}`));
    } else {
      lines.push('  ' + chalk.green(`Reason: ${task.close_reason.substring(0, 80)}${task.close_reason.length > 80 ? '...' : ''}`));
    }
  }

  // Labels
  if (task.labels && task.labels.length > 0) {
    lines.push('  ' + chalk.magenta(`Labels: ${task.labels.join(', ')}`));
  }

  // Verbose: show owner and created_by
  if (verbose) {
    if (task.owner) {
      lines.push('  ' + chalk.gray(`Owner: ${task.owner}`));
    }
    if (task.created_by) {
      lines.push('  ' + chalk.gray(`Created by: ${task.created_by}`));
    }
  }

  // Verbose: show dependencies
  if (verbose && task.dependencies && task.dependencies.length > 0) {
    lines.push('  ' + chalk.gray(`Dependencies: ${task.dependencies.length}`));
    task.dependencies.forEach(dep => {
      lines.push('    ' + chalk.gray(`- ${dep.type}: ${dep.depends_on_id}`));
    });
  }

  // Verbose: show comments
  if (verbose && task.comments && task.comments.length > 0) {
    lines.push('  ' + chalk.gray(`Comments: ${task.comments.length}`));
    task.comments.forEach((comment, idx) => {
      lines.push('    ' + chalk.gray(`[${idx + 1}] ${comment.author || 'Unknown'}: ${(comment.text || comment.body || '').substring(0, 60)}...`));
    });
  }

  return lines.join('\n');
}

/**
 * Show completed command handler
 */
export function showCompletedCommand(options: ShowCompletedOptions): void {
  const completedPath = 'scripts/completed.jsonl';
  const beadsDir = '.beads';
  const fs = require('fs');

  // Check if Beads is initialized
  if (!fs.existsSync(beadsDir)) {
    console.log(chalk.yellow('⚠ Beads is not initialized in this project.'));
    console.log(chalk.gray('\nTo use Beads task tracking:'));
    console.log(chalk.cyan('  1. Install Beads CLI:'));
    console.log(chalk.gray('     npm install -g @beads/bd'));
    console.log(chalk.gray('     # or: brew install steveyegge/beads/bd'));
    console.log(chalk.cyan('  2. Initialize Beads:'));
    console.log(chalk.gray('     bd init'));
    console.log(chalk.gray('\nAlternatively, you can work with Beads files manually.'));
    console.log(chalk.gray('See: augx show workflows/beads for more information.'));
    return;
  }

  // Check if completed.jsonl exists
  if (!fs.existsSync(completedPath)) {
    console.log(chalk.yellow('No completed tasks file found.'));
    console.log(chalk.gray('\nThe completed tasks file will be created automatically when you:'));
    console.log(chalk.cyan('  • Run: augx init'));
    console.log(chalk.cyan('  • Close your first task with: bd close <task-id>'));
    console.log(chalk.gray('\nCompleted tasks are stored in: scripts/completed.jsonl'));
    return;
  }

  // Get all completed tasks
  let tasks = getAllCompletedTasks(completedPath);

  if (tasks.length === 0) {
    console.log(chalk.yellow('No completed tasks found.'));
    console.log(chalk.gray('\nCompleted tasks are stored in: scripts/completed.jsonl'));
    console.log(chalk.gray('Close tasks using: bd close <task-id>'));
    return;
  }

  // Filter by date range if specified
  if (options.since || options.until) {
    tasks = filterTasksByDateRange(tasks, options.since, options.until);

    if (tasks.length === 0) {
      console.log(chalk.yellow('No completed tasks found in the specified date range.'));
      return;
    }
  }

  // Filter by search term if specified
  const searchTerm = options.taskSearch ?? options.search;

  if (searchTerm) {
    tasks = filterTasksBySearch(tasks, searchTerm);

    if (tasks.length === 0) {
      console.log(chalk.yellow(`No completed tasks found matching "${searchTerm}".`));
      return;
    }
  }

  // Filter by labels if specified
  if (options.labels) {
    const labelArray = options.labels.split(',').map(l => l.trim());
    tasks = filterTasksByLabels(tasks, labelArray);

    if (tasks.length === 0) {
      console.log(chalk.yellow(`No completed tasks found with labels: ${options.labels}`));
      return;
    }
  }

  // Filter by type if specified
  if (options.type) {
    tasks = tasks.filter(task => task.issue_type === options.type);

    if (tasks.length === 0) {
      console.log(chalk.yellow(`No completed tasks found with type: ${options.type}`));
      return;
    }
  }

  // Filter by priority if specified
  if (options.priority !== undefined) {
    tasks = tasks.filter(task => task.priority === options.priority);

    if (tasks.length === 0) {
      console.log(chalk.yellow(`No completed tasks found with priority: ${options.priority}`));
      return;
    }
  }

  // Filter by assignee if specified
  if (options.assignee) {
    tasks = tasks.filter(task => task.owner === options.assignee);

    if (tasks.length === 0) {
      console.log(chalk.yellow(`No completed tasks found assigned to: ${options.assignee}`));
      return;
    }
  }

  // Sort tasks if specified
  if (options.sort) {
    tasks = sortTasks(tasks, options.sort, options.order || 'desc');
  }

  // Apply limit if specified
  if (options.limit && options.limit > 0) {
    tasks = tasks.slice(0, options.limit);
  }

  // JSON output
  if (options.json) {
    console.log(JSON.stringify(tasks, null, 2));
    return;
  }

  // Quiet mode: only output task IDs
  if (options.quiet) {
    tasks.forEach(task => console.log(task.id));
    return;
  }

  // BD-style formatted output
  console.log(chalk.bold.white(`\nCompleted Tasks (${tasks.length})`));
  console.log(chalk.gray('─'.repeat(60)));
  console.log();

  for (const task of tasks) {
    console.log(formatTaskBdStyle(task, options.verbose));
    console.log();
  }

  // Footer
  console.log(chalk.gray('─'.repeat(60)));
  console.log(chalk.gray(`Total: ${tasks.length} completed task${tasks.length !== 1 ? 's' : ''}`));

  if (options.since || options.until) {
    const rangeInfo = [];
    if (options.since) rangeInfo.push(`since ${options.since}`);
    if (options.until) rangeInfo.push(`until ${options.until}`);
    console.log(chalk.gray(`Filtered: ${rangeInfo.join(' ')}`));
  }

  console.log();
}

