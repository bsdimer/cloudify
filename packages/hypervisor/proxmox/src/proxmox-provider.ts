/**
 * Proxmox implementation of the HypervisorProvider interface.
 *
 * Maps the abstract VM lifecycle operations to Proxmox VE API calls.
 */

import type {
  HypervisorProvider,
  VmSpec,
  VmInfo,
  VmStatus,
  SnapshotInfo,
  NodeInfo,
  TemplateInfo,
  ResizeSpec,
  PlacementDecision,
  PlacementConstraints,
} from '@cloudify/hypervisor-core';
import { ProxmoxApi, type ProxmoxConfig, type PveVm, type PveVmConfig, type PveNode } from './proxmox-api';
import { createLogger } from '@cloudify/common';

const logger = createLogger('ProxmoxProvider');

/**
 * Internal mapping: Proxmox VM ID → node location.
 * Proxmox requires node name for most operations, but the abstract
 * interface uses VM IDs. We cache the mapping.
 */
interface VmLocation {
  node: string;
  vmid: number;
}

export class ProxmoxProvider implements HypervisorProvider {
  readonly name = 'proxmox';
  private readonly api: ProxmoxApi;
  private readonly vmLocationCache = new Map<string, VmLocation>();

  constructor(config: ProxmoxConfig) {
    this.api = new ProxmoxApi(config);
  }

  // ── VM Lifecycle ──

  async createVm(spec: VmSpec): Promise<VmInfo> {
    const placement = await this.decidePlacement(spec);
    const vmid = await this.api.getNextVmId();
    const node = placement.nodeName;

    logger.info(`Creating VM ${spec.name} (vmid: ${vmid}) on node ${node}`);

    const params: Record<string, unknown> = {
      vmid,
      name: spec.name,
      cores: spec.cpus,
      memory: spec.memoryMb,
      scsihw: 'virtio-scsi-single',
      scsi0: `local-lvm:${spec.diskGb}`,
      net0: `virtio,bridge=${spec.networkBridge || 'vmbr0'}`,
      ostype: 'l26',
      start: 1,
    };

    // Cloud-init config
    if (spec.cloudInit) {
      params.ide2 = 'local-lvm:cloudinit';

      if (spec.cloudInit.sshKeys?.length) {
        params.sshkeys = encodeURIComponent(spec.cloudInit.sshKeys.join('\n'));
      }
      if (spec.cloudInit.userData) {
        params.cicustom = `user=local:snippets/${spec.name}-user.yml`;
      }
    }

    if (spec.templateId) {
      // Clone from template
      const templateLocation = await this.resolveVmLocation(spec.templateId);
      const upid = await this.api.cloneVm(templateLocation.node, templateLocation.vmid, vmid, {
        name: spec.name,
        target: node,
        full: 1,
      });
      await this.api.waitForTask(templateLocation.node, upid);

      // Apply spec overrides after clone
      await this.api.resizeVm(node, vmid, {
        cores: spec.cpus,
        memory: spec.memoryMb,
      });

      // Start the cloned VM
      await this.api.startVm(node, vmid);
    } else {
      const upid = await this.api.createVm(node, params);
      await this.api.waitForTask(node, upid);
    }

    // Cache location
    const vmIdStr = String(vmid);
    this.vmLocationCache.set(vmIdStr, { node, vmid });

    return this.getVm(vmIdStr);
  }

  async destroyVm(vmId: string): Promise<void> {
    const loc = await this.resolveVmLocation(vmId);
    logger.info(`Destroying VM ${vmId} on node ${loc.node}`);

    // Stop first if running
    try {
      const vm = await this.api.getVm(loc.node, loc.vmid);
      if (vm.status === 'running') {
        const stopUpid = await this.api.stopVm(loc.node, loc.vmid);
        await this.api.waitForTask(loc.node, stopUpid);
      }
    } catch {
      // VM might already be stopped
    }

    const upid = await this.api.deleteVm(loc.node, loc.vmid);
    await this.api.waitForTask(loc.node, upid);
    this.vmLocationCache.delete(vmId);
  }

  async startVm(vmId: string): Promise<void> {
    const loc = await this.resolveVmLocation(vmId);
    const upid = await this.api.startVm(loc.node, loc.vmid);
    await this.api.waitForTask(loc.node, upid);
  }

  async stopVm(vmId: string, force = false): Promise<void> {
    const loc = await this.resolveVmLocation(vmId);
    if (force) {
      const upid = await this.api.stopVm(loc.node, loc.vmid);
      await this.api.waitForTask(loc.node, upid);
    } else {
      const upid = await this.api.shutdownVm(loc.node, loc.vmid);
      await this.api.waitForTask(loc.node, upid);
    }
  }

  async restartVm(vmId: string): Promise<void> {
    const loc = await this.resolveVmLocation(vmId);
    const upid = await this.api.rebootVm(loc.node, loc.vmid);
    await this.api.waitForTask(loc.node, upid);
  }

  async getVm(vmId: string): Promise<VmInfo> {
    const loc = await this.resolveVmLocation(vmId);
    const [vm, config] = await Promise.all([
      this.api.getVm(loc.node, loc.vmid),
      this.api.getVmConfig(loc.node, loc.vmid),
    ]);

    return this.mapVmInfo(vm, config, loc.node);
  }

  async listVms(filters?: { node?: string; status?: string }): Promise<VmInfo[]> {
    const nodes = await this.api.listNodes();
    const targetNodes = filters?.node ? nodes.filter((n) => n.node === filters.node) : nodes;

    const allVms: VmInfo[] = [];

    for (const node of targetNodes) {
      const vms = await this.api.listVms(node.node);
      for (const vm of vms) {
        if (filters?.status && this.mapPveStatus(vm.status) !== filters.status) continue;

        allVms.push({
          id: String(vm.vmid),
          name: vm.name,
          status: this.mapPveStatus(vm.status),
          cpus: vm.cpus,
          memoryMb: Math.round(vm.maxmem / (1024 * 1024)),
          diskGb: Math.round(vm.maxdisk / (1024 * 1024 * 1024)),
          ipAddresses: [],
          node: node.node,
          uptime: vm.uptime,
        });
      }
    }

    return allVms;
  }

  async resizeVm(vmId: string, spec: ResizeSpec): Promise<VmInfo> {
    const loc = await this.resolveVmLocation(vmId);
    const config: Record<string, unknown> = {};

    if (spec.cpus) config.cores = spec.cpus;
    if (spec.memoryMb) config.memory = spec.memoryMb;

    if (Object.keys(config).length > 0) {
      await this.api.resizeVm(loc.node, loc.vmid, config);
    }

    if (spec.diskGb) {
      await this.api.resizeDisk(loc.node, loc.vmid, 'scsi0', `+${spec.diskGb}G`);
    }

    return this.getVm(vmId);
  }

  // ── Snapshots ──

  async createSnapshot(vmId: string, name: string, description?: string): Promise<SnapshotInfo> {
    const loc = await this.resolveVmLocation(vmId);
    const upid = await this.api.createSnapshot(loc.node, loc.vmid, name, description);
    await this.api.waitForTask(loc.node, upid);

    return {
      id: name,
      vmId,
      name,
      description,
      createdAt: new Date().toISOString(),
    };
  }

  async restoreSnapshot(vmId: string, snapshotId: string): Promise<void> {
    const loc = await this.resolveVmLocation(vmId);
    const upid = await this.api.rollbackSnapshot(loc.node, loc.vmid, snapshotId);
    await this.api.waitForTask(loc.node, upid);
  }

  async deleteSnapshot(vmId: string, snapshotId: string): Promise<void> {
    const loc = await this.resolveVmLocation(vmId);
    const upid = await this.api.deleteSnapshot(loc.node, loc.vmid, snapshotId);
    await this.api.waitForTask(loc.node, upid);
  }

  async listSnapshots(vmId: string): Promise<SnapshotInfo[]> {
    const loc = await this.resolveVmLocation(vmId);
    const snapshots = await this.api.listSnapshots(loc.node, loc.vmid);

    return snapshots
      .filter((s) => s.name !== 'current')
      .map((s) => ({
        id: s.name,
        vmId,
        name: s.name,
        description: s.description,
        createdAt: new Date(s.snaptime * 1000).toISOString(),
      }));
  }

  // ── Migration ──

  async migrateVm(vmId: string, targetNodeId: string): Promise<void> {
    const loc = await this.resolveVmLocation(vmId);
    logger.info(`Migrating VM ${vmId} from ${loc.node} to ${targetNodeId}`);
    const upid = await this.api.migrateVm(loc.node, loc.vmid, targetNodeId);
    await this.api.waitForTask(loc.node, upid, 600000); // 10 min timeout for migrations

    // Update cache
    this.vmLocationCache.set(vmId, { node: targetNodeId, vmid: loc.vmid });
  }

  // ── Templates ──

  async listTemplates(): Promise<TemplateInfo[]> {
    const nodes = await this.api.listNodes();
    const templates: TemplateInfo[] = [];

    for (const node of nodes) {
      const vms = await this.api.listVms(node.node);
      for (const vm of vms) {
        // Proxmox templates have a specific status
        if (vm.status === 'stopped' && vm.name.includes('template')) {
          templates.push({
            id: String(vm.vmid),
            name: vm.name,
            os: vm.name.replace(/-template$/, ''),
            diskGb: Math.round(vm.maxdisk / (1024 * 1024 * 1024)),
            node: node.node,
          });
        }
      }
    }

    return templates;
  }

  async getTemplate(templateId: string): Promise<TemplateInfo> {
    const loc = await this.resolveVmLocation(templateId);
    const vm = await this.api.getVm(loc.node, loc.vmid);

    return {
      id: templateId,
      name: vm.name,
      os: vm.name.replace(/-template$/, ''),
      diskGb: Math.round(vm.maxdisk / (1024 * 1024 * 1024)),
      node: loc.node,
    };
  }

  async cloneFromTemplate(templateId: string, spec: VmSpec): Promise<VmInfo> {
    return this.createVm({ ...spec, templateId });
  }

  // ── Nodes ──

  async listNodes(): Promise<NodeInfo[]> {
    const nodes = await this.api.listNodes();
    return nodes.map((n) => this.mapNodeInfo(n));
  }

  async getNode(nodeId: string): Promise<NodeInfo> {
    const status = await this.api.getNodeStatus(nodeId);
    return this.mapNodeInfo(status);
  }

  // ── Placement ──

  async decidePlacement(spec: VmSpec, constraints?: PlacementConstraints): Promise<PlacementDecision> {
    const nodes = await this.listNodes();
    const onlineNodes = nodes.filter((n) => n.status === 'online');

    if (onlineNodes.length === 0) {
      throw new Error('No online nodes available');
    }

    // Filter by constraints
    let candidates = onlineNodes;
    if (constraints?.excludedNodes?.length) {
      candidates = candidates.filter((n) => !constraints.excludedNodes!.includes(n.id));
    }
    if (constraints?.preferredNodes?.length) {
      const preferred = candidates.filter((n) => constraints.preferredNodes!.includes(n.id));
      if (preferred.length > 0) candidates = preferred;
    }

    // Filter by capacity
    candidates = candidates.filter((n) => {
      const freeCpu = n.cpuTotal - n.cpuUsed;
      const freeMemMb = n.memoryTotalMb - n.memoryUsedMb;
      return freeCpu >= spec.cpus && freeMemMb >= spec.memoryMb;
    });

    if (candidates.length === 0) {
      throw new Error(`No nodes with sufficient capacity (need ${spec.cpus} CPU, ${spec.memoryMb}MB RAM)`);
    }

    const strategy = constraints?.strategy || 'spread';

    let selected: NodeInfo;

    if (strategy === 'pack') {
      // Pack: choose the node with the least free resources (bin-packing)
      selected = candidates.sort(
        (a, b) => (a.cpuTotal - a.cpuUsed) - (b.cpuTotal - b.cpuUsed),
      )[0];
    } else {
      // Spread: choose the node with the most free resources
      selected = candidates.sort(
        (a, b) => (b.cpuTotal - b.cpuUsed) - (a.cpuTotal - a.cpuUsed),
      )[0];
    }

    return {
      nodeId: selected.id,
      nodeName: selected.name,
      reason: `${strategy} strategy: ${selected.cpuTotal - selected.cpuUsed} free CPUs, ${selected.memoryTotalMb - selected.memoryUsedMb}MB free RAM`,
    };
  }

  // ── Helpers ──

  private async resolveVmLocation(vmId: string): Promise<VmLocation> {
    const cached = this.vmLocationCache.get(vmId);
    if (cached) return cached;

    // Search all nodes for this VM
    const vmid = parseInt(vmId, 10);
    const nodes = await this.api.listNodes();

    for (const node of nodes) {
      try {
        await this.api.getVm(node.node, vmid);
        const location = { node: node.node, vmid };
        this.vmLocationCache.set(vmId, location);
        return location;
      } catch {
        // VM not on this node
      }
    }

    throw new Error(`VM ${vmId} not found on any node`);
  }

  private mapVmInfo(vm: PveVm, config: PveVmConfig, node: string): VmInfo {
    return {
      id: String(vm.vmid),
      name: vm.name || config.name,
      status: this.mapPveStatus(vm.status),
      cpus: config.cores,
      memoryMb: config.memory,
      diskGb: Math.round(vm.maxdisk / (1024 * 1024 * 1024)),
      ipAddresses: [],
      node,
      uptime: vm.uptime,
    };
  }

  private mapPveStatus(pveStatus: string): VmStatus {
    const map: Record<string, VmStatus> = {
      running: 'running',
      stopped: 'stopped',
      paused: 'paused',
      suspended: 'suspended',
    };
    return map[pveStatus] || 'unknown';
  }

  private mapNodeInfo(pveNode: PveNode): NodeInfo {
    return {
      id: pveNode.node,
      name: pveNode.node,
      status: pveNode.status === 'online' ? 'online' : 'offline',
      cpuTotal: pveNode.maxcpu,
      cpuUsed: Math.round(pveNode.cpu * pveNode.maxcpu * 100) / 100,
      memoryTotalMb: Math.round(pveNode.maxmem / (1024 * 1024)),
      memoryUsedMb: Math.round(pveNode.mem / (1024 * 1024)),
      storageTotalGb: Math.round(pveNode.maxdisk / (1024 * 1024 * 1024)),
      storageUsedGb: Math.round(pveNode.disk / (1024 * 1024 * 1024)),
    };
  }
}
