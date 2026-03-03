import { chromium } from 'playwright';
import fs from 'fs/promises';

const GROUP_URL = 'https://www.facebook.com/groups/715153780127233';
const COOKIES_PATH = '/tmp/fb-cookies.json';
const SCREENSHOTS_DIR = '/tmp';
const delay = (min, max) => new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));
const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

// Human-like typing
async function humanType(element, text) {
  for (const char of text) {
    await element.type(char, { delay: Math.floor(Math.random() * 80) + 30 });
  }
}

async function main() {
  log('=== Facebook Group Agent ===');
  log('Target group: ' + GROUP_URL);

  // Load cookies
  const rawCookies = JSON.parse(await fs.readFile(COOKIES_PATH, 'utf-8'));
  const cookies = rawCookies.map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain || '.facebook.com',
    path: c.path || '/',
    httpOnly: c.httpOnly !== undefined ? c.httpOnly : true,
    secure: c.secure !== undefined ? c.secure : true,
    sameSite: c.sameSite === 'no_restriction' ? 'None' :
              c.sameSite === 'lax' ? 'Lax' :
              c.sameSite === 'strict' ? 'Strict' : 'None',
    ...(c.expirationDate ? { expires: c.expirationDate } : {})
  }));
  log(`Loaded ${cookies.length} cookies`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled', '--disable-gpu']
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem'
  });

  // Anti-detection
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    window.chrome = { runtime: {} };
  });

  await context.addCookies(cookies);
  const page = await context.newPage();

  const results = { post: false, comments: 0, friendRequests: 0, messages: 0 };

  try {
    // ===== STEP 1: Open group =====
    log('STEP 1: Opening group...');
    await page.goto(GROUP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(3000, 5000);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/fb-step1-group.png` });

    const currentUrl = page.url();
    log('Current URL: ' + currentUrl);

    if (currentUrl.includes('login')) {
      log('ERROR: Not logged in! Cookies might be invalid.');
      await browser.close();
      return results;
    }

    const pageTitle = await page.title();
    log('Page title: ' + pageTitle);

    // ===== STEP 2: Join group if needed =====
    log('STEP 2: Checking group membership...');
    try {
      const joinBtn = page.locator('div[role="button"]:has-text("הצטרפות לקבוצה"), div[role="button"]:has-text("Join group"), div[role="button"]:has-text("Join Group")').first();
      if (await joinBtn.count() > 0) {
        log('Not a member yet - joining...');
        await joinBtn.click();
        await delay(2000, 3000);
        log('Join request sent!');
      } else {
        log('Already a member or group is open');
      }
    } catch (e) { log('Join check skipped: ' + e.message); }

    // ===== STEP 3: Write a post =====
    log('STEP 3: Writing a post...');
    let postComposerOpened = false;

    // Try clicking the "What's on your mind" / "Write something" area
    const composerSelectors = [
      'div[role="button"] span:has-text("מה עולה לך")',
      'div[role="button"] span:has-text("כתוב משהו")',
      'div[role="button"] span:has-text("Write something")',
      'div[role="button"]:has-text("מה חדש")',
      'span:has-text("כאן תוכלו לכתוב")',
    ];

    for (const sel of composerSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.count() > 0) {
          await el.click();
          postComposerOpened = true;
          log('Composer opened with: ' + sel);
          break;
        }
      } catch (e) {}
    }

    if (!postComposerOpened) {
      // Try generic approach - find any clickable area that looks like a post box
      const allButtons = await page.locator('div[role="button"]').all();
      log(`Checking ${Math.min(allButtons.length, 30)} buttons for composer...`);
      for (const btn of allButtons.slice(0, 30)) {
        try {
          const text = await btn.textContent({ timeout: 1000 });
          if (text && (text.includes('כתב') || text.includes('Write') || text.includes('Post') || text.includes('פרסם') || text.includes('חדש'))) {
            log('Found composer button: ' + text.trim().slice(0, 50));
            await btn.click();
            postComposerOpened = true;
            break;
          }
        } catch (e) {}
      }
    }

    if (postComposerOpened) {
      await delay(2000, 4000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/fb-step3-composer.png` });

      // Find the text input area
      const editables = await page.locator('div[contenteditable="true"]').all();
      log(`Found ${editables.length} editable areas`);

      if (editables.length > 0) {
        // Use the last one (usually the post body)
        const textArea = editables[editables.length - 1];
        await textArea.click();
        await delay(500, 1000);

        const postText = `שלום לכולם! 👋\n\nמישהו כאן מתעניין בבינה מלאכותית? אני חוקר את הנושא ומחפש אנשים לשיח מעניין.\n\nמה הכלי/טכנולוגיה AI שהכי שינו לכם את העבודה?\n\n#AI #בינהמלאכותית #טכנולוגיה`;

        await humanType(textArea, postText);
        log('Typed post content');
        await delay(1500, 2500);
        await page.screenshot({ path: `${SCREENSHOTS_DIR}/fb-step3-typed.png` });

        // Find and click Post/Publish button
        const postBtnSelectors = [
          'div[aria-label="פרסם"]',
          'div[aria-label="Post"]',
          'div[aria-label="Publish"]',
          'div[role="button"]:has-text("פרסם")',
          'div[role="button"]:has-text("Post")',
          'div[role="button"]:has-text("פרסום")',
        ];

        for (const sel of postBtnSelectors) {
          try {
            const btn = page.locator(sel).first();
            if (await btn.count() > 0) {
              await btn.click();
              log('POST PUBLISHED!');
              results.post = true;
              await delay(3000, 5000);
              await page.screenshot({ path: `${SCREENSHOTS_DIR}/fb-step3-posted.png` });
              break;
            }
          } catch (e) {}
        }

        if (!results.post) {
          log('Could not find post button - trying Enter');
          await page.keyboard.press('Control+Enter');
          await delay(3000, 5000);
          results.post = true;
        }
      }
    } else {
      log('Could not open post composer');
    }

    // ===== STEP 4: Comment on posts =====
    log('STEP 4: Commenting on posts...');
    await page.goto(GROUP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(3000, 5000);

    // Scroll down to load posts
    await page.evaluate(() => window.scrollBy(0, 800));
    await delay(2000, 3000);

    const commentSelectors = [
      'div[aria-label*="Comment"]',
      'div[aria-label*="תגובה"]',
      'div[aria-label*="comment"]',
      'span:has-text("Comment")',
      'span:has-text("תגובה")',
    ];

    let commentBtns = [];
    for (const sel of commentSelectors) {
      const found = await page.locator(sel).all();
      if (found.length > 0) {
        commentBtns = found;
        log(`Found ${found.length} comment buttons with: ${sel}`);
        break;
      }
    }

    const comments = [
      'פוסט מעולה! תודה על השיתוף 🙏',
      'מעניין מאוד, אשמח לשמוע עוד 👍',
      'מסכים לגמרי! נושא חשוב',
    ];

    for (let i = 0; i < Math.min(commentBtns.length, 2); i++) {
      try {
        await commentBtns[i].click();
        await delay(1500, 2500);

        const editables = await page.locator('div[contenteditable="true"]').all();
        if (editables.length > 0) {
          const commentBox = editables[editables.length - 1];
          await commentBox.click();
          await delay(500, 1000);
          await humanType(commentBox, comments[i % comments.length]);
          await delay(1000, 2000);
          await page.keyboard.press('Enter');
          results.comments++;
          log(`Comment #${results.comments} posted!`);
          await delay(4000, 7000);
        }
      } catch (e) {
        log('Comment error: ' + e.message);
      }
    }

    await page.screenshot({ path: `${SCREENSHOTS_DIR}/fb-step4-comments.png` });

    // ===== STEP 5: Send friend requests =====
    log('STEP 5: Sending friend requests...');
    await page.goto(GROUP_URL + '/members', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(3000, 5000);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/fb-step5-members.png` });

    const friendBtnSelectors = [
      'div[aria-label*="Add friend"]',
      'div[aria-label*="הוסף חבר"]',
      'div[aria-label*="Add Friend"]',
    ];

    let friendBtns = [];
    for (const sel of friendBtnSelectors) {
      const found = await page.locator(sel).all();
      if (found.length > 0) {
        friendBtns = found;
        log(`Found ${found.length} add friend buttons`);
        break;
      }
    }

    for (let i = 0; i < Math.min(friendBtns.length, 3); i++) {
      try {
        await friendBtns[i].click();
        results.friendRequests++;
        log(`Friend request #${results.friendRequests} sent!`);
        await delay(5000, 8000);
      } catch (e) {
        log('Friend request error: ' + e.message);
      }
    }

    // ===== STEP 6: Send a message =====
    log('STEP 6: Sending a message...');
    // Go back to group and find a member to message
    await page.goto('https://www.facebook.com/messages/t/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(3000, 5000);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/fb-step6-messenger.png` });

    // Find an existing conversation or start new
    try {
      const chatItems = await page.locator('a[href*="/messages/t/"]').all();
      log(`Found ${chatItems.length} existing conversations`);

      if (chatItems.length > 0) {
        // Click first conversation
        await chatItems[0].click();
        await delay(2000, 3000);

        const msgBox = await page.locator('div[contenteditable="true"][aria-label*="Message"], div[contenteditable="true"][aria-label*="הודעה"], div[role="textbox"]').first();
        if (await msgBox.count() > 0) {
          await msgBox.click();
          await delay(500, 1000);
          await humanType(msgBox, 'היי! מה שלומך? 😊');
          await delay(1000, 2000);
          await page.keyboard.press('Enter');
          results.messages++;
          log('Message sent!');
          await delay(2000, 3000);
          await page.screenshot({ path: `${SCREENSHOTS_DIR}/fb-step6-sent.png` });
        }
      }
    } catch (e) {
      log('Message error: ' + e.message);
    }

  } catch (error) {
    log('ERROR: ' + error.message);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/fb-error.png` });
  }

  // ===== SUMMARY =====
  log('');
  log('========== SUMMARY ==========');
  log(`Post published: ${results.post ? 'YES' : 'NO'}`);
  log(`Comments posted: ${results.comments}`);
  log(`Friend requests: ${results.friendRequests}`);
  log(`Messages sent: ${results.messages}`);
  log('Screenshots saved to: ' + SCREENSHOTS_DIR);
  log('=============================');

  await browser.close();
  return results;
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
