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

	const message = {
		type: 'AUTH_SUCCESS',
		jwt: token,
		user: {
			id: jwt.sub,
			email: jwt.email,
			name: jwt.name,
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
