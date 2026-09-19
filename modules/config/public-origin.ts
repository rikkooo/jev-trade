export function getPublicOrigin(
  environment: Record<string, string | undefined> = process.env,
): URL {
  const configured = environment.APP_ORIGIN;
  if (configured) return new URL(configured);

  const vercelProductionHost = environment.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProductionHost) {
    return new URL(`https://${vercelProductionHost}`);
  }

  return new URL("http://localhost:3000");
}
