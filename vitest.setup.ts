import "@testing-library/jest-dom/vitest";

// Integration tests hit a real, disposable database — never the dev one.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:password@localhost:5432/reymen_ops_test";
