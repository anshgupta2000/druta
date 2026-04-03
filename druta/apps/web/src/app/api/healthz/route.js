export async function GET() {
	return new Response(
		JSON.stringify({
			ok: true,
			service: 'druta-web',
			timestamp: new Date().toISOString(),
		}),
		{
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-store',
			},
		}
	);
}
