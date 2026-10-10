import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './workspace';

test('desktop features and dark theme meet automated WCAG AA checks', async ({
  workspace,
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await workspace.source();
  await workspace.json(`/cases/${workspace.caseId}/artifacts/generate`, 'POST');
  for (const path of [
    '',
    '/overview',
    '/sources',
    '/review',
    '/evidence',
    '/timeline',
    '/checks',
    '/results',
  ]) {
    await workspace.open(path);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      results.violations,
      `Accessibility violations at ${path || '/chat'}`,
    ).toEqual([]);
  }
  await page.screenshot({ path: testInfo.outputPath('results-desktop.png') });
  await page
    .getByRole('button', { name: 'Attiva tema scuro', exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const dark = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(dark.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('results-dark.png') });
  await page.getByRole('link', { name: 'Come funziona', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Come funziona Expertise', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: /Flusso/ })).toBeVisible();
  const guide = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(guide.violations).toEqual([]);
});

test('mobile navigation traps focus, restores it on Escape and keeps the composer in the viewport', async ({
  workspace,
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await workspace.source();
  await workspace.open();
  await page.getByRole('button', { name: 'Apri il menu', exact: true }).click();
  const drawer = page.getByRole('dialog', {
    name: 'Navigazione principale',
    exact: true,
  });
  await expect(drawer).toBeVisible();
  for (let count = 0; count < 12; count += 1) {
    await page.keyboard.press('Tab');
    expect(
      await drawer.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  const navigation = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(navigation.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Apri il menu', exact: true }),
  ).toBeFocused();
  await page
    .getByLabel('Messaggio per l’assistente')
    .fill('Controlla le fonti del carico sintetico');
  await page
    .getByRole('button', { name: 'Invia messaggio', exact: true })
    .click();
  await expect(
    page.getByRole('article', { name: 'Risposta dell’assistente' }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  const composer = await page.locator('.composer').boundingBox();
  expect(composer).not.toBeNull();
  expect(composer!.x).toBeGreaterThanOrEqual(0);
  expect(composer!.x + composer!.width).toBeLessThanOrEqual(375);
  expect(composer!.y + composer!.height).toBeLessThanOrEqual(812);
  const mobile = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(mobile.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('chat-mobile.png') });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.screenshot({ path: testInfo.outputPath('chat-desktop.png') });
});

test('modal keyboard controls restore the opening button and enlarged text remains usable', async ({
  workspace,
  page,
}) => {
  await workspace.open('/sources');
  const button = page.getByRole('button', {
    name: 'Aggiungi fonte',
    exact: true,
  });
  await button.click();
  const dialog = page.getByRole('dialog', {
    name: 'Aggiungi una fonte',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  for (let count = 0; count < 16; count += 1) {
    await page.keyboard.press('Tab');
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  const modal = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(modal.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(button).toBeFocused();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '32px';
  });
  await page.getByRole('link', { name: 'Chat', exact: true }).click();
  await expect(page.getByLabel('Messaggio per l’assistente')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
