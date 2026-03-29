export async function GET() {
	const hostedAuthConfigured = Boolean(process.env.AUTH_SECRET && process.env.AUTH_URL);
	return new Response(
		JSON.stringify({
			devMode: !hostedAuthConfigured,
		}),
		{
			headers: {
				'Content-Type': 'application/json',
			},
		}
	);
}
