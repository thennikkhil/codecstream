# codecstream

Video infrastructure, not a YouTube clone. The dashboard is the first customer of my own API.

## Deployment

Deploy `apps/dashboard` to Vercel with the Next.js preset and access to the repository workspace. Set `API_ORIGIN` in Production and Preview to the HTTPS Express origin for each environment. The dashboard proxies authentication, upload controls, and HLS key requests through that origin.

Run the API, Redis, and FFmpeg worker on the backend host with `docker compose --profile prod up -d --build`. Set `API_HOST` and `REDIS_PASSWORD` for Compose. Configure MongoDB, S3 access, and the same `KEY_ENCRYPTION_SECRET` on the API and worker. Use separate backend resources for staging.

For each environment, set the API's `DASHBOARD_ORIGIN` and `BETTER_AUTH_URL` to the stable dashboard HTTPS origin clients use for auth. Set the worker's `PUBLIC_APP_URL` to that same dashboard origin before encoding. HLS playlists embed that hostname when they are generated. If the hostname changes, update existing playlists or regenerate them before retiring the previous host.

Set `CDN_BASE_URL` on the API to the CloudFront origin that serves `hls/`. Allow the dashboard origin in S3 CORS for multipart `PUT` requests and in CDN CORS for playback `GET` requests. Check `/api/health` on the deployed dashboard, then sign in, upload a small video, and verify that it reaches Ready and plays.
