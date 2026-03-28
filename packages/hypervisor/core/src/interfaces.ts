import type {
  VmSpec,
  VmInfo,
  SnapshotInfo,
  NodeInfo,
  TemplateInfo,
  ResizeSpec,
  PlacementDecision,
  PlacementConstraints,
} from './types';

/**
 * Core hypervisor provider interface.
 * Implemented by each hypervisor backend (Proxmox, VMware, etc.).
 * All methods should be idempotent where possible.
 */
export interface HypervisorProvider {
  readonly name: string;

  // ── VM Lifecycle ──

  createVm(spec: VmSpec): Promise<VmInfo>;
  destroyVm(vmId: string): Promise<void>;
  startVm(vmId: string): Promise<void>;
  stopVm(vmId: string, force?: boolean): Promise<void>;
  restartVm(vmId: string): Promise<void>;
  getVm(vmId: string): Promise<VmInfo>;
  listVms(filters?: { node?: string; status?: string }): Promise<VmInfo[]>;
  resizeVm(vmId: string, spec: ResizeSpec): Promise<VmInfo>;

  // ── Snapshots ──

  createSnapshot(vmId: string, name: string, description?: string): Promise<SnapshotInfo>;
  restoreSnapshot(vmId: string, snapshotId: string): Promise<void>;
  deleteSnapshot(vmId: string, snapshotId: string): Promise<void>;
  listSnapshots(vmId: string): Promise<SnapshotInfo[]>;

  // ── Migration ──

  migrateVm(vmId: string, targetNodeId: string): Promise<void>;

  // ── Templates ──

  listTemplates(): Promise<TemplateInfo[]>;
  getTemplate(templateId: string): Promise<TemplateInfo>;
  cloneFromTemplate(templateId: string, spec: VmSpec): Promise<VmInfo>;

  // ── Node Management ──

  listNodes(): Promise<NodeInfo[]>;
  getNode(nodeId: string): Promise<NodeInfo>;

  // ── Placement ──

  decidePlacement(spec: VmSpec, constraints?: PlacementConstraints): Promise<PlacementDecision>;
}

/**
 * Storage provider abstraction for block/volume storage.
 */
export interface StorageProvider {
  readonly name: string;

  createVolume(sizeGb: number, opts?: { pool?: string }): Promise<{ id: string; path: string }>;
  deleteVolume(volumeId: string): Promise<void>;
  resizeVolume(volumeId: string, newSizeGb: number): Promise<void>;
  attachVolume(volumeId: string, vmId: string): Promise<void>;
  detachVolume(volumeId: string, vmId: string): Promise<void>;
}

/**
 * Network bridge abstraction for hypervisor-level networking.
 */
export interface NetworkBridge {
  readonly name: string;

  createBridge(opts: { name: string; vlanTag?: number }): Promise<{ id: string }>;
  deleteBridge(bridgeId: string): Promise<void>;
  attachVmToBridge(vmId: string, bridgeId: string): Promise<void>;
  detachVmFromBridge(vmId: string, bridgeId: string): Promise<void>;
}
