import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForSelector("text=Enhance your talent", { timeout: 10000 });
await page.screenshot({ path: "verify-homepage.png", fullPage: true });

await page.goto("http://localhost:5173/login", { waitUntil: "networkidle" });
await page.waitForSelector("text=Work Without Limits", { timeout: 10000 });
await page.screenshot({ path: "verify-login.png", fullPage: true });

await browser.close();

console.log("ERRORS:", errors.length ? JSON.stringify(errors, null, 2) : "none");
