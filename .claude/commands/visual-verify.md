# Visual Verification — Browser-Based UI Testing

Use Playwright MCP to visually verify the UI that was just built or modified.

## Process:

### 1. Start Dev Server (background)
- Run dev server in background if not already running
- Wait for server to be ready (health check)

### 2. Navigate & Screenshot
- Open the target URL in browser
- Take a full-page screenshot as "current state"
- If a reference screenshot exists, compare them

### 3. Interactive Testing
- Click through the critical user flow
- Fill forms with test data
- Verify navigation works
- Check responsive behavior (desktop + mobile viewport)

### 4. Visual Checks
For each page/component:
- [ ] Layout matches expectations
- [ ] No overlapping elements
- [ ] Text is readable (no truncation)
- [ ] Colors and spacing are consistent
- [ ] Loading states work
- [ ] Error states display correctly
- [ ] Empty states are handled

### 5. Screenshot → Fix Loop
If issues found:
1. Take screenshot of the issue
2. Identify the CSS/HTML problem
3. Fix the code
4. Re-screenshot to verify fix
5. Repeat until clean

## Output Format:
```
## Visual Verification Report

### Pages Tested
| Page | URL | Status | Screenshot |
|------|-----|--------|-----------|
| Home | / | PASS/FAIL | [description] |
| Login | /login | PASS/FAIL | [description] |

### Issues Found
- [issue description — file:line — fix applied]

### Responsive Check
| Viewport | Status |
|----------|--------|
| Desktop (1920x1080) | PASS/FAIL |
| Tablet (768x1024) | PASS/FAIL |
| Mobile (375x667) | PASS/FAIL |

### Verdict: VISUAL OK / NEEDS FIXES
```

## Rules:
- ALWAYS test at minimum 2 viewports (desktop + mobile)
- ALWAYS check error states, not just happy path
- If Playwright MCP is not available, report and suggest manual testing

$ARGUMENTS
