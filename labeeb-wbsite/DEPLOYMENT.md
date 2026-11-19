# Cloudflare Pages deployment

- Verified login: alshayeksa@gmail.com
- Account: df48308e0348751b70b2ff4aae28a833
- Platform: Cloudflare Pages (static assets, no Functions)
- Project: labeeb
- Production branch: main
- Public URL: https://labeeb-4ry.pages.dev
- Deployment: fc1def47-fcfc-435a-be99-21d12502ef7a
- Requested custom domain: labeeb.alshaye.ai
- Custom domain registered on Pages; pending DNS (CNAME record not set).

Required DNS record in alshaye.ai:

| Type | Name | Target |
| --- | --- | --- |
| CNAME | labeeb | labeeb-4ry.pages.dev |

Wrangler OAuth can deploy Pages and associate the custom domain, but DNS record access returned HTTP 403. No existing DNS records were modified.

Deploy subsequent updates with the verified account:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID='df48308e0348751b70b2ff4aae28a833'
node build.mjs
npx.cmd wrangler pages deploy dist --project-name labeeb --branch main --commit-dirty=true
```

Do not use `wrangler deploy`; this is a Pages project.
