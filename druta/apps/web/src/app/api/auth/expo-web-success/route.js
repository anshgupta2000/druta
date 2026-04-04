import { getToken } from '@auth/core/jwt';
import { getDevAuthSession } from '../utils/dev-auth';
import { getSecureCookieFlag, hasHostedAuthConfig } from '../utils/auth-config';
import { ensureAuthUser } from '@/app/api/utils/users';

export async function GET(request) {
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
		return new Response(
			`
			<html>
				<body>
					<script>
						window.parent.postMessage({ type: 'AUTH_ERROR', error: 'Unauthorized' }, '*');
					</script>
				</body>
			</html>
			`,
			{
				status: 401,
				headers: {
					'Content-Type': 'text/html',
				},
			}
		);
	}

	const profile = await ensureAuthUser({
		id: jwt.sub,
		email: jwt.email,
		name: jwt.name,
		image: jwt.picture,
	});
	if (!profile) {
		return new Response(
			`
			<html>
				<body>
					<script>
						window.parent.postMessage({ type: 'AUTH_ERROR', error: 'Failed to initialize user profile' }, '*');
					</script>
				</body>
			</html>
			`,
			{
				status: 500,
				headers: {
					'Content-Type': 'text/html',
				},
			}
		);
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

	return new Response(
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
			headers: {
				'Content-Type': 'text/html',
			},
		}
	);
}
