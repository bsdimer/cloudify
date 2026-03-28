/**
 * Hypervisor provider factory — config-driven selection.
 *
 * Selects the correct hypervisor implementation based on configuration.
 * Currently supports: proxmox. Future: vmware.
 */

import type { HypervisorProvider } from './interfaces';

export type ProviderType = 'proxmox' | 'vmware';

export interface ProviderFactoryConfig {
  type: ProviderType;
  /** Provider-specific configuration. */
  config: Record<string, unknown>;
}

// Registry of provider constructors
const providerRegistry = new Map<
  ProviderType,
  (config: Record<string, unknown>) => Promise<HypervisorProvider>
>();

/**
 * Register a provider implementation.
 * Called by each provider package during initialization.
 */
export function registerProvider(
  type: ProviderType,
  factory: (config: Record<string, unknown>) => Promise<HypervisorProvider>,
): void {
  providerRegistry.set(type, factory);
}

/**
 * Create a hypervisor provider instance from configuration.
 *
 * @example
 *   const provider = await createProvider({
 *     type: 'proxmox',
 *     config: {
 *       baseUrl: 'https://pve.example.com:8006',
 *       tokenId: 'root@pam!cloudify',
 *       tokenSecret: '...',
 *     },
 *   });
 */
export async function createProvider(
  factoryConfig: ProviderFactoryConfig,
): Promise<HypervisorProvider> {
  const factory = providerRegistry.get(factoryConfig.type);

  if (!factory) {
    const available = Array.from(providerRegistry.keys()).join(', ');
    throw new Error(
      `Hypervisor provider '${factoryConfig.type}' is not registered. Available: ${available || 'none'}`,
    );
  }

  return factory(factoryConfig.config);
}

/**
 * Get list of registered provider types.
 */
export function getRegisteredProviders(): ProviderType[] {
  return Array.from(providerRegistry.keys());
}
