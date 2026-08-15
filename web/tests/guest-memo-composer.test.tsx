import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import GuestMemoComposer from "@/components/GuestMemoComposer";

const navigateTo = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useNavigateTo", () => ({ default: () => navigateTo }));
vi.mock("@/utils/i18n", () => ({ useTranslate: () => (key: string) => key }));

it("shows the composer to visitors and redirects to sign in when used", () => {
  render(
    <MemoryRouter initialEntries={["/explore?page=2"]}>
      <GuestMemoComposer />
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByTestId("guest-memo-composer"));
  expect(navigateTo).toHaveBeenCalledWith("/auth?redirect=%2Fexplore%3Fpage%3D2");
});
