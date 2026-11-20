# Cloudflare Pages deployment

- Verified login: alshayeksa@gmail.com
- Account: df48308e0348751b70b2ff4aae28a833
- Platform: Cloudflare Pages (static assets, no Functions)
- Project: labeeb
- Production branch: main
- Public URL: https://labeeb-4ry.pages.dev
- Deployment: 23280615 (2026-11-20, macOS 0.1.53 downloads)
- Custom domain: https://labeeb.alshaye.ai (live)

macOS installers are served from `/downloads/`. Copy the signed, notarized DMGs
from the "Signed macOS release" workflow artifacts into `labeeb-wbsite/downloads/`
before `node build.mjs` (the build fails if they are missing). They are git-ignored
and must stay under Cloudflare Pages' 25 MiB per-file limit. Update `MAC_VERSION`
in `build.mjs` for a new release.

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
