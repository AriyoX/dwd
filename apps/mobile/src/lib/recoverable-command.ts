import { DataAccessError } from '@dwd/data';

// A response lost on mobile data must reuse both the payload and its request
// ID. Only a definite database rejection makes the form editable again.
export class RecoverableCommand<T> {
  private value: T | null = null;
  get pending() {
    return this.value !== null;
  }
  capture(create: () => T): T {
    return (this.value ??= create());
  }
  complete() {
    this.value = null;
  }
  reject(error: unknown) {
    if (error instanceof DataAccessError && error.code && /^[0-9A-Z]{5}$/.test(error.code))
      this.complete();
  }
}
