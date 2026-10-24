import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = (process.env.VISUAL_REVIEW_URL ?? "http://localhost:3000")
  .replace(/\/$/, "");
const outputDir = path.resolve(
  process.env.VISUAL_REVIEW_DIR ?? "/tmp/mapsilip-visual-review",
);
const viewports = [
  { name: "mobile", width: 375, height: 812 },
  { name: "desktop", width: 1440, height: 1000 },
];
const areas = [
  { name: "tenant", nav: "Tenant navigation", internalPath: "/tenant/payments", internalLink: "Payments", otherArea: "management" },
  { name: "management", nav: "Management navigation", internalPath: "/management/tenants", internalLink: "Tenants", otherArea: "tenant" },
];
const caretakerRoutes = [
  { path: "/caretaker", name: "dashboard", heading: "Dashboard" },
  { path: "/caretaker/maintenance", name: "maintenance", heading: "Maintenance Requests" },
  { path: "/caretaker/notifications", name: "notifications", heading: "Notifications" },
  { path: "/caretaker/profile", name: "profile", heading: "Profile Settings" },
];

async function hideNextDevOverlay(page) {
  await page.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((node) => node.remove()));
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
let failed = false;

try {
  for (const viewport of viewports) {
    for (const area of areas) {
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: "light",
        reducedMotion: "no-preference",
      });
      const errors = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));

      const response = await page.goto(`${baseUrl}/${area.name}`, {
        waitUntil: "networkidle",
      });
      await hideNextDevOverlay(page);
      const screenshot = path.join(outputDir, `${area.name}-${viewport.name}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      if (viewport.name === "mobile") {
        await page.locator("main").evaluate((main) => {
          main.scrollTop = main.scrollHeight;
        });
        await page.screenshot({
          path: path.join(outputDir, `${area.name}-mobile-bottom.png`),
          fullPage: true,
        });
        await page.locator("main").evaluate((main) => {
          main.scrollTop = 0;
        });
      }

      const metrics = await page.evaluate(() => {
        const main = document.querySelector("main");
        const visibleNavs = [...document.querySelectorAll("nav")]
          .filter((nav) => nav.getClientRects().length > 0)
          .map((nav) => ({
            label: nav.getAttribute("aria-label"),
            links: [...nav.querySelectorAll("a")].map((link) => link.innerText.trim()),
          }));
        const desktopLogo = document.querySelector(".desktop-sidebar .brand__logo");
        const mobileLogo = document.querySelector(".mobile-topbar .brand__mark");
        const brandImage = desktopLogo?.getClientRects().length ? desktopLogo : mobileLogo;
        const brandBox = brandImage?.getBoundingClientRect();
        return {
          heading: document.querySelector("h1")?.innerText,
          viewportWidth: innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
          mainBottom: main?.getBoundingClientRect().bottom,
          visibleNavs,
          brandLogo: brandImage instanceof HTMLImageElement && brandBox
            ? {
              src: brandImage.getAttribute("src"),
              naturalWidth: brandImage.naturalWidth,
              naturalHeight: brandImage.naturalHeight,
              ratioDifference: Math.abs(brandBox.width / brandBox.height - brandImage.naturalWidth / brandImage.naturalHeight),
            }
            : null,
          visiblePrototypeCopy: /preview|prototype|sample screens|illustrative/i.test(document.body.innerText),
        };
      });

      await page.keyboard.press("Tab");
      const focus = await page.evaluate(() => ({
        text: document.activeElement?.textContent?.trim(),
        outlineStyle: getComputedStyle(document.activeElement).outlineStyle,
        outlineWidth: getComputedStyle(document.activeElement).outlineWidth,
      }));

      const notificationTrigger = page.getByRole("button", { name: "Notifications" });
      const notificationPanel = page.locator(`#${await notificationTrigger.getAttribute("aria-controls")}`);
      await notificationTrigger.click();
      await notificationPanel.waitFor({ state: "visible" });
      await page.waitForTimeout(180);
      const notificationScreenshot = path.join(outputDir, `${area.name}-${viewport.name}-notifications-open.png`);
      await page.screenshot({ path: notificationScreenshot, fullPage: true });
      const notificationMotion = await notificationPanel.evaluate((panel) => getComputedStyle(panel).transitionDuration);
      await page.locator("h1").click();
      const outsideDismissed = await notificationPanel.getAttribute("aria-hidden") === "true";
      await notificationTrigger.click();
      await page.keyboard.press("Escape");
      const notificationEscapeDismissed = await notificationPanel.getAttribute("aria-hidden") === "true";
      const notificationFocusRestored = await notificationTrigger.evaluate((trigger) => trigger === document.activeElement);

      const profileTrigger = page.getByRole("button", { name: "Profile options" });
      const profileMenu = page.locator(`#${await profileTrigger.getAttribute("aria-controls")}`);
      await profileTrigger.focus();
      await page.keyboard.press("Enter");
      const menuItems = profileMenu.getByRole("menuitem");
      await menuItems.first().waitFor({ state: "visible" });
      await page.waitForFunction((menuId) => document.activeElement === document.querySelector(`#${menuId} [role='menuitem']`), await profileMenu.getAttribute("id"));
      const profileFocusManaged = await menuItems.first().evaluate((item) => item === document.activeElement);
      const profileKeyboardFocusVisible = await menuItems.first().evaluate((item) => getComputedStyle(item).outlineStyle !== "none" && getComputedStyle(item).outlineWidth !== "0px");
      await page.waitForTimeout(180);
      const profileScreenshot = path.join(outputDir, `${area.name}-${viewport.name}-profile-menu-open.png`);
      await page.screenshot({ path: profileScreenshot, fullPage: true });
      await page.keyboard.press("ArrowDown");
      const arrowNavigationWorks = await menuItems.nth(1).evaluate((item) => item === document.activeElement);
      const logoutDisabled = await menuItems.nth(1).getAttribute("aria-disabled") === "true";
      await page.keyboard.press("Enter");
      const logoutDoesNotNavigate = new URL(page.url()).pathname === `/${area.name}` && await profileMenu.getAttribute("aria-hidden") === "false";
      await page.keyboard.press("Escape");
      const profileEscapeDismissed = await profileMenu.getAttribute("aria-hidden") === "true";
      const profileFocusRestored = await profileTrigger.evaluate((trigger) => trigger === document.activeElement);
      await page.emulateMedia({ reducedMotion: "reduce" });
      const reducedMotionDuration = await profileMenu.evaluate((menu) => getComputedStyle(menu).transitionDuration);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      const navigationName = viewport.width < 1000 ? "Primary navigation" : area.nav;
      const nav = page.getByRole("navigation", { name: navigationName });
      const activeAtStart = (await nav.locator('[aria-current="page"]').allTextContents())
        .map((text) => text.trim());
      await nav.getByRole("link", { name: area.internalLink, exact: true }).click();
      await page.waitForURL((url) => url.pathname === area.internalPath);
      const internalNavigation = {
        path: new URL(page.url()).pathname,
        heading: await page.locator("h1").innerText(),
        active: (await nav.locator('[aria-current="page"]').allTextContents())
          .map((text) => text.trim()),
      };
      const switchLink = viewport.width < 1000
        ? page.getByRole("navigation", { name: "Switch workspace" })
          .getByRole("link", { name: area.otherArea === "tenant" ? "Tenant" : "Management", exact: true })
        : page.locator(".desktop-sidebar").getByRole("link", {
          name: area.otherArea === "tenant" ? "Tenant home" : "Management workspace",
          exact: true,
        });
      await switchLink.click();
      await page.waitForURL((url) => url.pathname === `/${area.otherArea}`);

      const focusVisible = focus.outlineStyle !== "none" && focus.outlineWidth !== "0px";
      const result = {
        area: area.name,
        viewport: `${viewport.width}x${viewport.height}`,
        status: response?.status(),
        screenshot,
        metrics,
        focus,
        focusVisible,
        popupChecks: {
          notificationScreenshot,
          profileScreenshot,
          notificationMotion,
          outsideDismissed,
          notificationEscapeDismissed,
          notificationFocusRestored,
          profileFocusManaged,
          profileKeyboardFocusVisible,
          arrowNavigationWorks,
          logoutDisabled,
          logoutDoesNotNavigate,
          profileEscapeDismissed,
          profileFocusRestored,
          reducedMotionDuration,
        },
        activeAtStart,
        internalNavigation,
        modeSwitchPath: new URL(page.url()).pathname,
        errors,
      };
      results.push(result);
      if (
        result.status !== 200 ||
        metrics.horizontalOverflow ||
        !metrics.brandLogo ||
        metrics.brandLogo.naturalWidth === 0 ||
        metrics.brandLogo.ratioDifference > 0.02 ||
        metrics.brandLogo.src !== (viewport.width < 1000 ? "/mapsilip-logo-mark.svg" : "/mapsilip-logo-combi.svg") ||
        metrics.visiblePrototypeCopy ||
        !focusVisible ||
        notificationMotion === "0s" ||
        !outsideDismissed ||
        !notificationEscapeDismissed ||
        !notificationFocusRestored ||
        !profileFocusManaged ||
        !profileKeyboardFocusVisible ||
        !arrowNavigationWorks ||
        !logoutDisabled ||
        !logoutDoesNotNavigate ||
        !profileEscapeDismissed ||
        !profileFocusRestored ||
        reducedMotionDuration !== "0s" ||
        activeAtStart.length !== 1 ||
        internalNavigation.active.length !== 1 ||
        result.modeSwitchPath !== `/${area.otherArea}` ||
        errors.length > 0
      ) failed = true;
      await page.close();
    }
  }

  for (const viewport of viewports) {
    for (const theme of ["light", "dark"]) {
      for (const portal of [
        { area: "tenant", from: "/tenant", target: "/tenant/payments" },
        { area: "management", from: "/management", target: "/management/rooms" },
        { area: "caretaker", from: "/caretaker", target: "/caretaker/maintenance" },
      ]) {
        const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: theme, reducedMotion: "no-preference" });
        const errors = [];
        page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
        page.on("pageerror", (error) => errors.push(error.message));
        const response = await page.goto(`${baseUrl}${portal.from}`, { waitUntil: "networkidle" });
        await hideNextDevOverlay(page);
        const initial = await page.locator(".portal-page-content").evaluate((node) => ({ entering: node.classList.contains("portal-page-content--enter"), duration: getComputedStyle(node).animationDuration }));
        const nav = page.locator(viewport.width < 1000 ? ".mobile-nav" : ".side-nav");
        const startedAt = Date.now();
        await nav.locator(`a[href="${portal.target}"]`).click();
        await page.waitForURL((url) => url.pathname === portal.target);
        await page.locator(".portal-page-content--enter").waitFor({ state: "attached" });
        const navigationMs = Date.now() - startedAt;
        const entered = await page.locator(".portal-page-content").evaluate((node) => ({ entering: node.classList.contains("portal-page-content--enter"), duration: getComputedStyle(node).animationDuration }));
        const notificationTrigger = page.getByRole("button", { name: "Notifications", exact: true });
        await notificationTrigger.click();
        const notificationPanel = page.locator(`#${await notificationTrigger.getAttribute("aria-controls")}`);
        await notificationPanel.getByRole("link", { name: "Open notifications" }).click();
        const notificationPath = `/${portal.area}/notifications`;
        await page.waitForURL((url) => url.pathname === notificationPath);
        await page.locator(".portal-page-content--enter").waitFor({ state: "attached" });
        const notificationLinkTransition = await page.locator(".portal-page-content--enter").evaluate((node) => getComputedStyle(node).animationDuration);
        await page.keyboard.press("Escape");
        const profileTrigger = page.getByRole("button", { name: "Profile options" });
        await profileTrigger.click();
        const profileMenu = page.locator(`#${await profileTrigger.getAttribute("aria-controls")}`);
        await profileMenu.getByRole("menuitem", { name: "Profile" }).click();
        const profilePath = `/${portal.area}/profile`;
        await page.waitForURL((url) => url.pathname === profilePath);
        await page.locator(".portal-page-content--enter").waitFor({ state: "attached" });
        const profileLinkTransition = await page.locator(".portal-page-content--enter").evaluate((node) => getComputedStyle(node).animationDuration);
        const widthIsSafe = await page.evaluate(() => document.documentElement.scrollWidth === innerWidth);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.locator(viewport.width < 1000 ? ".mobile-topbar .brand" : ".desktop-sidebar .brand").click();
        await page.waitForURL((url) => url.pathname === portal.from);
        await page.locator(".portal-page-content--enter").waitFor({ state: "attached" });
        const reduced = await page.locator(".portal-page-content").evaluate((node) => getComputedStyle(node).animationDuration);
        const result = { area: `${portal.area}-page-transition`, viewport: `${viewport.width}x${viewport.height}`, theme, status: response?.status(), initial, entered, notificationLinkTransition, profileLinkTransition, reducedMotionDuration: reduced, navigationMs, widthIsSafe, errors };
        results.push(result);
        if (result.status !== 200 || initial.entering || initial.duration !== "0s" || !entered.entering || entered.duration !== "0.16s" || notificationLinkTransition !== "0.16s" || profileLinkTransition !== "0.16s" || reduced !== "0s" || !widthIsSafe || navigationMs > 1000 || errors.length) failed = true;
        await page.close();
      }

      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: theme, reducedMotion: "no-preference" });
      const errors = [];
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      page.on("pageerror", (error) => errors.push(error.message));
      let response;
      for (const [index, route] of caretakerRoutes.entries()) {
        if (index === 0) response = await page.goto(`${baseUrl}${route.path}`, { waitUntil: "networkidle" });
        else {
          await page.getByRole("navigation", { name: viewport.width < 1000 ? "Primary navigation" : "Caretaker navigation" }).getByRole("link", { name: caretakerRoutes[index - 1].heading === "Dashboard" ? "Maintenance" : caretakerRoutes[index - 1].heading === "Maintenance Requests" ? "Notifications" : "Profile", exact: true }).click();
          await page.waitForURL((url) => url.pathname === route.path);
          response = { status: () => 200 };
        }
        await hideNextDevOverlay(page);
        await page.waitForTimeout(170);
        const screenshot = path.join(outputDir, `caretaker-${route.name}-${viewport.name}-${theme}.png`);
        await page.screenshot({ path: screenshot, fullPage: true });
        const metrics = await page.evaluate(() => ({
          heading: document.querySelector("h1")?.textContent?.trim(),
          overflow: document.documentElement.scrollWidth > innerWidth,
          animationDuration: getComputedStyle(document.querySelector(".portal-page-content")).animationDuration,
          entering: document.querySelector(".portal-page-content")?.classList.contains("portal-page-content--enter"),
          disallowedLabels: [...document.querySelectorAll(".side-nav a, .mobile-nav a")].map((link) => link.textContent?.trim() ?? "").filter((label) => /payment|visitor|tenant|approval/i.test(label)),
        }));
        const activeNav = await page.locator(viewport.width < 1000 ? ".mobile-nav" : ".side-nav").locator('[aria-current="page"]').allTextContents();
        results.push({ route: route.path, viewport: `${viewport.width}x${viewport.height}`, theme, status: response?.status(), screenshot, metrics, activeNav: activeNav.map((text) => text.trim()), errors });
        if (response?.status() !== 200 || metrics.heading !== route.heading || metrics.overflow || metrics.disallowedLabels.length || activeNav.length !== 1 || metrics.animationDuration !== (index === 0 ? "0s" : "0.16s") || metrics.entering !== (index > 0) || errors.length) failed = true;
        if (route.name === "maintenance") {
          const pending = page.getByRole("button", { name: "Pending", exact: true });
          await pending.click();
          const pendingSelected = await pending.getAttribute("aria-pressed") === "true";
          const search = page.getByRole("textbox", { name: "Search maintenance requests" });
          await search.fill("water");
          const searchValue = await search.inputValue();
          results.push({ area: "caretaker-maintenance-controls", viewport: `${viewport.width}x${viewport.height}`, theme, pendingSelected, searchValue });
          if (!pendingSelected || searchValue !== "water") failed = true;
        }
        if (route.name === "notifications") {
          const unread = page.getByRole("button", { name: "Unread", exact: true });
          await unread.click();
          const unreadSelected = await unread.getAttribute("aria-pressed") === "true";
          const search = page.getByRole("textbox", { name: "Search notifications" });
          await search.fill("request");
          const searchValue = await search.inputValue();
          results.push({ area: "caretaker-notification-controls", viewport: `${viewport.width}x${viewport.height}`, theme, unreadSelected, searchValue });
          if (!unreadSelected || searchValue !== "request") failed = true;
        }
        if (route.name === "profile") {
          await page.getByRole("button", { name: "Edit information" }).click();
          const fieldsEditable = await page.getByRole("textbox", { name: "First name" }).isEnabled();
          await page.getByRole("button", { name: "Cancel edit" }).click();
          const fieldsLockedAgain = !(await page.getByRole("textbox", { name: "First name" }).isEnabled());
          const saveDisabled = await page.getByRole("button", { name: "Save changes" }).isDisabled();
          results.push({ area: "caretaker-profile-controls", viewport: `${viewport.width}x${viewport.height}`, theme, fieldsEditable, fieldsLockedAgain, saveDisabled });
          if (!fieldsEditable || !fieldsLockedAgain || !saveDisabled) failed = true;
        }
        if (index === 0) {
          await page.keyboard.press("Tab");
          const skipLinkFocused = await page.evaluate(() => document.activeElement?.textContent?.trim() === "Skip to content" && getComputedStyle(document.activeElement).outlineStyle !== "none");
          const bell = page.getByRole("button", { name: "Notifications", exact: true });
          await bell.click();
          const notifications = page.locator(`#${await bell.getAttribute("aria-controls")}`);
          await notifications.waitFor({ state: "visible" });
          const emptyState = await notifications.innerText();
          await page.waitForTimeout(180);
          const notificationScreenshot = path.join(outputDir, `caretaker-dashboard-${viewport.name}-${theme}-notifications-open.png`);
          await page.screenshot({ path: notificationScreenshot, fullPage: true });
          const notificationBoundsFit = await notifications.evaluate((panel) => { const box = panel.getBoundingClientRect(); return box.top >= 0 && box.left >= 0 && box.right <= innerWidth && box.bottom <= innerHeight; });
          await page.keyboard.press("Escape");
          const restored = await bell.evaluate((trigger) => trigger === document.activeElement);
          const profile = page.getByRole("button", { name: "Profile options" });
          await profile.focus();
          await page.keyboard.press("Enter");
          const menu = page.locator(`#${await profile.getAttribute("aria-controls")}`);
          await page.getByRole("menuitem", { name: "Profile" }).waitFor({ state: "visible" });
          const profileHref = await page.getByRole("menuitem", { name: "Profile" }).getAttribute("href");
          await page.waitForTimeout(180);
          const profileScreenshot = path.join(outputDir, `caretaker-dashboard-${viewport.name}-${theme}-profile-open.png`);
          await page.screenshot({ path: profileScreenshot, fullPage: true });
          const profileBoundsFit = await menu.evaluate((panel) => { const box = panel.getBoundingClientRect(); return box.top >= 0 && box.left >= 0 && box.right <= innerWidth && box.bottom <= innerHeight; });
          await page.keyboard.press("Escape");
          const profileRestored = await profile.evaluate((trigger) => trigger === document.activeElement);
          results.push({ area: "caretaker-popovers", viewport: `${viewport.width}x${viewport.height}`, theme, screenshots: [notificationScreenshot, profileScreenshot], skipLinkFocused, emptyState: emptyState.includes("No notifications to display"), notificationBoundsFit, notificationFocusRestored: restored, profileHref, profileBoundsFit, profileFocusRestored: profileRestored });
          if (!skipLinkFocused || !emptyState.includes("No notifications to display") || !notificationBoundsFit || !restored || profileHref !== "/caretaker/profile" || !profileBoundsFit || !profileRestored) failed = true;
        }
      }
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`${baseUrl}/caretaker`, { waitUntil: "networkidle" });
      const reducedMotionDuration = await page.locator(".portal-page-content").evaluate((node) => getComputedStyle(node).animationDuration);
      results.push({ area: "caretaker-reduced-motion", viewport: `${viewport.width}x${viewport.height}`, theme, reducedMotionDuration, errors });
      if (reducedMotionDuration !== "0s" || errors.length) failed = true;
      await page.close();
    }
  }

  for (const viewport of viewports) {
    for (const area of areas) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: "dark", reducedMotion: "no-preference" });
      const errors = [];
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      page.on("pageerror", (error) => errors.push(error.message));
      const response = await page.goto(`${baseUrl}/${area.name}`, { waitUntil: "networkidle" });
      await hideNextDevOverlay(page);
      const notificationTrigger = page.getByRole("button", { name: "Notifications", exact: true });
      await notificationTrigger.click();
      const notificationPanel = page.locator(`#${await notificationTrigger.getAttribute("aria-controls")}`);
      await notificationPanel.waitFor({ state: "visible" });
      await page.waitForTimeout(180);
      const notificationScreenshot = path.join(outputDir, `${area.name}-${viewport.name}-dark-notifications-open.png`);
      await page.screenshot({ path: notificationScreenshot, fullPage: true });
      const notificationBounds = await notificationPanel.evaluate((panel) => {
        const box = panel.getBoundingClientRect();
        return { top: box.top, right: box.right, bottom: box.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
      });
      await page.keyboard.press("Escape");
      const notificationDismissed = await notificationPanel.getAttribute("aria-hidden") === "true";
      const profileTrigger = page.getByRole("button", { name: "Profile options" });
      await profileTrigger.click();
      const profileMenu = page.locator(`#${await profileTrigger.getAttribute("aria-controls")}`);
      await page.waitForFunction((menuId) => document.activeElement === document.querySelector(`#${menuId} [role='menuitem']`), await profileMenu.getAttribute("id"));
      await page.waitForTimeout(180);
      const profileScreenshot = path.join(outputDir, `${area.name}-${viewport.name}-dark-profile-menu-open.png`);
      await page.screenshot({ path: profileScreenshot, fullPage: true });
      const profileBounds = await profileMenu.evaluate((panel) => {
        const box = panel.getBoundingClientRect();
        return { top: box.top, right: box.right, bottom: box.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
      });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      const mainScrollTop = await page.locator("main").evaluate((main) => main.scrollTop);
      await page.keyboard.press("Escape");
      const profileDismissed = await profileMenu.getAttribute("aria-hidden") === "true";
      const boundsFit = [notificationBounds, profileBounds].every((box) => box.top >= 0 && box.right <= box.viewportWidth && box.bottom <= box.viewportHeight);
      results.push({ area: `${area.name}-dark-popovers`, viewport: `${viewport.width}x${viewport.height}`, status: response?.status(), screenshots: [notificationScreenshot, profileScreenshot], notificationDismissed, profileDismissed, boundsFit, overflow, mainScrollTop, errors });
      if (response?.status() !== 200 || !notificationDismissed || !profileDismissed || !boundsFit || overflow || mainScrollTop !== 0 || errors.length) failed = true;
      await page.close();
    }
  }

  const authScreens = [
    { name: "root-login", path: "/", linkedPath: "/request-account" },
    { name: "login", path: "/login", linkedPath: "/request-account" },
    { name: "request-account", path: "/request-account", linkedPath: "/login" },
  ];
  for (const viewport of viewports) {
    for (const route of authScreens) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: "light", reducedMotion: "reduce" });
      const errors = [];
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      page.on("pageerror", (error) => errors.push(error.message));
      const response = await page.goto(`${baseUrl}${route.path}`, { waitUntil: "networkidle" });
      await hideNextDevOverlay(page);
      const screenshot = path.join(outputDir, `${route.name}-${viewport.name}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      const metrics = await page.evaluate(() => ({
        heading: document.querySelector("h1")?.innerText,
        formHeading: document.querySelector(".auth-form-card h2")?.innerText,
        documentWidth: document.documentElement.scrollWidth,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        disabledSubmit: document.querySelector(".auth-submit")?.disabled,
        logo: (() => {
          const image = document.querySelector(".auth-brand img");
          if (!(image instanceof HTMLImageElement)) return null;
          const box = image.getBoundingClientRect();
          return {
            src: image.getAttribute("src"),
            alt: image.alt,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
            renderedWidth: Math.round(box.width),
            renderedHeight: Math.round(box.height),
            ratioDifference: Math.abs(box.width / box.height - image.naturalWidth / image.naturalHeight),
          };
        })(),
        visiblePrototypeCopy: /preview|prototype|sample screens|illustrative/i.test(document.body.innerText),
      }));
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      const authFocus = await page.evaluate(() => ({
        target: document.activeElement?.tagName,
        outlineStyle: getComputedStyle(document.activeElement).outlineStyle,
        outlineWidth: getComputedStyle(document.activeElement).outlineWidth,
      }));
      const expectedPasswordFields = route.name === "request-account" ? 2 : route.name === "login" || route.name === "root-login" ? 1 : 0;
      const passwordFields = page.locator(".auth-field__input-wrap input");
      const passwordVisibility = [];
      for (let index = 0; index < expectedPasswordFields; index += 1) {
        const input = passwordFields.nth(index);
        const toggle = page.locator(".auth-password-toggle").nth(index);
        const value = `visual-check-${index}`;
        const label = route.name === "request-account" && index === 1 ? "confirm password" : "password";
        await input.fill(value);
        await toggle.click();
        const shown = await input.evaluate((element) => element.type === "text") && await input.inputValue() === value && await toggle.getAttribute("aria-label") === `Hide ${label}`;
        await toggle.click();
        const hidden = await input.evaluate((element) => element.type === "password") && await input.inputValue() === value && await toggle.getAttribute("aria-label") === `Show ${label}`;
        passwordVisibility.push({ shown, hidden, valueRetained: shown && hidden });
      }
      const authLink = route.linkedPath === "/request-account"
        ? page.getByRole("link", { name: "Request Tenant Account" })
        : page.getByRole("link", { name: "Log In", exact: true });
      await authLink.click();
      await page.waitForURL((url) => url.pathname === route.linkedPath);
      const result = { route: route.name, viewport: `${viewport.width}x${viewport.height}`, status: response?.status(), screenshot, metrics, passwordVisibility, errors };
      result.authFocus = authFocus;
      result.linkedPath = new URL(page.url()).pathname;
      results.push(result);
      if (result.status !== 200 || metrics.formHeading !== "Log In" && route.name !== "request-account" || metrics.horizontalOverflow || !metrics.disabledSubmit || !metrics.logo || metrics.logo.naturalWidth === 0 || metrics.logo.alt !== "" || metrics.logo.ratioDifference > 0.02 || metrics.visiblePrototypeCopy || authFocus.outlineStyle === "none" || authFocus.outlineWidth === "0px" || passwordVisibility.length !== expectedPasswordFields || passwordVisibility.some((check) => !check.shown || !check.hidden || !check.valueRetained) || errors.length > 0) failed = true;
      await page.close();
    }
  }

  const copyAuditRoutes = [
    "/", "/login", "/request-account",
    "/tenant", "/tenant/payments", "/tenant/visitors",
    "/tenant/maintenance", "/tenant/profile", "/tenant/preferences", "/tenant/more",
    "/management", "/management/rooms", "/management/tenants",
    "/management/payments", "/management/maintenance", "/management/visitors",
    "/management/notifications", "/management/profile", "/management/more",
    "/caretaker", "/caretaker/maintenance", "/caretaker/notifications", "/caretaker/profile",
  ];
  for (const routePath of copyAuditRoutes) {
    for (const viewport of viewports) {
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: "light",
        reducedMotion: "reduce",
      });
      const response = await page.goto(`${baseUrl}${routePath}`, { waitUntil: "domcontentloaded" });
      await hideNextDevOverlay(page);
      const visibleText = await page.locator("body").innerText();
      const prototypeCopy = /preview|prototype|sample screens|illustrative/i.test(visibleText);
      results.push({ route: `copy-audit:${routePath}`, viewport: `${viewport.width}x${viewport.height}`, status: response?.status(), visiblePrototypeCopy: prototypeCopy });
      if (response?.status() !== 200 || prototypeCopy) failed = true;
      await page.close();
    }
  }

  for (const viewport of viewports) {
    const login = results.find((result) => result.route === "login" && result.viewport === `${viewport.width}x${viewport.height}`);
    const rootLogin = results.find((result) => result.route === "root-login" && result.viewport === `${viewport.width}x${viewport.height}`);
    if (!login || !rootLogin || login.metrics.formHeading !== rootLogin.metrics.formHeading || login.metrics.logo?.src !== rootLogin.metrics.logo?.src) failed = true;
  }

  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: "light", reducedMotion: "reduce" });
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(`${baseUrl}/management/profile`, { waitUntil: "networkidle" });
    await hideNextDevOverlay(page);
    const screenshot = path.join(outputDir, `management-profile-${viewport.name}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    const metrics = await page.evaluate(() => ({
      heading: document.querySelector("h1")?.innerText,
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      disabledActions: [...document.querySelectorAll(".profile-preview-save")].every((button) => button.disabled),
    }));
    results.push({ route: "management-profile", viewport: `${viewport.width}x${viewport.height}`, status: response?.status(), screenshot, metrics, errors });
    if (response?.status() !== 200 || metrics.horizontalOverflow || !metrics.disabledActions || errors.length) failed = true;
    await page.close();
  }

  const darkPage = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: "dark", reducedMotion: "reduce" });
  const darkErrors = [];
  darkPage.on("console", (message) => { if (message.type() === "error") darkErrors.push(message.text()); });
  darkPage.on("pageerror", (error) => darkErrors.push(error.message));
  const darkResponse = await darkPage.goto(`${baseUrl}/management`, { waitUntil: "networkidle" });
  await hideNextDevOverlay(darkPage);
  const darkScreenshot = path.join(outputDir, "management-desktop-dark.png");
  await darkPage.screenshot({ path: darkScreenshot, fullPage: true });
  const darkBackground = await darkPage.locator("body").evaluate((body) => getComputedStyle(body).backgroundColor);
  await darkPage.locator('.management-toolbar button[title="Switch color theme"]').click();
  const themeAfterToggle = await darkPage.locator("html").getAttribute("data-theme");
  const lightToggleScreenshot = path.join(outputDir, "management-desktop-theme-toggle-light.png");
  await darkPage.screenshot({ path: lightToggleScreenshot, fullPage: true });
  await darkPage.locator('.management-toolbar button[title="Switch color theme"]').click();
  const themeAfterToggleBack = await darkPage.locator("html").getAttribute("data-theme");
  const result = { area: "management-dark", viewport: "1440x1000", status: darkResponse?.status(), screenshots: [darkScreenshot, lightToggleScreenshot], darkBackground, themeAfterToggle, themeAfterToggleBack, errors: darkErrors };
  results.push(result);
  if (result.status !== 200 || themeAfterToggle !== "light" || themeAfterToggleBack !== "dark" || darkBackground === "rgb(255, 255, 255)" || darkErrors.length > 0) failed = true;
  await darkPage.close();

  const darkProfile = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: "dark", reducedMotion: "reduce" });
  const profileErrors = [];
  darkProfile.on("console", (message) => { if (message.type() === "error") profileErrors.push(message.text()); });
  darkProfile.on("pageerror", (error) => profileErrors.push(error.message));
  const profileResponse = await darkProfile.goto(`${baseUrl}/management/profile`, { waitUntil: "networkidle" });
  await hideNextDevOverlay(darkProfile);
  const darkProfileScreenshot = path.join(outputDir, "management-profile-desktop-dark.png");
  await darkProfile.screenshot({ path: darkProfileScreenshot, fullPage: true });
  const profileBackground = await darkProfile.locator("body").evaluate((body) => getComputedStyle(body).backgroundColor);
  results.push({ route: "management-profile-dark", viewport: "1440x1000", status: profileResponse?.status(), screenshot: darkProfileScreenshot, background: profileBackground, errors: profileErrors });
  if (profileResponse?.status() !== 200 || profileErrors.length || profileBackground === "rgb(255, 255, 255)") failed = true;
  await darkProfile.close();
} finally {
  await browser.close();
}

console.log(JSON.stringify({ screenshots: outputDir, results }, null, 2));
if (failed) process.exitCode = 1;
