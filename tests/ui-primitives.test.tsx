// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { SectionHeader } from "@/components/ui/section-header";
import { StatRow } from "@/components/ui/stat-row";
import { InsightChip } from "@/components/ui/insight-chip";

describe("SectionHeader", () => {
  it("renders the title", () => {
    render(<SectionHeader title="כותרת" />);
    expect(screen.getByText("כותרת")).toBeDefined();
  });

  it("renders trailing slot only when provided", () => {
    const { rerender } = render(<SectionHeader title="A" />);
    expect(screen.queryByText("Tag")).toBeNull();
    rerender(<SectionHeader title="A" trailing={<span>Tag</span>} />);
    expect(screen.getByText("Tag")).toBeDefined();
  });

  it("hides icon slot when no icon passed", () => {
    const { container } = render(<SectionHeader title="A" />);
    expect(container.querySelector("[aria-hidden]")).toBeNull();
  });
});

describe("StatRow", () => {
  it("renders label + value", () => {
    render(<StatRow label="לייבל" value="42" />);
    expect(screen.getByText("לייבל")).toBeDefined();
    expect(screen.getByText("42")).toBeDefined();
  });

  it("renders the sub line when provided", () => {
    render(<StatRow label="L" value="V" sub="extra" />);
    expect(screen.getByText("extra")).toBeDefined();
  });

  it("applies tone class for value", () => {
    const { container } = render(<StatRow label="L" value="V" tone="success" />);
    const value = container.querySelector("[data-mono='true']");
    expect(value?.className).toContain("#34D399");
  });
});

describe("InsightChip", () => {
  it("renders label + value", () => {
    render(<InsightChip label="Burn" value="88%" />);
    expect(screen.getByText("Burn")).toBeDefined();
    expect(screen.getByText("88%")).toBeDefined();
  });

  it("renders nothing extra when no label/value", () => {
    const { container } = render(<InsightChip />);
    const span = container.querySelector("span");
    expect(span?.children.length).toBe(0);
  });

  it("each severity yields its tone palette", () => {
    const { container, rerender } = render(<InsightChip severity="info" label="i" />);
    const initial = container.firstChild as HTMLElement;
    expect(initial.className).toContain("[#34D399]");
    rerender(<InsightChip severity="critical" label="c" />);
    const after = container.firstChild as HTMLElement;
    expect(after.className).toContain("destructive");
  });
});
