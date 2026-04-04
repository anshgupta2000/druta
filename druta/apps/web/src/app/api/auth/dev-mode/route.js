import { hasHostedAuthConfig } from "../utils/auth-config";

export async function GET() {
	const hostedAuthConfigured = hasHostedAuthConfig();
	const allowDevAuth = process.env.ALLOW_DEV_AUTH === 'true';
	return new Response(
		JSON.stringify({
			devMode: allowDevAuth || !hostedAuthConfigured,
		}),
		{
			headers: {
				'Content-Type': 'application/json',
			},
		}
	);
}
