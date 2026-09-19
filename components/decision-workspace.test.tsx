// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { getStockBySymbol } from "@/modules/view-model";

import { DecisionWorkspace } from "./decision-workspace";

afterEach(cleanup);

describe("unavailable fixture decision rendering", () => {
  it.each(["HELI", "KITE"])(
    "renders %s as an explicit unavailable attempt without Jev output",
    (symbol) => {
      const forecast = getStockBySymbol(symbol);
      if (!forecast) throw new Error(`${symbol} fixture missing`);

      const { container } = render(<DecisionWorkspace forecast={forecast} />);

      expect(container.textContent).toContain(
        "No publishable Jev decision exists",
      );
      expect(container.textContent).toContain(forecast.stateMessage);
      expect(container.querySelector(".probability-list")).toBeNull();
      expect(container.querySelector(".action-panel")).toBeNull();
      expect(container.querySelector(".risk-triptych")).toBeNull();
      expect(container.textContent).not.toContain("Jev judgment recorded");
      expect(container.textContent).not.toContain("Policy applied");
      expect(container.textContent).not.toContain("Forecast published");
    },
  );
});
