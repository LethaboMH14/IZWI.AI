import { afterEach, describe, expect, it } from "vitest";
import { connectionsEnabled } from "../src/server/flags";

describe("connections feature flag", () => {
  afterEach(() => { delete process.env.IZWI_FLAG_CONNECTIONS; });

  it("is off unless the server flag is exactly 1", () => {
    delete process.env.IZWI_FLAG_CONNECTIONS;
    expect(connectionsEnabled()).toBe(false);
    process.env.IZWI_FLAG_CONNECTIONS = "true";
    expect(connectionsEnabled()).toBe(false);
    process.env.IZWI_FLAG_CONNECTIONS = "1";
    expect(connectionsEnabled()).toBe(true);
  });
});
