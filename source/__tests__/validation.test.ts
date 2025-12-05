import { validatePort, validatePid } from '../utils/validation.js';

describe('validatePort', () => {
  describe('valid ports', () => {
    it('should accept port 1', () => {
      expect(validatePort(1)).toEqual({ valid: true });
    });

    it('should accept port 80', () => {
      expect(validatePort(80)).toEqual({ valid: true });
    });

    it('should accept port 3000', () => {
      expect(validatePort(3000)).toEqual({ valid: true });
    });

    it('should accept port 65535', () => {
      expect(validatePort(65535)).toEqual({ valid: true });
    });

    it('should accept string port "3000"', () => {
      expect(validatePort('3000')).toEqual({ valid: true });
    });
  });

  describe('invalid ports', () => {
    it('should reject port 0', () => {
      const result = validatePort(0);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Port must be between 1 and 65535');
    });

    it('should reject negative ports', () => {
      expect(validatePort(-1).valid).toBe(false);
      expect(validatePort(-3000).valid).toBe(false);
    });

    it('should reject ports above 65535', () => {
      expect(validatePort(65536).valid).toBe(false);
      expect(validatePort(100000).valid).toBe(false);
    });

    it('should reject non-integer values', () => {
      const result = validatePort(3000.5);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Port must be a whole number');
    });

    it('should reject NaN', () => {
      const result = validatePort(NaN);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Please enter a valid number');
    });

    it('should reject non-numeric strings', () => {
      expect(validatePort('abc').valid).toBe(false);
      expect(validatePort('').valid).toBe(false);
      expect(validatePort('3000abc').valid).toBe(false);
    });

    it('should reject whitespace-only strings', () => {
      const result = validatePort('   ');
      expect(result.valid).toBe(false);
    });
  });
});

describe('validatePid', () => {
  describe('valid PIDs', () => {
    it('should accept positive integers', () => {
      expect(validatePid(1)).toBe(true);
      expect(validatePid(12345)).toBe(true);
      expect(validatePid(99999)).toBe(true);
    });
  });

  describe('invalid PIDs', () => {
    it('should reject 0', () => {
      expect(validatePid(0)).toBe(false);
    });

    it('should reject negative numbers', () => {
      expect(validatePid(-1)).toBe(false);
      expect(validatePid(-12345)).toBe(false);
    });

    it('should reject non-integers', () => {
      expect(validatePid(1.5)).toBe(false);
      expect(validatePid(12345.67)).toBe(false);
    });

    it('should reject NaN', () => {
      expect(validatePid(NaN)).toBe(false);
    });

    it('should reject Infinity', () => {
      expect(validatePid(Infinity)).toBe(false);
      expect(validatePid(-Infinity)).toBe(false);
    });
  });
});
