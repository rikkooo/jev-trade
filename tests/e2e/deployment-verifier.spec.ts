import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { expect, test } from "@playwright/test";

const execFileAsync = promisify(execFile);

test("the release verifier accepts the standalone production artifact", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "run the release gate once");
  const { stdout } = await execFileAsync(
    "pnpm",
    ["verify:deployment", "--", "http://127.0.0.1:3000"],
    {
      cwd: process.cwd(),
      timeout: 60_000,
      env: process.env,
    },
  );
  const receipt = stdout.trim().split("\n").at(-1);
  expect(receipt).toBeTruthy();
  expect(JSON.parse(receipt ?? "{}")).toMatchObject({ ok: true });
});
