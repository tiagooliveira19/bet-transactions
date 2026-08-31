import { describe, expect, it } from "bun:test";
import { isLockConflict } from "./persistence.context";

describe("isLockConflict", () => {
  it("detects postgres deadlock and lock timeout codes", () => {
    expect(isLockConflict({ code: "40P01" })).toBe(true);
    expect(isLockConflict({ code: "55P03" })).toBe(true);
    expect(isLockConflict({ code: "40001" })).toBe(true);
    expect(isLockConflict({ cause: { code: "40P01" } })).toBe(true);
  });

  it("ignores unique violations and plain errors", () => {
    expect(isLockConflict({ code: "23505" })).toBe(false);
    expect(isLockConflict(new Error("boom"))).toBe(false);
  });
});
