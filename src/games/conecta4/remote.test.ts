import { describe, expect, it } from "vitest";
import { makeRoomCode } from "./remote";

describe("códigos de sala", () => {
  it("genera códigos de 5 caracteres sin letras/dígitos confusos", () => {
    for (let i = 0; i < 100; i++) {
      const code = makeRoomCode();
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]{5}$/);
    }
  });
  it("genera códigos distintos entre sí (con altísima probabilidad)", () => {
    const codes = new Set(Array.from({ length: 50 }, () => makeRoomCode()));
    expect(codes.size).toBeGreaterThan(45);
  });
});
