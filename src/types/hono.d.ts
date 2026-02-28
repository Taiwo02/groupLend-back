declare module "hono" {
  interface ContextVariableMap {
    userId: string;
    userEmail: string;
  }
}

export {};
