import { buildDevAuthCookie, createDevAuthSession } from '../utils/dev-auth';

export async function POST(request) {
	let body = null;
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const session = createDevAuthSession({
		email: body?.email,
		name: body?.name,
	});

	const callbackUrl =
		typeof body?.callbackUrl === 'string' && body.callbackUrl.length > 0
			? body.callbackUrl
			: '/';

	const headers = new Headers({
		'Content-Type': 'application/json',
	});
	headers.append(
		'Set-Cookie',
		buildDevAuthCookie(session, Boolean(process.env.AUTH_URL?.startsWith('https')))
	);

	return new Response(
		JSON.stringify({
			ok: true,
			redirectTo: callbackUrl,
		}),
		{
			status: 200,
			headers,
		}
	);
}
