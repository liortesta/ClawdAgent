# Web Scraping & Data Extraction — WebExtractor

> For authorized security testing and reconnaissance only.

## Overview
WebExtractor is a web scraping and data extraction tool used during authorized security assessments to identify exposed information on websites. It extracts emails, phone numbers, links, metadata, and other structured data from web pages.

## Core Capabilities
- **Email Harvesting**: Extract email addresses from target websites and linked pages
- **Phone Number Extraction**: Find phone numbers with regex patterns across pages
- **Link Mapping**: Crawl and map all internal/external links, identify hidden endpoints
- **Form Detection**: Find login forms, file uploads, and input fields (potential attack vectors)
- **Comment Extraction**: Find HTML comments that may contain sensitive info (API keys, TODOs, debug info)
- **JavaScript Analysis**: Extract API endpoints, tokens, and secrets from JS files
- **Metadata Harvesting**: Extract document metadata (author, creation date, software used)

## Security Testing Applications

### Reconnaissance Phase
```
Target Website → WebExtractor
  ├── Emails found → Check against breach databases
  ├── Phone numbers → Social engineering risk assessment
  ├── Hidden links → Discover admin panels, dev endpoints
  ├── JS files → Extract hardcoded API keys/secrets
  ├── HTML comments → Find debug info, internal notes
  ├── Forms → Map input validation points
  └── Documents → Extract metadata (author info, tools used)
```

### Common Findings in Security Audits
1. **Exposed Emails**: Employee emails in page source → phishing risk
2. **Hardcoded Secrets**: API keys in JavaScript bundles
3. **Admin Panels**: Hidden /admin, /dashboard, /wp-admin endpoints
4. **Debug Information**: Stack traces, version numbers in comments
5. **Document Metadata**: Author names, internal paths, software versions
6. **Unprotected API Endpoints**: REST/GraphQL endpoints in JS

## Techniques
- **Crawling**: Recursive page discovery with depth limits
- **Regex Extraction**: Pattern matching for emails, phones, IPs, secrets
- **DOM Parsing**: BeautifulSoup, Cheerio, Puppeteer for structured extraction
- **Header Analysis**: Server headers, security headers (CSP, HSTS, X-Frame-Options)
- **robots.txt / sitemap.xml**: Find hidden paths and disallowed directories
- **Archive.org Wayback Machine**: Historical snapshots for removed but cached content

## Integration with Security Workflow
```python
# Example: Basic recon script pattern
async def web_recon(target_url):
    # 1. Check robots.txt for hidden paths
    robots = await fetch(f"{target_url}/robots.txt")

    # 2. Extract emails from main pages
    emails = extract_emails(await crawl(target_url, depth=2))

    # 3. Find JS files and scan for secrets
    js_files = extract_js_urls(page_source)
    secrets = scan_js_for_secrets(js_files)

    # 4. Check security headers
    headers = analyze_security_headers(response.headers)

    return ReconReport(emails, secrets, headers)
```

## Ethical Guidelines
- Only scrape websites within authorized scope
- Respect robots.txt directives during non-security contexts
- Rate-limit requests to avoid DoS
- Do not extract or store personal data beyond assessment needs
- Report all exposed sensitive data to the target organization
