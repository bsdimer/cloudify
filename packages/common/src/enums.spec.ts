import {
  TenantStatus,
  UserRole,
  ResourceType,
  ResourceStatus,
  AuditAction,
  CertificateStatus,
  IamDomain,
  IamAction,
  BuiltInIamRole,
  InvitationStatus,
  ServiceAccountStatus,
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

  it('should define AuditAction values including IAM actions', () => {
    expect(AuditAction.CREATE).toBe('create');
    expect(AuditAction.DELETE).toBe('delete');
    expect(AuditAction.LOGIN).toBe('login');
    expect(AuditAction.ROLE_CREATED).toBe('role_created');
    expect(AuditAction.USER_INVITED).toBe('user_invited');
    expect(AuditAction.PERMISSION_DENIED).toBe('permission_denied');
    expect(AuditAction.SERVICE_ACCOUNT_CREATED).toBe('service_account_created');
  });

  it('should define CertificateStatus values', () => {
    expect(CertificateStatus.ACTIVE).toBe('active');
    expect(CertificateStatus.EXPIRED).toBe('expired');
    expect(CertificateStatus.VALIDATION_FAILED).toBe('validation_failed');
  });

  it('should define IAM domain values', () => {
    expect(IamDomain.COMPUTE).toBe('compute');
    expect(IamDomain.DATABASE).toBe('database');
    expect(IamDomain.IAM).toBe('iam');
    expect(IamDomain.ALL).toBe('*');
  });

  it('should define IAM action values', () => {
    expect(IamAction.CREATE).toBe('create');
    expect(IamAction.READ).toBe('read');
    expect(IamAction.MANAGE).toBe('manage');
    expect(IamAction.ALL).toBe('*');
  });

  it('should define BuiltInIamRole values', () => {
    expect(BuiltInIamRole.TENANT_ADMIN).toBe('tenant-admin');
    expect(BuiltInIamRole.DEVELOPER).toBe('developer');
    expect(BuiltInIamRole.BILLING_ADMIN).toBe('billing-admin');
    expect(BuiltInIamRole.READ_ONLY).toBe('read-only');
  });

  it('should define InvitationStatus values', () => {
    expect(InvitationStatus.PENDING).toBe('pending');
    expect(InvitationStatus.ACCEPTED).toBe('accepted');
    expect(InvitationStatus.EXPIRED).toBe('expired');
    expect(InvitationStatus.REVOKED).toBe('revoked');
  });

  it('should define ServiceAccountStatus values', () => {
    expect(ServiceAccountStatus.ACTIVE).toBe('active');
    expect(ServiceAccountStatus.DISABLED).toBe('disabled');
  });
});
