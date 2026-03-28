import { hasPermission, BUILT_IN_ROLES, IamPermission } from './types';

describe('IAM Permission Evaluation', () => {
  describe('hasPermission', () => {
    it('should match exact permission', () => {
      const granted: IamPermission[] = ['compute:create', 'database:read'];
      expect(hasPermission(granted, 'compute:create')).toBe(true);
      expect(hasPermission(granted, 'database:read')).toBe(true);
    });

    it('should deny non-matching permission', () => {
      const granted: IamPermission[] = ['compute:create'];
      expect(hasPermission(granted, 'compute:delete')).toBe(false);
      expect(hasPermission(granted, 'database:create')).toBe(false);
    });

    it('should support full wildcard (*:*)', () => {
      const granted: IamPermission[] = ['*:*'];
      expect(hasPermission(granted, 'compute:create')).toBe(true);
      expect(hasPermission(granted, 'database:delete')).toBe(true);
      expect(hasPermission(granted, 'iam:manage')).toBe(true);
    });

    it('should support domain wildcard (compute:*)', () => {
      const granted: IamPermission[] = ['compute:*'];
      expect(hasPermission(granted, 'compute:create')).toBe(true);
      expect(hasPermission(granted, 'compute:delete')).toBe(true);
      expect(hasPermission(granted, 'database:create')).toBe(false);
    });

    it('should support action wildcard (*:read)', () => {
      const granted: IamPermission[] = ['*:read'];
      expect(hasPermission(granted, 'compute:read')).toBe(true);
      expect(hasPermission(granted, 'database:read')).toBe(true);
      expect(hasPermission(granted, 'compute:create')).toBe(false);
    });

    it('should return false for empty grants', () => {
      expect(hasPermission([], 'compute:create')).toBe(false);
    });

    it('should work with multiple grants', () => {
      const granted: IamPermission[] = ['compute:read', 'database:*', 'storage:create'];
      expect(hasPermission(granted, 'compute:read')).toBe(true);
      expect(hasPermission(granted, 'compute:create')).toBe(false);
      expect(hasPermission(granted, 'database:create')).toBe(true);
      expect(hasPermission(granted, 'database:delete')).toBe(true);
      expect(hasPermission(granted, 'storage:create')).toBe(true);
      expect(hasPermission(granted, 'storage:delete')).toBe(false);
    });
  });

  describe('BUILT_IN_ROLES', () => {
    it('should define tenant-admin with full wildcard', () => {
      const role = BUILT_IN_ROLES['tenant-admin'];
      expect(role).toBeDefined();
      expect(role.permissions).toContain('*:*');
    });

    it('should define developer role with compute and storage access', () => {
      const role = BUILT_IN_ROLES['developer'];
      expect(role).toBeDefined();
      expect(role.permissions).toContain('compute:create');
      expect(role.permissions).toContain('storage:create');
      expect(role.permissions).toContain('database:read');
      // Developer should NOT have iam:manage
      expect(role.permissions).not.toContain('iam:manage');
    });

    it('should define billing-admin role', () => {
      const role = BUILT_IN_ROLES['billing-admin'];
      expect(role).toBeDefined();
      expect(role.permissions).toContain('billing:read');
      expect(role.permissions).toContain('iam:read');
    });

    it('should define read-only role with read wildcard', () => {
      const role = BUILT_IN_ROLES['read-only'];
      expect(role).toBeDefined();
      expect(role.permissions).toContain('*:read');
    });

    it('should have exactly 4 built-in roles', () => {
      expect(Object.keys(BUILT_IN_ROLES)).toHaveLength(4);
    });
  });
});
