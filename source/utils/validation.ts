export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validatePort(value: string | number): ValidationResult {
  let port: number;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    // Check if the string contains only digits
    if (!/^\d+$/.test(trimmed)) {
      return { valid: false, error: 'Please enter a valid number' };
    }
    port = parseInt(trimmed, 10);
  } else {
    port = value;
  }

  if (isNaN(port)) {
    return { valid: false, error: 'Please enter a valid number' };
  }

  if (!Number.isInteger(port)) {
    return { valid: false, error: 'Port must be a whole number' };
  }

  if (port < 1 || port > 65535) {
    return { valid: false, error: 'Port must be between 1 and 65535' };
  }

  return { valid: true };
}

export function validatePid(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}
