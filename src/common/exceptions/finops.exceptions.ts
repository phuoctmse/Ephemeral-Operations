import { NotFoundException } from '@nestjs/common';

export class UnauthorizedInstanceTypeError extends Error {
  constructor(instanceType: string) {
    super(
      `Instance type "${instanceType}" is not allowed. Only t3.micro and t4g.nano are permitted.`,
    );
    this.name = 'UnauthorizedInstanceTypeError';
  }
}

export class ConcurrencyLimitError extends Error {
  constructor(max: number) {
    super(
      `Maximum concurrent environments (${max}) reached. Please destroy an existing environment first.`,
    );
    this.name = 'ConcurrencyLimitError';
  }
}

export class TtlExceededError extends Error {
  constructor(requestedTtl: number, maxTtl: number) {
    super(
      `Requested TTL of ${requestedTtl}h exceeds maximum allowed of ${maxTtl}h. It will be overridden.`,
    );
    this.name = 'TtlExceededError';
  }
}

export class EnvironmentNotFoundError extends NotFoundException {
  constructor(id: string) {
    super(`Environment with id "${id}" not found.`);
  }
}

export class ProvisioningError extends Error {
  constructor(message: string) {
    super(`Provisioning failed: ${message}`);
    this.name = 'ProvisioningError';
  }
}
