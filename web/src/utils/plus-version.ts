export type ReleaseChannel = "stable" | "preview" | "dev";

export interface PlusVersionInfo {
  /** The Memos Plus version, e.g. "1.2.0", "1.2.0-rc.1" or "1.0.0-dev". */
  plus: string;
  /** The Memos release the build is based on, when the server reports one. */
  upstream?: string;
  channel: ReleaseChannel;
  /** The release tag on GitHub; only tagged builds (vX.Y.Z or vX.Y.Z-rc.N) have one. */
  releaseTag?: string;
  /** The upstream Memos release tag, when the base is a released version. */
  upstreamTag?: string;
}

const TAGGED_VERSION = /^\d+\.\d+\.\d+(-rc\.\d+)?$/;
// Images built from main between releases (build-canary-image.yml): a preview, but with no release page.
const CANARY_VERSION = /^\d+\.\d+\.\d+-canary\.[0-9a-f]+$/;
const RELEASED_UPSTREAM = /^\d+\.\d+\.\d+$/;
// The server reports "<plus> (based on Memos <upstream>)", see internal/version.GetDisplayVersion.
const DISPLAY_VERSION = /^(\S+)\s+\(based on Memos\s+([^)\s]+)\)$/;

/** Splits the server's display version into the Memos Plus release and the Memos release it is based on. */
export const parsePlusVersion = (raw: string): PlusVersionInfo | undefined => {
  const value = raw.trim();
  if (!value) return undefined;
  const match = DISPLAY_VERSION.exec(value);
  const plus = match ? match[1] : value;
  const upstream = match ? match[2] : undefined;
  const tagged = TAGGED_VERSION.test(plus);
  return {
    plus,
    upstream,
    channel: CANARY_VERSION.test(plus) ? "preview" : !tagged ? "dev" : plus.includes("-") ? "preview" : "stable",
    releaseTag: tagged ? `v${plus}` : undefined,
    upstreamTag: upstream && RELEASED_UPSTREAM.test(upstream) ? `v${upstream}` : undefined,
  };
};
