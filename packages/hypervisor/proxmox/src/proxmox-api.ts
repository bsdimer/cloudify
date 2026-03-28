/**
 * Proxmox VE REST API client — fully typed.
 *
 * Handles authentication (API token or ticket), request signing,
 * and provides typed methods for all Proxmox API endpoints we need.
 */

import { createLogger, retry, RetryPresets } from '@cloudify/common';

const logger = createLogger('ProxmoxAPI');

export interface ProxmoxConfig {
  /** Proxmox API URL, e.g., https://pve.example.com:8006 */
  baseUrl: string;
  /** API token ID, e.g., root@pam!cloudify */
  tokenId?: string;
  /** API token secret */
  tokenSecret?: string;
  /** Username for ticket auth (alternative to token) */
  username?: string;
  /** Password for ticket auth */
  password?: string;
  /** Skip TLS verification (dev only!) */
  insecure?: boolean;
}

interface ProxmoxTicket {
  ticket: string;
  CSRFPreventionToken: string;
}

// ── Proxmox API response types ──

export interface PveNode {
  node: string;
  status: string;
  cpu: number;
  maxcpu: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  uptime: number;
}

export interface PveVm {
  vmid: number;
  name: string;
  status: string;
  node?: string;
  cpus: number;
  maxmem: number;
  maxdisk: number;
  uptime: number;
  pid?: number;
  netout?: number;
  netin?: number;
}

export interface PveVmConfig {
  name: string;
  cores: number;
  memory: number;
  scsihw?: string;
  scsi0?: string;
  net0?: string;
  ide2?: string;
  ostype?: string;
  boot?: string;
  smbios1?: string;
  [key: string]: unknown;
}

export interface PveSnapshot {
  name: string;
  description: string;
  snaptime: number;
  parent?: string;
}

export interface PveStorage {
  storage: string;
  type: string;
  content: string;
  avail: number;
  total: number;
  used: number;
  active: number;
}

export interface PveTaskStatus {
  upid: string;
  node: string;
  status: string;
  exitstatus?: string;
  type: string;
  starttime: number;
  endtime?: number;
}

/**
 * Low-level Proxmox VE API client.
 */
export class ProxmoxApi {
  private readonly baseUrl: string;
  private readonly tokenId?: string;
  private readonly tokenSecret?: string;
  private readonly username?: string;
  private readonly password?: string;
  private ticket?: ProxmoxTicket;
  private ticketExpiry = 0;

  constructor(config: ProxmoxConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.tokenId = config.tokenId;
    this.tokenSecret = config.tokenSecret;
    this.username = config.username;
    this.password = config.password;
  }

  // ── Auth ──

  private async getAuthHeaders(): Promise<Record<string, string>> {
    if (this.tokenId && this.tokenSecret) {
      return {
        Authorization: `PVEAPIToken=${this.tokenId}=${this.tokenSecret}`,
      };
    }

    // Ticket-based auth
    if (!this.ticket || Date.now() > this.ticketExpiry) {
      await this.authenticate();
    }

    return {
      Cookie: `PVEAuthCookie=${this.ticket!.ticket}`,
      CSRFPreventionToken: this.ticket!.CSRFPreventionToken,
    };
  }

  private async authenticate(): Promise<void> {
    if (!this.username || !this.password) {
      throw new Error('ProxmoxApi: either tokenId+tokenSecret or username+password required');
    }

    const response = await fetch(`${this.baseUrl}/api2/json/access/ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        username: this.username,
        password: this.password,
      }),
    });

    if (!response.ok) {
      throw new Error(`Proxmox auth failed: ${response.status}`);
    }

    const body = (await response.json()) as { data: ProxmoxTicket };
    this.ticket = body.data;
    this.ticketExpiry = Date.now() + 2 * 60 * 60 * 1000 - 60000; // 2h minus 1m buffer
  }

  // ── HTTP ──

  private async request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    return retry(
      async () => {
        const headers = await this.getAuthHeaders();
        const url = `${this.baseUrl}/api2/json${path}`;

        const fetchOptions: RequestInit = {
          method,
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
        };

        if (body && method !== 'GET') {
          fetchOptions.body = JSON.stringify(body);
        }

        const response = await fetch(url, fetchOptions);

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Proxmox API error ${response.status}: ${text}`);
        }

        const json = (await response.json()) as { data: T };
        return json.data;
      },
      {
        ...RetryPresets.quick,
        retryIf: (err) => {
          const msg = err instanceof Error ? err.message : '';
          return msg.includes('500') || msg.includes('502') || msg.includes('503');
        },
      },
    );
  }

  // ── Nodes ──

  async listNodes(): Promise<PveNode[]> {
    return this.request<PveNode[]>('GET', '/nodes');
  }

  async getNodeStatus(node: string): Promise<PveNode> {
    return this.request<PveNode>('GET', `/nodes/${node}/status`);
  }

  // ── VMs ──

  async listVms(node: string): Promise<PveVm[]> {
    return this.request<PveVm[]>('GET', `/nodes/${node}/qemu`);
  }

  async getVm(node: string, vmid: number): Promise<PveVm> {
    return this.request<PveVm>('GET', `/nodes/${node}/qemu/${vmid}/status/current`);
  }

  async getVmConfig(node: string, vmid: number): Promise<PveVmConfig> {
    return this.request<PveVmConfig>('GET', `/nodes/${node}/qemu/${vmid}/config`);
  }

  async createVm(node: string, params: Record<string, unknown>): Promise<string> {
    return this.request<string>('POST', `/nodes/${node}/qemu`, params);
  }

  async cloneVm(
    node: string,
    vmid: number,
    newid: number,
    params: Record<string, unknown>,
  ): Promise<string> {
    return this.request<string>('POST', `/nodes/${node}/qemu/${vmid}/clone`, {
      newid,
      ...params,
    });
  }

  async startVm(node: string, vmid: number): Promise<string> {
    return this.request<string>('POST', `/nodes/${node}/qemu/${vmid}/status/start`);
  }

  async stopVm(node: string, vmid: number): Promise<string> {
    return this.request<string>('POST', `/nodes/${node}/qemu/${vmid}/status/stop`);
  }

  async shutdownVm(node: string, vmid: number, timeout = 60): Promise<string> {
    return this.request<string>('POST', `/nodes/${node}/qemu/${vmid}/status/shutdown`, {
      timeout,
    });
  }

  async rebootVm(node: string, vmid: number): Promise<string> {
    return this.request<string>('POST', `/nodes/${node}/qemu/${vmid}/status/reboot`);
  }

  async deleteVm(node: string, vmid: number, purge = true): Promise<string> {
    const params = purge ? '?purge=1&destroy-unreferenced-disks=1' : '';
    return this.request<string>('DELETE', `/nodes/${node}/qemu/${vmid}${params}`);
  }

  async resizeVm(node: string, vmid: number, config: Record<string, unknown>): Promise<void> {
    await this.request('PUT', `/nodes/${node}/qemu/${vmid}/config`, config);
  }

  async resizeDisk(node: string, vmid: number, disk: string, size: string): Promise<void> {
    await this.request('PUT', `/nodes/${node}/qemu/${vmid}/resize`, { disk, size });
  }

  // ── Snapshots ──

  async listSnapshots(node: string, vmid: number): Promise<PveSnapshot[]> {
    return this.request<PveSnapshot[]>('GET', `/nodes/${node}/qemu/${vmid}/snapshot`);
  }

  async createSnapshot(
    node: string,
    vmid: number,
    snapname: string,
    description?: string,
  ): Promise<string> {
    return this.request<string>('POST', `/nodes/${node}/qemu/${vmid}/snapshot`, {
      snapname,
      description,
    });
  }

  async rollbackSnapshot(node: string, vmid: number, snapname: string): Promise<string> {
    return this.request<string>('POST', `/nodes/${node}/qemu/${vmid}/snapshot/${snapname}/rollback`);
  }

  async deleteSnapshot(node: string, vmid: number, snapname: string): Promise<string> {
    return this.request<string>('DELETE', `/nodes/${node}/qemu/${vmid}/snapshot/${snapname}`);
  }

  // ── Migration ──

  async migrateVm(node: string, vmid: number, target: string, online = true): Promise<string> {
    return this.request<string>('POST', `/nodes/${node}/qemu/${vmid}/migrate`, {
      target,
      online: online ? 1 : 0,
    });
  }

  // ── Storage ──

  async listStorage(node: string): Promise<PveStorage[]> {
    return this.request<PveStorage[]>('GET', `/nodes/${node}/storage`);
  }

  // ── Tasks ──

  async getTaskStatus(node: string, upid: string): Promise<PveTaskStatus> {
    return this.request<PveTaskStatus>('GET', `/nodes/${node}/tasks/${encodeURIComponent(upid)}/status`);
  }

  /**
   * Wait for a task to complete.
   */
  async waitForTask(node: string, upid: string, timeoutMs = 120000, pollIntervalMs = 2000): Promise<PveTaskStatus> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const status = await this.getTaskStatus(node, upid);
      if (status.status === 'stopped') {
        if (status.exitstatus !== 'OK') {
          throw new Error(`Proxmox task failed: ${status.exitstatus}`);
        }
        return status;
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Proxmox task timed out after ${timeoutMs}ms: ${upid}`);
  }

  // ── Next VMID ──

  async getNextVmId(): Promise<number> {
    return this.request<number>('GET', '/cluster/nextid');
  }
}
