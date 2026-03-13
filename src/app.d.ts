declare global {
  namespace App {
    interface Locals {
      session: {
        user: unknown;
      } | null;
    }
  }
}

export {};

