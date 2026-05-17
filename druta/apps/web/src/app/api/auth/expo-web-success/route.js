import { getToken } from '@auth/core/jwt';
import { getDevAuthSession } from '../utils/dev-auth';
import { getSecureCookieFlag, hasHostedAuthConfig } from '../utils/auth-config';
import { ensureAuthUser } from '@/app/api/utils/users';
import { getClerkSession } from '../utils/clerk-auth';

const htmlMessage = (message, status = 200) =>
	new Response(
		`
		<html>
			<body>
				<script>
					window.parent.postMessage(${JSON.stringify(message)}, '*');
				</script>
			</body>
		</html>
		`,
		{
			status,
			headers: {
				'Content-Type': 'text/html',
			},
		}
	);

export async function GET(request) {
	const clerkSession = await getClerkSession(request);
	if (clerkSession?.user?.id) {
		if (typeof clerkSession.token !== 'string' || !clerkSession.token) {
			return htmlMessage({ type: 'AUTH_ERROR', error: 'Missing Clerk session token' }, 401);
		}

		const profile = await ensureAuthUser({
			id: clerkSession.user.id,
			email: clerkSession.user.email,
			name: clerkSession.user.name,
			image: clerkSession.user.image,
		});

		if (!profile) {
			return htmlMessage({ type: 'AUTH_ERROR', error: 'Failed to initialize user profile' }, 500);
		}

		return htmlMessage({
			type: 'AUTH_SUCCESS',
			jwt: clerkSession.token,
			user: {
				id: profile.id,
				email: profile.email || clerkSession.user.email,
				name: profile.name || clerkSession.user.name,
			},
		});
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
		return htmlMessage({ type: 'AUTH_ERROR', error: 'Unauthorized' }, 401);
	}

	const profile = await ensureAuthUser({
		id: jwt.sub,
		email: jwt.email,
		name: jwt.name,
		image: jwt.picture,
	});
	if (!profile) {
		return htmlMessage({ type: 'AUTH_ERROR', error: 'Failed to initialize user profile' }, 500);
	}

	const message = {
		type: 'AUTH_SUCCESS',
		jwt: token,
		user: {
			id: profile.id,
			email: profile.email || jwt.email,
			name: profile.name || jwt.name,
		},
	};

	return htmlMessage(message);
}
