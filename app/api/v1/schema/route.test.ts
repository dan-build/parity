import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/v1/schema", () => {
  it("publishes the response contract with field descriptions", async () => {
    const s = await GET().json();
    expect(s.type).toBe("object");
    for (const k of ["verdict", "answer", "reference", "best_way_in", "tokens", "cant_tell", "data", "disclaimer"]) expect(s.properties).toHaveProperty(k);
    expect(s.properties.verdict.enum).toEqual(["FAIR", "RICH", "THIN", "GHOST"]);
    expect(JSON.stringify(s)).toContain("Show it to the user");
  });
});
