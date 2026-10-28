import { describe, expect, it } from "vitest";
import { parsePlusVersion } from "@/utils/plus-version";

describe("parsePlusVersion", () => {
  it("splits a release build into the Plus and Memos versions", () => {
    expect(parsePlusVersion("1.2.0 (based on Memos 0.34.1)")).toEqual({
      plus: "1.2.0",
      upstream: "0.34.1",
      channel: "stable",
      releaseTag: "v1.2.0",
      upstreamTag: "v0.34.1",
    });
  });

  it("treats release candidates as previews with a release page", () => {
    expect(parsePlusVersion("1.3.0-rc.2 (based on Memos 0.34.1)")).toMatchObject({ channel: "preview", releaseTag: "v1.3.0-rc.2" });
  });

  it("calls canary images previews, with no release page", () => {
    expect(parsePlusVersion("1.0.0-canary.ab12cd3 (based on Memos 0.34.1)")).toMatchObject({ channel: "preview", releaseTag: undefined });
  });

  it("gives source builds no release links", () => {
    expect(parsePlusVersion("1.0.0-dev (based on Memos 0.34.x-dev)")).toEqual({
      plus: "1.0.0-dev",
      upstream: "0.34.x-dev",
      channel: "dev",
      releaseTag: undefined,
      upstreamTag: undefined,
    });
    expect(parsePlusVersion("manual-abc1234 (based on Memos 0.34.1)")).toMatchObject({ channel: "dev", releaseTag: undefined });
  });

  it("accepts a bare version and an empty one", () => {
    expect(parsePlusVersion("1.1.0")).toMatchObject({ plus: "1.1.0", upstream: undefined, channel: "stable" });
    expect(parsePlusVersion("")).toBeUndefined();
  });
});
