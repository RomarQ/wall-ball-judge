# Serving it from GitHub Pages

The published copy is at `https://wallballs.app/`. GitHub Pages serves it from this repository, and `.github/workflows/pages.yml` builds and deploys it on every push to `main`. The build serves the pose models itself (`npm run models:fetch`, then `VITE_MODELS=local`), so it runs with no third party.

GitHub Pages serves a private repository only on a paid plan, such as GitHub Pro. The site itself is public either way.

## Setting it up

1. In the repository's **Settings → Pages**, set **Source** to **GitHub Actions**, and enter `wallballs.app` as the **Custom domain**.
2. In the account's **Settings → Pages**, add `wallballs.app` as a verified domain. GitHub gives a TXT record for the DNS; it stops another account from serving the domain.
3. In the domain's DNS zone at Hostinger, delete the records that point the domain at Hostinger's parking page, then add these, one record for each address:

| Type  | Name                            | Value                                                                                      |
| ----- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| A     | `@`                             | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`                 |
| AAAA  | `@`                             | `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` |
| CNAME | `www`                           | `romarq.github.io`                                                                         |
| TXT   | the name GitHub gives in step 2 | the value GitHub gives in step 2                                                           |

4. Once GitHub shows the domain's certificate, tick **Enforce HTTPS**. Every `.app` domain is HTTPS only, so the site does not open before that, which can take up to an hour.
5. In **Settings → Secrets and variables → Actions → Variables**, set `DEPLOY_PAGES` to `true`. Until then the workflow builds but does not deploy.

## Caching

GitHub Pages lets a browser cache every file for 10 minutes and sends no other headers. The app needs none: a phone still checks for a new service worker each time it opens the app.
