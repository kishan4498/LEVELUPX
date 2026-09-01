import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AbuseEvidence } from "./AbuseEvidence";

afterEach(() => {
  cleanup();
});

describe("AbuseEvidence", () => {
  it("makes automatic completion-rule evidence explicit", () => {
    render(
      <AbuseEvidence
        metadata={{
          questId: "quest-1",
          completionsLastHour: 12
        }}
      />
    );

    expect(screen.getByText("Automated completion-rule signal")).toBeInTheDocument();
    expect(screen.getByText("Completions Last Hour")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("distinguishes member-submitted context", () => {
    render(<AbuseEvidence metadata={{ context: "Screenshot available" }} />);

    expect(screen.getByText("Member-submitted evidence")).toBeInTheDocument();
  });
});
