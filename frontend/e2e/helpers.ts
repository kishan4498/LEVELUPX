import { expect, type Page } from "@playwright/test";

function hasReactProps(element: HTMLElement) {
  return Object.keys(element).some((key) => key.startsWith("__reactProps$"));
}

export async function submitPasswordLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await waitForFormHydration(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

export async function waitForFormHydration(page: Page) {
  const emailInput = page.getByLabel("Email");
  await expect(emailInput).toBeVisible();

  // Filling too early lets hydration restore the server-rendered empty value.
  await expect
    .poll(() => emailInput.evaluate(hasReactProps))
    .toBe(true);
}
