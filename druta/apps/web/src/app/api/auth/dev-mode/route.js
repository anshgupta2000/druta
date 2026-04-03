export async function GET() {
	const hostedAuthConfigured = Boolean(process.env.AUTH_SECRET && process.env.AUTH_URL);
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
