/**
 * WARNING: This file connects this app to Create's internal auth system. Do
 * not attempt to edit it. Do not import @auth/create or @auth/create
 * anywhere else or it may break. This is an internal package.
 */
import CreateAuth from '@auth/create';
import Credentials from '@auth/core/providers/credentials';
import { getContext } from 'hono/context-storage';
import { getDevAuthSession } from '@/app/api/auth/utils/dev-auth';
import { hasHostedAuthConfig } from '@/app/api/auth/utils/auth-config';

const result = CreateAuth({
	providers: [
		Credentials({
			credentials: {
				email: {
					label: 'Email',
					type: 'email',
				},
				password: {
					label: 'Password',
					type: 'password',
				},
			},
		}),
	],
	pages: {
		signIn: '/account/signin',
		signOut: '/account/logout',
	},
});

const { auth: createAuth } = result;

const allowDevAuthFallback = () => {
	return process.env.ALLOW_DEV_AUTH === 'true' || !hasHostedAuthConfig();
};

export const auth = async () => {
	let session = null;
	try {
		session = await createAuth();
	} catch {
		session = null;
	}
	if (session?.user?.id || !allowDevAuthFallback()) {
		return session;
	}

	try {
		const context = getContext();
		const request = context?.req?.raw;
		if (!request) {
			return session;
		}
		const devSession = getDevAuthSession(request);
		if (!devSession?.user?.id) {
			return session;
		}
		return {
			user: {
				id: devSession.user.id,
				email: devSession.user.email,
				name: devSession.user.name,
			},
			expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
		};
	} catch {
		return session;
	}
};
