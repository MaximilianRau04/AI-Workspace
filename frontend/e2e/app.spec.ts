import { expect, test, type Page } from "@playwright/test";

// Runs serially against one fresh database: the first account registered
// becomes the admin, later ones are regular users. Registration is rate-limited
// to 5 accounts per IP and hour, so keep the number of new accounts small.
test.describe.configure({ mode: "serial" });

const PASSWORD = "testpass123";
const admin = `admin_${Date.now()}`;
const member = `member_${Date.now()}`;

async function register(page: Page, username: string): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Register" }).first().click();
  await page.getByPlaceholder("at least 3 characters").fill(username);
  await page.getByPlaceholder("at least 6 characters").fill(PASSWORD);
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.locator("form").getByRole("button", { name: "Register" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function login(page: Page, username: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByPlaceholder("your username").fill(username);
  await page.getByPlaceholder("your password").fill(password);
  await page.locator("form").getByRole("button", { name: "Login" }).click();
}

async function openAccountMenu(page: Page, username: string): Promise<void> {
  const account = page.getByRole("button", { name: username });
  await expect(account).toBeAttached();
  // The sidebar starts collapsed (translated off-screen) on fresh sessions.
  const onScreen = await account.evaluate(
    (el) => el.getBoundingClientRect().right > 0,
  );
  if (!onScreen) {
    await page.getByRole("button", { name: "Toggle sidebar" }).click();
    await expect(account).toBeInViewport();
  }
  await account.click();
}

async function openSettings(page: Page, username: string): Promise<void> {
  await openAccountMenu(page, username);
  await page.getByRole("button", { name: "Settings" }).click();
}

test("unauthenticated users are redirected to the login page", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByPlaceholder("your username")).toBeVisible();
});

test("first registered user is admin and sees global settings", async ({
  page,
}) => {
  await register(page, admin);
  await openSettings(page, admin);
  for (const tab of ["System Prompt", "Model", "MCP Servers"]) {
    await expect(page.getByRole("button", { name: tab })).toBeVisible();
  }
});

test("regular users do not see admin-only settings", async ({ page }) => {
  await register(page, member);
  await openSettings(page, member);
  await expect(page.getByRole("button", { name: "Profile" })).toBeVisible();
  for (const tab of ["System Prompt", "Model", "MCP Servers"]) {
    await expect(page.getByRole("button", { name: tab })).toHaveCount(0);
  }
});

test("wrong password shows an error and keeps the user logged out", async ({
  page,
}) => {
  await login(page, member, "wrong-password");
  await expect(
    page.getByText("Falscher Benutzername oder Passwort"),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("login and logout round trip", async ({ page }) => {
  await login(page, member);
  await expect(page).not.toHaveURL(/\/login/);
  await openAccountMenu(page, member);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
