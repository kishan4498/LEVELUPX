import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./Button";

describe("Button", () => {
  it("keeps native button behavior while applying a visual intent", () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} type="button" variant="secondary">
        Start focus
      </Button>
    );

    fireEvent.click(screen.getByRole("button", { name: "Start focus" }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole("button")).toHaveClass("bg-mint");
  });
});
