import { describe, expect, it } from "vitest";
import { findPrivateInfo, maskFinding } from "@/utils/privacy-check";

const kinds = (content: string) => findPrivateInfo(content).map((finding) => finding.kind);

describe("findPrivateInfo", () => {
  it("finds phone, ID and bank card numbers, each under one kind", () => {
    expect(findPrivateInfo("电话 138 1234 5678，身份证 11010519491231002X，卡号 4111 1111 1111 1111")).toEqual([
      { kind: "id-card", text: "11010519491231002X" },
      { kind: "phone", text: "138 1234 5678" },
      { kind: "bank-card", text: "4111 1111 1111 1111" },
    ]);
  });

  it("ignores long numbers that fail their check digits", () => {
    expect(kinds("订单号 110105194912310021，流水 4111 1111 1111 1112")).toEqual([]);
  });

  it("finds keys, tokens and secret assignments, but not placeholders or prose", () => {
    const token = `ghp_${"a1".repeat(18)}`;
    expect(findPrivateInfo(`token: ${token}`)).toEqual([{ kind: "secret", text: token }]);
    expect(findPrivateInfo("password = hunter22")).toEqual([{ kind: "secret", text: "hunter22" }]);
    expect(kinds(`key sk-ant-api03-${"x".repeat(30)}`)).toEqual(["secret"]);
    expect(kinds("-----BEGIN OPENSSH PRIVATE KEY-----")).toEqual(["private-key"]);
    expect(kinds("api_key: <your-key>")).toEqual([]);
    expect(kinds("token：词元是模型处理文本的基本单位")).toEqual([]);
  });

  it("finds email and LAN addresses, skipping example domains and public addresses", () => {
    expect(findPrivateInfo("联系 zhang.san@qq.com 或 test@example.com，路由器 192.168.1.1，公网 8.8.8.8")).toEqual([
      { kind: "email", text: "zhang.san@qq.com" },
      { kind: "private-ip", text: "192.168.1.1" },
    ]);
  });
});

describe("maskFinding", () => {
  it("keeps enough to recognise each finding", () => {
    expect(maskFinding({ kind: "phone", text: "+86 138 1234 5678" })).toBe("138****5678");
    expect(maskFinding({ kind: "id-card", text: "11010519491231002X" })).toBe("110***********002X");
    expect(maskFinding({ kind: "email", text: "zhang.san@qq.com" })).toBe("z***@qq.com");
    expect(maskFinding({ kind: "secret", text: "hunter22" })).toBe("hunt…");
  });
});
