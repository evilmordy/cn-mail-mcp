import { describe, expect, it } from "vitest";
import { elicitationSupport } from "./capabilities.js";

describe("elicitationSupport", () => {
  it("treats a missing declaration as no elicitation", () => {
    expect(elicitationSupport(undefined)).toEqual({ form: false, url: false });
    expect(elicitationSupport({})).toEqual({ form: false, url: false });
  });

  it("treats a bare elicitation object as form only", () => {
    expect(elicitationSupport({ elicitation: {} })).toEqual({ form: true, url: false });
  });

  it("honors explicit form and url modes", () => {
    expect(elicitationSupport({ elicitation: { form: {}, url: {} } })).toEqual({ form: true, url: true });
    expect(elicitationSupport({ elicitation: { url: {} } })).toEqual({ form: false, url: true });
    expect(elicitationSupport({ elicitation: { form: {} } })).toEqual({ form: true, url: false });
  });
});
