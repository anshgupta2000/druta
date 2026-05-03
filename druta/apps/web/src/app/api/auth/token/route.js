import { getToken } from '@auth/core/jwt';
import { getDevAuthSession } from '../utils/dev-auth';
import { getSecureCookieFlag, hasHostedAuthConfig } from '../utils/auth-config';
import { ensureAuthUser } from '@/app/api/utils/users';
import { getClerkSession } from '../utils/clerk-auth';

export async function GET(request) {
	
	const clerkSession = await getClerkSession(request);
	if (clerkSession?.user?.id) {
		const profile = await ensureAuthUser({
			id: clerkSession.user.id,
			email: clerkSession.user.email,
			name: clerkSession.user.name,
			image: clerkSession.user.image,
		});

		if (!profile) {
			return new Response(JSON.stringify({ error: 'Failed to initialize user profile' }), {
				status: 500,
				headers: {
					'Content-Type': 'application/json',
				},
			});
		}

		return new Response(
			JSON.stringify({
				jwt: null,
				user: {
					id: profile.id,
					email: profile.email || clerkSession.user.email,
					name: profile.name || clerkSession.user.name,
				},
			}),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	}

const hasHostedAuth = hasHostedAuthConfig();
	const allowDevAuth = process.env.ALLOW_DEV_AUTH === 'true' || !hasHostedAuth;
	const secureCookie = getSecureCookieFlag();

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

	if (!jwt && allowDevAuth) {
		const devSession = getDevAuthSession(request);
		if (devSession) {
			token = devSession.jwt;
			jwt = {
				sub: devSession.user.id,
				email: devSession.user.email,
				name: devSession.user.name,
			};
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

	const profile = await ensureAuthUser({
		id: jwt.sub,
		email: jwt.email,
		name: jwt.name,
		image: jwt.picture,
	});

	if (!profile) {
		return new Response(JSON.stringify({ error: 'Failed to initialize user profile' }), {
			status: 500,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	}

	return new Response(
		JSON.stringify({
			jwt: token,
			user: {
				id: profile.id,
				email: profile.email || jwt.email,
				name: profile.name || jwt.name,
			},
		}),
		{
			headers: {
				'Content-Type': 'application/json',
			},
		}
	);
}
