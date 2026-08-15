import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LocalePicker from "@/components/LocalePicker";
import ThemeSelect from "@/components/ThemeSelect";

describe("compact toolbar controls", () => {
  it("renders the locale picker as a small icon button", () => {
    render(<LocalePicker value="zh-Hans" onChange={() => {}} iconOnly />);

    const trigger = screen.getByRole("button", { name: /Language:/ });
    expect(trigger).toHaveClass("bg-transparent", "shadow-none");
    expect(trigger).not.toHaveClass("border");
    expect(trigger.querySelectorAll("svg")).toHaveLength(1);
    expect(trigger).not.toHaveTextContent("中文（简体）");
  });

  it("renders the active theme as a small icon trigger", () => {
    render(<ThemeSelect value="twilight-dark" onValueChange={() => {}} iconOnly />);

    const trigger = screen.getByRole("combobox", { name: "Theme: Twilight" });
    expect(trigger).toHaveClass("border-0", "bg-transparent", "shadow-none");
    expect(trigger.querySelectorAll("svg")).toHaveLength(1);
    expect(trigger).not.toHaveTextContent("Twilight");
  });
});
