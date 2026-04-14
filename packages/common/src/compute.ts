/**
 * Compute-related types and DTOs for VM and K8s orchestration.
 */

// ── VM DTOs ──

export interface CreateVmDto {
  name: string;
  cpus: number;
  memoryMb: number;
  diskGb: number;
  templateId?: string;
  networkBridge?: string;
  sshKeys?: string[];
  userData?: string;
  tags?: Record<string, string>;
  placementStrategy?: 'spread' | 'pack';
  preferredNode?: string;
}

export interface ResizeVmDto {
  cpus?: number;
  memoryMb?: number;
  diskGb?: number;
}

export interface VmActionDto {
  action: 'start' | 'stop' | 'restart';
  force?: boolean;
}

export interface CreateSnapshotDto {
  name: string;
  description?: string;
}

// ── K8s Cluster DTOs ──

export interface CreateK8sClusterDto {
  name: string;
  version: string;
  controlPlaneCount: 1 | 3;
  workerCount: number;
  workerCpus: number;
  workerMemoryMb: number;
  workerDiskGb: number;
  controlPlaneCpus?: number;
  controlPlaneMemoryMb?: number;
  controlPlaneDiskGb?: number;
  cniPlugin?: 'cilium' | 'calico';
  podCidr?: string;
  serviceCidr?: string;
  sshKeys?: string[];
  tags?: Record<string, string>;
}

export interface ScaleK8sClusterDto {
  workerCount: number;
}

export interface UpgradeK8sClusterDto {
  targetVersion: string;
}

export interface K8sClusterInfo {
  id: string;
  name: string;
  tenantId: string;
  version: string;
  status: string;
  controlPlaneCount: number;
  workerCount: number;
  controlPlaneNodes: K8sNodeInfo[];
  workerNodes: K8sNodeInfo[];
  endpoint?: string;
  podCidr: string;
  serviceCidr: string;
  createdAt: string;
}

export interface K8sNodeInfo {
  vmId: string;
  name: string;
  role: 'control-plane' | 'worker';
  status: string;
  cpus: number;
  memoryMb: number;
  diskGb: number;
  ipAddress?: string;
}

// ── VM Image Catalog ──

export interface VmImage {
  id: string;
  name: string;
  os: string;
  version: string;
  arch: 'amd64' | 'arm64';
  minDiskGb: number;
  minMemoryMb: number;
  templateId: string;
  description?: string;
}

export const DEFAULT_VM_IMAGES: VmImage[] = [
  {
    id: 'ubuntu-2404',
    name: 'Ubuntu 24.04 LTS',
    os: 'ubuntu',
    version: '24.04',
    arch: 'amd64',
    minDiskGb: 10,
    minMemoryMb: 512,
    templateId: 'ubuntu-2404-template',
    description: 'Ubuntu 24.04 LTS (Noble Numbat)',
  },
  {
    id: 'ubuntu-2204',
    name: 'Ubuntu 22.04 LTS',
    os: 'ubuntu',
    version: '22.04',
    arch: 'amd64',
    minDiskGb: 10,
    minMemoryMb: 512,
    templateId: 'ubuntu-2204-template',
    description: 'Ubuntu 22.04 LTS (Jammy Jellyfish)',
  },
  {
    id: 'debian-12',
    name: 'Debian 12',
    os: 'debian',
    version: '12',
    arch: 'amd64',
    minDiskGb: 8,
    minMemoryMb: 256,
    templateId: 'debian-12-template',
    description: 'Debian 12 (Bookworm)',
  },
  {
    id: 'rocky-9',
    name: 'Rocky Linux 9',
    os: 'rocky',
    version: '9',
    arch: 'amd64',
    minDiskGb: 10,
    minMemoryMb: 512,
    templateId: 'rocky-9-template',
    description: 'Rocky Linux 9 (RHEL-compatible)',
  },
  {
    id: 'alma-9',
    name: 'AlmaLinux 9',
    os: 'alma',
    version: '9',
    arch: 'amd64',
    minDiskGb: 10,
    minMemoryMb: 512,
    templateId: 'alma-9-template',
    description: 'AlmaLinux 9 (RHEL-compatible)',
  },
];

// ── K8s Version Catalog ──

export interface K8sVersion {
  version: string;
  supported: boolean;
  default: boolean;
  eolDate?: string;
}

export const SUPPORTED_K8S_VERSIONS: K8sVersion[] = [
  { version: '1.32', supported: true, default: true },
  { version: '1.31', supported: true, default: false },
  { version: '1.30', supported: true, default: false },
  { version: '1.29', supported: true, default: false, eolDate: '2025-02-28' },
];
