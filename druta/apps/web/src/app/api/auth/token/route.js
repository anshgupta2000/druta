import { getToken } from '@auth/core/jwt';
import { getDevAuthSession } from '../utils/dev-auth';

export async function GET(request) {
	const hasHostedAuth = Boolean(process.env.AUTH_SECRET && process.env.AUTH_URL);
	const secureCookie = Boolean(process.env.AUTH_URL?.startsWith('https'));

	let token = null;
	let jwt = null;

	if (hasHostedAuth) {
		[token, jwt] = await Promise.all([
			getToken({
				req: request,
				secret: process.env.AUTH_SECRET,
				secureCookie,
				raw: true,
			}),
			getToken({
				req: request,
				secret: process.env.AUTH_SECRET,
				secureCookie,
			}),
		]);
	}

	if (!jwt) {
		const devSession = getDevAuthSession(request);
		if (devSession) {
			return new Response(JSON.stringify(devSession), {
				headers: {
					'Content-Type': 'application/json',
				},
			});
		}
	}

	if (!jwt) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	}

	return new Response(
		JSON.stringify({
			jwt: token,
			user: {
				id: jwt.sub,
				email: jwt.email,
				name: jwt.name,
			},
		}),
		{
			headers: {
				'Content-Type': 'application/json',
			},
		}
	);
}
