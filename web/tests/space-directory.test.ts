import { create } from "@bufbuild/protobuf";
import { beforeEach, describe, expect, it } from "vitest";
import { SpaceMember_Role, SpaceSchema } from "@/types/proto/api/v1/space_service_pb";
import {
  isJoinedSpace,
  matchesSpace,
  pickSwitcherSpaces,
  readRecentSpaces,
  recordRecentSpace,
  SWITCHER_RECENT_LIMIT,
  sampleSpaces,
} from "@/utils/space-directory";

const space = (uid: string, title = uid, role = SpaceMember_Role.ROLE_UNSPECIFIED) =>
  create(SpaceSchema, { name: `spaces/${uid}`, title, description: `About ${title}`, currentUserRole: role });

describe("space directory", () => {
  beforeEach(() => localStorage.clear());

  it("remembers recently opened Spaces per viewer, newest first", () => {
    recordRecentSpace("users/1", "spaces/a");
    recordRecentSpace("users/1", "spaces/b");
    recordRecentSpace("users/1", "spaces/a");
    expect(readRecentSpaces("users/1")).toEqual(["spaces/a", "spaces/b"]);
    expect(readRecentSpaces("users/2")).toEqual([]);
    for (let index = 0; index < 10; index++) recordRecentSpace("users/1", `spaces/${index}`);
    expect(readRecentSpaces("users/1")).toHaveLength(SWITCHER_RECENT_LIMIT);
  });

  it("lists the current Space, then recent ones that still exist", () => {
    const spaces = [space("a"), space("b"), space("c")];
    const byName = new Map(spaces.map((item) => [item.name, item]));
    expect(pickSwitcherSpaces(byName, ["spaces/b", "spaces/gone", "spaces/c"], "spaces/c").map((item) => item.name)).toEqual([
      "spaces/c",
      "spaces/b",
    ]);
  });

  it("searches title, description and ID, and tells joined Spaces apart", () => {
    const joined = space("design", "设计组", SpaceMember_Role.USER);
    expect(matchesSpace(joined, "设计")).toBe(true);
    expect(matchesSpace(joined, "ABOUT")).toBe(true);
    expect(matchesSpace(joined, "design")).toBe(true);
    expect(matchesSpace(joined, "marketing")).toBe(false);
    expect(isJoinedSpace(joined)).toBe(true);
    expect(isJoinedSpace(space("open"))).toBe(false);
  });

  it("samples without repeats", () => {
    const spaces = [space("a"), space("b"), space("c")];
    const picked = sampleSpaces(spaces, 2, () => 0);
    expect(picked.map((item) => item.name)).toEqual(["spaces/a", "spaces/b"]);
    expect(sampleSpaces(spaces, 10)).toHaveLength(3);
  });
});
