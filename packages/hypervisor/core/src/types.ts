export interface VmSpec {
  name: string;
  cpus: number;
  memoryMb: number;
  diskGb: number;
  templateId?: string;
  networkBridge?: string;
  cloudInit?: CloudInitConfig;
  tags?: Record<string, string>;
}

export interface CloudInitConfig {
  userData?: string;
  networkConfig?: string;
  sshKeys?: string[];
}

export interface VmInfo {
  id: string;
  name: string;
  status: VmStatus;
  cpus: number;
  memoryMb: number;
  diskGb: number;
  ipAddresses: string[];
  node: string;
  uptime?: number;
  createdAt?: string;
}

export type VmStatus =
  | 'running'
  | 'stopped'
  | 'paused'
  | 'suspended'
  | 'creating'
  | 'migrating'
  | 'error'
  | 'unknown';

export interface SnapshotInfo {
  id: string;
  vmId: string;
  name: string;
  description?: string;
  createdAt: string;
  sizeBytes?: number;
}

export interface NodeInfo {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'maintenance';
  cpuTotal: number;
  cpuUsed: number;
  memoryTotalMb: number;
  memoryUsedMb: number;
  storageTotalGb: number;
  storageUsedGb: number;
}

export interface TemplateInfo {
  id: string;
  name: string;
  description?: string;
  os: string;
  diskGb: number;
  node: string;
}

export interface ResizeSpec {
  cpus?: number;
  memoryMb?: number;
  diskGb?: number;
}

export interface PlacementDecision {
  nodeId: string;
  nodeName: string;
  reason: string;
}

export type PlacementStrategy = 'spread' | 'pack' | 'affinity';

export interface PlacementConstraints {
  strategy: PlacementStrategy;
  preferredNodes?: string[];
  excludedNodes?: string[];
  antiAffinityGroup?: string;
}
