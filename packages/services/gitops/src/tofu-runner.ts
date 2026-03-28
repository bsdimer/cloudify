/**
 * OpenTofu runner — executes plan/apply against tenant repos.
 *
 * Runs OpenTofu CLI commands (init, plan, apply) against a tenant's
 * cloned repo. Captures output for logging and stores plan results.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, rm, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createLogger, type StructuredLogger } from '@cloudify/common';

const execAsync = promisify(exec);

const logger: StructuredLogger = createLogger('TofuRunner');

export interface TofuRunnerConfig {
  /** Path to the tofu binary. Default: 'tofu' */
  binaryPath?: string;
  /** Max execution time in ms. Default: 300000 (5 min) */
  timeoutMs?: number;
  /** Working directory for checkouts. Default: os.tmpdir() */
  workDir?: string;
  /** Extra environment variables for tofu. */
  env?: Record<string, string>;
}

export interface TofuPlanResult {
  success: boolean;
  hasChanges: boolean;
  planOutput: string;
  planFile?: string;
  summary: {
    add: number;
    change: number;
    destroy: number;
  };
  error?: string;
}

export interface TofuApplyResult {
  success: boolean;
  applyOutput: string;
  error?: string;
}

/**
 * Clone a repo, run tofu init, and return the working directory path.
 */
async function prepareWorkDir(
  repoCloneUrl: string,
  config: TofuRunnerConfig,
  credentials?: { username: string; password: string },
): Promise<string> {
  const prefix = join(config.workDir || tmpdir(), 'cloudify-tofu-');
  const workDir = await mkdtemp(prefix);

  // Build clone URL with credentials if provided
  let cloneUrl = repoCloneUrl;
  if (credentials) {
    const url = new URL(repoCloneUrl);
    url.username = credentials.username;
    url.password = credentials.password;
    cloneUrl = url.toString();
  }

  const timeout = config.timeoutMs || 300000;

  logger.info(`Cloning repo to ${workDir}`);
  await execAsync(`git clone --depth 1 ${cloneUrl} .`, {
    cwd: workDir,
    timeout,
  });

  logger.info(`Running tofu init`);
  const tofu = config.binaryPath || 'tofu';
  await execAsync(`${tofu} init -no-color -input=false`, {
    cwd: workDir,
    timeout,
    env: { ...process.env, ...config.env },
  });

  return workDir;
}

/**
 * Run `tofu plan` on a tenant's infrastructure.
 */
export async function tofuPlan(
  repoCloneUrl: string,
  config: TofuRunnerConfig = {},
  credentials?: { username: string; password: string },
  variables?: Record<string, string>,
): Promise<TofuPlanResult> {
  let workDir: string | undefined;

  try {
    workDir = await prepareWorkDir(repoCloneUrl, config, credentials);
    const tofu = config.binaryPath || 'tofu';
    const timeout = config.timeoutMs || 300000;

    // Write tfvars if provided
    if (variables && Object.keys(variables).length > 0) {
      const tfvarsContent = Object.entries(variables)
        .map(([k, v]) => `${k} = "${v}"`)
        .join('\n');
      await writeFile(join(workDir, 'terraform.tfvars'), tfvarsContent);
    }

    const planFile = join(workDir, 'plan.tfplan');

    logger.info('Running tofu plan');
    const { stdout, stderr } = await execAsync(
      `${tofu} plan -no-color -input=false -detailed-exitcode -out=${planFile} 2>&1`,
      {
        cwd: workDir,
        timeout,
        env: { ...process.env, ...config.env },
      },
    ).catch((err) => {
      // Exit code 2 means there are changes
      if (err.code === 2) {
        return { stdout: err.stdout, stderr: err.stderr };
      }
      throw err;
    });

    const planOutput = stdout || stderr;
    const summary = parsePlanSummary(planOutput);

    return {
      success: true,
      hasChanges: summary.add > 0 || summary.change > 0 || summary.destroy > 0,
      planOutput,
      planFile,
      summary,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('tofu plan failed', error);

    return {
      success: false,
      hasChanges: false,
      planOutput: '',
      summary: { add: 0, change: 0, destroy: 0 },
      error: errMsg,
    };
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

/**
 * Run `tofu apply` on a tenant's infrastructure.
 */
export async function tofuApply(
  repoCloneUrl: string,
  config: TofuRunnerConfig = {},
  credentials?: { username: string; password: string },
  variables?: Record<string, string>,
  autoApprove = true,
): Promise<TofuApplyResult> {
  let workDir: string | undefined;

  try {
    workDir = await prepareWorkDir(repoCloneUrl, config, credentials);
    const tofu = config.binaryPath || 'tofu';
    const timeout = config.timeoutMs || 300000;

    // Write tfvars if provided
    if (variables && Object.keys(variables).length > 0) {
      const tfvarsContent = Object.entries(variables)
        .map(([k, v]) => `${k} = "${v}"`)
        .join('\n');
      await writeFile(join(workDir, 'terraform.tfvars'), tfvarsContent);
    }

    const approveFlag = autoApprove ? '-auto-approve' : '';

    logger.info('Running tofu apply');
    const { stdout, stderr } = await execAsync(
      `${tofu} apply -no-color -input=false ${approveFlag} 2>&1`,
      {
        cwd: workDir,
        timeout,
        env: { ...process.env, ...config.env },
      },
    );

    const applyOutput = stdout || stderr;

    return {
      success: true,
      applyOutput,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('tofu apply failed', error);

    return {
      success: false,
      applyOutput: '',
      error: errMsg,
    };
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

/**
 * Parse the plan summary line from tofu plan output.
 * Example: "Plan: 2 to add, 1 to change, 0 to destroy."
 */
function parsePlanSummary(output: string): { add: number; change: number; destroy: number } {
  const match = output.match(/Plan:\s*(\d+)\s*to add,\s*(\d+)\s*to change,\s*(\d+)\s*to destroy/);

  if (match) {
    return {
      add: parseInt(match[1], 10),
      change: parseInt(match[2], 10),
      destroy: parseInt(match[3], 10),
    };
  }

  // "No changes" case
  if (output.includes('No changes')) {
    return { add: 0, change: 0, destroy: 0 };
  }

  return { add: 0, change: 0, destroy: 0 };
}
