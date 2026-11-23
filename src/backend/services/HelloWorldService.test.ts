import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { HelloWorldService } from "./HelloWorldService";

describe("HelloWorldService", () => {
  it("returns the greeting", async () => {
    const service = new HelloWorldService();

    await expect(service.runHelloWorld()).resolves.toBe("Hello, world!");
  });

  it("always returns the same greeting, however many times it is called", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 50 }), async (callCount) => {
        const service = new HelloWorldService();

        const results = await Promise.all(
          Array.from({ length: callCount }, () => service.runHelloWorld()),
        );

        expect(results.every((result) => result === "Hello, world!")).toBe(
          true,
        );
      }),
    );
  });
});
