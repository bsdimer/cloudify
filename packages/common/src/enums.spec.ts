import {
  TenantStatus,
  UserRole,
  ResourceType,
  ResourceStatus,
  AuditAction,
  CertificateStatus,
} from './enums';

describe('Enums', () => {
  it('should define TenantStatus values', () => {
    expect(TenantStatus.ACTIVE).toBe('active');
    expect(TenantStatus.SUSPENDED).toBe('suspended');
    expect(TenantStatus.PENDING).toBe('pending');
    expect(TenantStatus.DECOMMISSIONED).toBe('decommissioned');
  });

  it('should define UserRole values', () => {
    expect(UserRole.SUPER_ADMIN).toBe('super_admin');
    expect(UserRole.OWNER).toBe('owner');
    expect(UserRole.ADMIN).toBe('admin');
    expect(UserRole.MEMBER).toBe('member');
    expect(UserRole.VIEWER).toBe('viewer');
  });

  it('should define all ResourceType values', () => {
    const types = Object.values(ResourceType);
    expect(types).toContain('k8s_cluster');
    expect(types).toContain('postgres');
    expect(types).toContain('minio_bucket');
    expect(types.length).toBe(13);
  });

  it('should define ResourceStatus values', () => {
    expect(ResourceStatus.PROVISIONING).toBe('provisioning');
    expect(ResourceStatus.ACTIVE).toBe('active');
    expect(ResourceStatus.ERROR).toBe('error');
  });

  it('should define AuditAction values', () => {
    expect(AuditAction.CREATE).toBe('create');
    expect(AuditAction.DELETE).toBe('delete');
    expect(AuditAction.LOGIN).toBe('login');
  });

  it('should define CertificateStatus values', () => {
    expect(CertificateStatus.ACTIVE).toBe('active');
    expect(CertificateStatus.EXPIRED).toBe('expired');
    expect(CertificateStatus.VALIDATION_FAILED).toBe('validation_failed');
  });
});
