/**
 * Networking, SDN, IPAM, and Load Balancer types.
 */

// ── VPC / SDN ──

export interface CreateVpcDto {
  name: string;
  description?: string;
  cidr: string; // e.g., '10.0.0.0/16'
}

export interface VpcInfo {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  cidr: string;
  status: string;
  routerId: string | null;
  createdAt: string;
}

export interface CreateSubnetDto {
  vpcId: string;
  name: string;
  cidr: string; // e.g., '10.0.1.0/24' — must be within VPC CIDR
  gateway?: string;
  dnsServers?: string[];
  dhcpEnabled?: boolean;
}

export interface SubnetInfo {
  id: string;
  vpcId: string;
  tenantId: string;
  name: string;
  cidr: string;
  gateway: string;
  dnsServers: string[];
  dhcpEnabled: boolean;
  availableIps: number;
  createdAt: string;
}

// ── Security Groups ──

export type SecurityRuleDirection = 'ingress' | 'egress';
export type SecurityRuleProtocol = 'tcp' | 'udp' | 'icmp' | 'any';

export interface SecurityRule {
  direction: SecurityRuleDirection;
  protocol: SecurityRuleProtocol;
  portRangeMin?: number;
  portRangeMax?: number;
  remoteCidr?: string; // source/dest CIDR, default 0.0.0.0/0
  description?: string;
}

export interface CreateSecurityGroupDto {
  name: string;
  description?: string;
  vpcId: string;
  rules: SecurityRule[];
}

export interface SecurityGroupInfo {
  id: string;
  tenantId: string;
  vpcId: string;
  name: string;
  description: string | null;
  rules: SecurityRule[];
  createdAt: string;
}

// ── IPAM ──

export type IpVersion = 4 | 6;
export type IpAllocationType = 'floating' | 'ephemeral' | 'private';

export interface CreateIpPoolDto {
  name: string;
  cidr: string;
  version: IpVersion;
  gateway?: string;
  description?: string;
}

export interface IpPoolInfo {
  id: string;
  name: string;
  cidr: string;
  version: IpVersion;
  gateway: string | null;
  totalIps: number;
  allocatedIps: number;
  availableIps: number;
  description: string | null;
  createdAt: string;
}

export interface AllocateIpDto {
  poolId: string;
  type: IpAllocationType;
  description?: string;
}

export interface IpAllocationInfo {
  id: string;
  tenantId: string;
  poolId: string;
  address: string;
  version: IpVersion;
  type: IpAllocationType;
  resourceId: string | null;
  status: 'available' | 'allocated' | 'assigned' | 'released';
  description: string | null;
  createdAt: string;
}

export interface AssignIpDto {
  resourceId: string;
}

// ── Load Balancers ──

export type LbAlgorithm = 'roundrobin' | 'leastconn' | 'source';
export type LbProtocol = 'tcp' | 'http' | 'https';

export interface CreateLoadBalancerDto {
  name: string;
  vpcId: string;
  protocol: LbProtocol;
  frontendPort: number;
  backendPort: number;
  algorithm?: LbAlgorithm;
  healthCheck?: HealthCheckConfig;
  backends: LbBackendDto[];
}

export interface HealthCheckConfig {
  protocol: 'tcp' | 'http';
  path?: string; // for HTTP checks
  intervalSeconds: number;
  timeoutSeconds: number;
  unhealthyThreshold: number;
}

export interface LbBackendDto {
  address: string; // IP or hostname
  port: number;
  weight?: number;
}

export interface LoadBalancerInfo {
  id: string;
  tenantId: string;
  name: string;
  vpcId: string;
  status: string;
  protocol: LbProtocol;
  frontendPort: number;
  backendPort: number;
  algorithm: LbAlgorithm;
  publicIp: string | null;
  backends: LbBackendInfo[];
  healthCheck: HealthCheckConfig | null;
  createdAt: string;
}

export interface LbBackendInfo {
  address: string;
  port: number;
  weight: number;
  status: 'healthy' | 'unhealthy' | 'unknown';
}
