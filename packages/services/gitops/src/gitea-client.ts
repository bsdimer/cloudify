/**
 * Gitea/Forgejo REST API client — typed wrapper for tenant repo management.
 *
 * This client handles:
 * - Organization/user management
 * - Repository CRUD
 * - File operations (create, update, delete)
 * - Repository lifecycle (archive, delete)
 */

import { createLogger, retry, RetryPresets } from '@cloudify/common';

const logger = createLogger('GiteaClient');

export interface GiteaConfig {
  baseUrl: string;
  token: string;
  /** Org that owns all tenant repos. Default: 'cloudify' */
  organization?: string;
}

export interface GiteaRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  clone_url: string;
  default_branch: string;
  archived: boolean;
  empty: boolean;
}

export interface GiteaFileContent {
  path: string;
  content: string; // base64 encoded
  sha: string;
}

export interface CreateRepoOptions {
  name: string;
  description?: string;
  private_repo?: boolean;
  auto_init?: boolean;
  default_branch?: string;
}

export interface CreateFileOptions {
  content: string; // base64 encoded
  message: string;
  branch?: string;
}

export class GiteaClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly org: string;

  constructor(config: GiteaConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.token = config.token;
    this.org = config.organization || 'cloudify';
  }

  // ── HTTP helpers ──

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;

    const response = await retry(
      async () => {
        const resp = await fetch(url, {
          method,
          headers: {
            Authorization: `token ${this.token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
        });

        if (!resp.ok) {
          const text = await resp.text();
          const err = new Error(`Gitea API error: ${resp.status} ${resp.statusText} — ${text}`);
          (err as unknown as Record<string, unknown>).statusCode = resp.status;
          throw err;
        }

        // 204 No Content
        if (resp.status === 204) return {} as T;

        return (await resp.json()) as T;
      },
      {
        ...RetryPresets.quick,
        retryIf: (err) => {
          const code = (err as Record<string, unknown>).statusCode as number;
          return code >= 500 || code === 429;
        },
      },
    );

    return response;
  }

  // ── Organization ──

  /**
   * Ensure the Cloudify org exists in Gitea.
   */
  async ensureOrganization(): Promise<void> {
    try {
      await this.request('GET', `/orgs/${this.org}`);
    } catch {
      logger.info(`Creating organization: ${this.org}`);
      await this.request('POST', '/orgs', {
        username: this.org,
        full_name: 'Cloudify',
        description: 'Cloudify tenant infrastructure repositories',
        visibility: 'private',
      });
    }
  }

  // ── Repository Management ──

  /**
   * Create a new repository under the Cloudify organization.
   */
  async createRepo(options: CreateRepoOptions): Promise<GiteaRepo> {
    logger.info(`Creating repo: ${this.org}/${options.name}`);

    return this.request<GiteaRepo>(`POST`, `/orgs/${this.org}/repos`, {
      name: options.name,
      description: options.description || `Tenant infrastructure for ${options.name}`,
      private: options.private_repo ?? true,
      auto_init: options.auto_init ?? true,
      default_branch: options.default_branch || 'main',
    });
  }

  /**
   * Get a repository by name.
   */
  async getRepo(name: string): Promise<GiteaRepo> {
    return this.request<GiteaRepo>('GET', `/repos/${this.org}/${name}`);
  }

  /**
   * Check if a repository exists.
   */
  async repoExists(name: string): Promise<boolean> {
    try {
      await this.getRepo(name);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Archive a repository (soft delete — preserves history).
   */
  async archiveRepo(name: string): Promise<void> {
    logger.info(`Archiving repo: ${this.org}/${name}`);
    await this.request('PATCH', `/repos/${this.org}/${name}`, {
      archived: true,
    });
  }

  /**
   * Delete a repository permanently.
   */
  async deleteRepo(name: string): Promise<void> {
    logger.warn(`Deleting repo: ${this.org}/${name}`);
    await this.request('DELETE', `/repos/${this.org}/${name}`);
  }

  // ── File Operations ──

  /**
   * Create or update a file in a repository.
   */
  async createOrUpdateFile(
    repoName: string,
    filePath: string,
    content: string,
    commitMessage: string,
    branch = 'main',
  ): Promise<void> {
    const encoded = Buffer.from(content).toString('base64');

    // Check if file exists (to get SHA for update)
    let sha: string | undefined;
    try {
      const existing = await this.request<GiteaFileContent>(
        'GET',
        `/repos/${this.org}/${repoName}/contents/${filePath}?ref=${branch}`,
      );
      sha = existing.sha;
    } catch {
      // File doesn't exist yet — create
    }

    if (sha) {
      await this.request('PUT', `/repos/${this.org}/${repoName}/contents/${filePath}`, {
        content: encoded,
        message: commitMessage,
        branch,
        sha,
      });
    } else {
      await this.request('POST', `/repos/${this.org}/${repoName}/contents/${filePath}`, {
        content: encoded,
        message: commitMessage,
        branch,
      });
    }
  }

  /**
   * Create multiple files in a single commit (batch operation).
   */
  async createFiles(
    repoName: string,
    files: { path: string; content: string }[],
    commitMessage: string,
    branch = 'main',
  ): Promise<void> {
    // Gitea doesn't have a batch file API, so we create files sequentially
    for (const file of files) {
      await this.createOrUpdateFile(repoName, file.path, file.content, commitMessage, branch);
    }
  }

  /**
   * Get file content from a repository.
   */
  async getFileContent(repoName: string, filePath: string, branch = 'main'): Promise<string> {
    const file = await this.request<GiteaFileContent>(
      'GET',
      `/repos/${this.org}/${repoName}/contents/${filePath}?ref=${branch}`,
    );
    return Buffer.from(file.content, 'base64').toString('utf-8');
  }
}
