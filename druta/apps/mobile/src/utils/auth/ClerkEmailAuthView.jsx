import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Lock, Mail, ShieldCheck, X } from 'lucide-react-native';
import { useAuth, useSignIn, useSignUp } from '@clerk/expo';
import {
  authLog,
  getClerkResourceSnapshot,
  withLoggedAuthTimeout,
} from './debug';

const SIGN_IN_CODE_STEP = 'sign-in-code';
const SIGN_UP_CODE_STEP = 'sign-up-code';
const TRUST_CODE_STEP = 'trust-code';
const PASSWORD_SETUP_CODE_STEP = 'password-setup-code';
const AUTH_REQUEST_TIMEOUT_MS = 30000;

const normalizeEmail = (value) => value.trim().toLowerCase();
const normalizeUsername = (value) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
const normalizeCode = (value) => value.replace(/\s+/g, '').trim();

const withAuthTimeout = (label, operation, getDetails) =>
  withLoggedAuthTimeout(label, operation, {
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
    getDetails,
  });

const getErrorMessage = (error) => {
  if (!error) return null;
  if (typeof error === 'string') return error;
  const firstClerkError = Array.isArray(error.errors) ? error.errors[0] : null;
  const errorCode = error.code || firstClerkError?.code;
  if (
    errorCode === 'form_password_incorrect' ||
    errorCode === 'form_password_or_identifier_incorrect' ||
    errorCode === 'password_invalid'
  ) {
    return 'Password is invalid.';
  }
  if (error.longMessage) return error.longMessage;
  if (error.message) return error.message;
  if (firstClerkError) {
    return (
      firstClerkError.longMessage ||
      firstClerkError.message ||
      'Authentication failed. Please try again.'
    );
  }
  return 'Authentication failed. Please try again.';
};

const getGlobalError = (errors) => {
  if (!errors?.global?.length) return null;
  return getErrorMessage(errors.global[0]);
};

const getFieldError = (errors, names) => {
  if (!errors?.fields) return null;
  for (const name of names) {
    const message = getErrorMessage(errors.fields[name]);
    if (message) return message;
  }
  return null;
};

const describeIncompleteSignIn = (status) => {
  if (status === 'needs_second_factor') {
    return 'This account requires another verification method that this mobile sign-in screen does not support yet.';
  }
  if (status === 'needs_new_password') {
    return 'This account needs a password reset before it can sign in.';
  }
  return 'The sign-in could not be completed. Please try again.';
};

const supportsPasswordSignIn = (signIn) =>
  signIn?.supportedFirstFactors?.some((factor) => factor.strategy === 'password');

const supportsPasswordSetup = (signIn) =>
  signIn?.supportedFirstFactors?.some(
    (factor) => factor.strategy === 'reset_password_email_code'
  );

const IconInput = ({
  icon,
  error,
  style,
  inputStyle,
  right,
  ...inputProps
}) => (
  <View style={style}>
    <View style={[styles.inputShell, error && styles.inputShellError]}>
      <View style={styles.inputIcon}>{icon}</View>
      <TextInput
        {...inputProps}
        placeholderTextColor="#777B85"
        selectionColor="#7DD3FC"
        style={[styles.input, inputStyle]}
      />
      {right}
    </View>
    {error ? <Text style={styles.fieldError}>{error}</Text> : null}
  </View>
);

const ModeButton = ({ active, children, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.82}
    style={[styles.modeButton, active && styles.modeButtonActive]}
  >
    <Text style={[styles.modeText, active && styles.modeTextActive]}>{children}</Text>
  </TouchableOpacity>
);

const PrimaryButton = ({ children, disabled, loading, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.84}
    style={[styles.primaryButton, disabled && styles.buttonDisabled]}
  >
    {loading ? <ActivityIndicator color="#061016" /> : <Text style={styles.primaryButtonText}>{children}</Text>}
  </TouchableOpacity>
);

const SecondaryButton = ({ children, disabled, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.8}
    style={[styles.secondaryButton, disabled && styles.buttonDisabled]}
  >
    <Text style={styles.secondaryButtonText}>{children}</Text>
  </TouchableOpacity>
);

export function ClerkEmailAuthView({ mode, close }) {
  const { isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const {
    signIn,
    setActive: setActiveSignIn,
    errors: signInErrors,
    fetchStatus: signInFetchStatus,
  } = useSignIn();
  const {
    signUp,
    setActive: setActiveSignUp,
    errors: signUpErrors,
    fetchStatus: signUpFetchStatus,
  } = useSignUp();

  const [authMode, setAuthMode] = React.useState(mode === 'signin' ? 'signin' : 'signup');
  const [authMethod, setAuthMethod] = React.useState('password');
  const [step, setStep] = React.useState('form');
  const [email, setEmail] = React.useState('');
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const attemptRef = React.useRef(0);

  const busy = loading;
  const activeErrors = authMode === 'signup' ? signUpErrors : signInErrors;
  const visibleError = error || getGlobalError(activeErrors);
  const isClerkReady = Boolean(signIn && signUp);
  const signUpRequiresPassword = signUp?.requiredFields?.includes('password') !== false;
  const signUpRequiresUsername = signUp?.requiredFields?.includes('username') === true;

  const getAuthDebugDetails = React.useCallback(
    (details = {}) => ({
      attemptId: attemptRef.current || undefined,
      authMode,
      authMethod,
      step,
      loading,
      isClerkReady,
      isSignedIn,
      signInFetchStatus,
      signUpFetchStatus,
      signIn: getClerkResourceSnapshot(signIn),
      signUp: getClerkResourceSnapshot(signUp),
      ...details,
    }),
    [
      authMethod,
      authMode,
      isClerkReady,
      isSignedIn,
      loading,
      signIn,
      signInFetchStatus,
      signUp,
      signUpFetchStatus,
      step,
    ]
  );

  const beginAttempt = React.useCallback(
    (event, details = {}) => {
      attemptRef.current += 1;
      authLog('info', `${event}:submit`, getAuthDebugDetails(details));
    },
    [getAuthDebugDetails]
  );

  const handleCaptchaLayout = React.useCallback(
    (event) => {
      authLog('info', 'captcha:layout', getAuthDebugDetails({
        nativeID: 'clerk-captcha',
        width: event.nativeEvent.layout.width,
        height: event.nativeEvent.layout.height,
      }));
    },
    [getAuthDebugDetails]
  );

  React.useEffect(() => {
    authLog(
      isClerkReady ? 'info' : 'warn',
      'email-auth-view:state',
      getAuthDebugDetails({
        modeProp: mode,
        visibleError,
        notice: notice || undefined,
      })
    );
  }, [getAuthDebugDetails, isClerkReady, mode, notice, visibleError]);

  React.useEffect(() => {
    setAuthMode(mode === 'signin' ? 'signin' : 'signup');
    setStep('form');
    setError('');
    setNotice('');
    setCode('');
    setUsername('');
  }, [mode]);

  React.useEffect(() => {
    if (authMode === 'signup' && signUpRequiresPassword && authMethod !== 'password') {
      setAuthMethod('password');
    }
  }, [authMethod, authMode, signUpRequiresPassword]);

  React.useEffect(() => {
    if (isSignedIn) {
      close();
    }
  }, [close, isSignedIn]);

  const resetAttempt = React.useCallback(async () => {
    setStep('form');
    setCode('');
    setError('');
    setNotice('');
    await Promise.all([
      signIn?.reset?.().catch(() => {}),
      signUp?.reset?.().catch(() => {}),
    ]);
  }, [signIn, signUp]);

  const switchMode = React.useCallback(
    async (nextMode) => {
      setAuthMode(nextMode);
      setAuthMethod('password');
      await resetAttempt();
    },
    [resetAttempt]
  );

  const setMethod = React.useCallback(
    async (method) => {
      setAuthMethod(method);
      await resetAttempt();
    },
    [resetAttempt]
  );

  const finalizeSignIn = React.useCallback(async (nextSignIn = signIn) => {
    if (!nextSignIn) {
      setError('Authentication is still loading. Try again in a moment.');
      return false;
    }

    if (typeof nextSignIn.finalize !== 'function') {
      if (!nextSignIn.createdSessionId || !setActiveSignIn) {
        setError('The sign-in completed but no session was returned. Try again.');
        return false;
      }

      await withAuthTimeout(
        'sign-in.set-active',
        () =>
          setActiveSignIn({
            session: nextSignIn.createdSessionId,
            navigate: ({ session }) => {
              authLog('info', 'sign-in.set-active:navigate', getAuthDebugDetails({
                hasCurrentTask: Boolean(session?.currentTask),
                currentTask: session?.currentTask?.key || session?.currentTask?.type,
              }));
              if (session?.currentTask) {
                setNotice('Your account needs one more security step before Druta can continue.');
                return;
              }
              close();
            },
          }),
        getAuthDebugDetails
      );
      close();
      return true;
    }

    const { error: finalizeError } = await withAuthTimeout(
      'sign-in.finalize',
      () => nextSignIn.finalize({
        navigate: ({ session }) => {
          authLog('info', 'sign-in.finalize:navigate', getAuthDebugDetails({
            hasCurrentTask: Boolean(session?.currentTask),
            currentTask: session?.currentTask?.key || session?.currentTask?.type,
          }));
          if (session?.currentTask) {
            setNotice('Your account needs one more security step before Druta can continue.');
            return;
          }
          close();
        },
      }),
      getAuthDebugDetails
    );

    if (finalizeError) {
      setError(getErrorMessage(finalizeError));
      return false;
    }

    close();
    return true;
  }, [close, getAuthDebugDetails, setActiveSignIn, signIn]);

  const finalizeSignUp = React.useCallback(async (nextSignUp = signUp) => {
    if (!nextSignUp) {
      setError('Authentication is still loading. Try again in a moment.');
      return false;
    }

    if (typeof nextSignUp.finalize !== 'function') {
      if (!nextSignUp.createdSessionId || !setActiveSignUp) {
        setError('The account was created but no session was returned. Try again.');
        return false;
      }

      await withAuthTimeout(
        'sign-up.set-active',
        () =>
          setActiveSignUp({
            session: nextSignUp.createdSessionId,
            navigate: ({ session }) => {
              authLog('info', 'sign-up.set-active:navigate', getAuthDebugDetails({
                hasCurrentTask: Boolean(session?.currentTask),
                currentTask: session?.currentTask?.key || session?.currentTask?.type,
              }));
              if (session?.currentTask) {
                setNotice('Your account needs one more security step before Druta can continue.');
                return;
              }
              close();
            },
          }),
        getAuthDebugDetails
      );
      close();
      return true;
    }

    const { error: finalizeError } = await withAuthTimeout(
      'sign-up.finalize',
      () => nextSignUp.finalize({
        navigate: ({ session }) => {
          authLog('info', 'sign-up.finalize:navigate', getAuthDebugDetails({
            hasCurrentTask: Boolean(session?.currentTask),
            currentTask: session?.currentTask?.key || session?.currentTask?.type,
          }));
          if (session?.currentTask) {
            setNotice('Your account needs one more security step before Druta can continue.');
            return;
          }
          close();
        },
      }),
      getAuthDebugDetails
    );

    if (finalizeError) {
      setError(getErrorMessage(finalizeError));
      return false;
    }

    close();
    return true;
  }, [close, getAuthDebugDetails, setActiveSignUp, signUp]);

  const startTrustCode = React.useCallback(
    async (status) => {
      if (!signIn) {
        setError('Authentication is still loading. Try again in a moment.');
        return true;
      }

      if (status !== 'needs_client_trust' && status !== 'needs_second_factor') {
        return false;
      }

      const emailFactor = signIn.supportedSecondFactors?.find(
        (factor) => factor.strategy === 'email_code'
      );
      if (status === 'needs_second_factor' && !emailFactor) {
        setError(describeIncompleteSignIn(status));
        return true;
      }

      const { error: sendError } = await withAuthTimeout(
        'sign-in.mfa.send-email-code',
        () => signIn.mfa.sendEmailCode(),
        getAuthDebugDetails
      );

      if (sendError) {
        setError(getErrorMessage(sendError));
        return true;
      }

      setStep(TRUST_CODE_STEP);
      setNotice('Enter the code we sent to your email to trust this device.');
      setCode('');
      return true;
    },
    [getAuthDebugDetails, signIn]
  );

  const completeSignInIfReady = React.useCallback(async (nextSignIn = signIn) => {
    if (!nextSignIn) {
      setError('Authentication is still loading. Try again in a moment.');
      return;
    }

    if (nextSignIn.status === 'complete') {
      await finalizeSignIn(nextSignIn);
      return;
    }

    if (await startTrustCode(nextSignIn.status)) {
      return;
    }

    setError(describeIncompleteSignIn(nextSignIn.status));
  }, [finalizeSignIn, signIn, startTrustCode]);

  const handlePasswordSignIn = React.useCallback(async () => {
    if (!signIn) {
      setError('Authentication is still loading. Try again in a moment.');
      return;
    }

    const emailAddress = normalizeEmail(email);
    if (!emailAddress || !password) {
      setError('Enter your email and password.');
      return;
    }

    beginAttempt('sign-in.password', { emailAddress });
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const createResult = await withAuthTimeout(
        'sign-in.password.create',
        () => signIn.create({ identifier: emailAddress }),
        () => getAuthDebugDetails({ emailAddress })
      );
      if (createResult?.error) {
        setError(getErrorMessage(createResult.error));
        return;
      }

      const activeSignIn = createResult?.status ? createResult : signIn;

      if (!supportsPasswordSignIn(activeSignIn)) {
        if (supportsPasswordSetup(activeSignIn)) {
          authLog('info', 'sign-in.password:setup-required', getAuthDebugDetails({
            emailAddress,
            supportedFirstFactors: activeSignIn.supportedFirstFactors,
          }));
          await startPasswordSetup(emailAddress, activeSignIn);
          return;
        }

        authLog('warn', 'sign-in.password:unsupported-factor', getAuthDebugDetails({
          emailAddress,
          supportedFirstFactors: activeSignIn.supportedFirstFactors,
        }));
        setError('This account does not have password sign-in enabled. Use Email Code to sign in.');
        return;
      }

      const passwordResult = await withAuthTimeout(
        'sign-in.password.submit',
        () => {
          if (typeof activeSignIn.password === 'function') {
            return activeSignIn.password({ password });
          }
          return activeSignIn.attemptFirstFactor({
            strategy: 'password',
            password,
          });
        },
        () => getAuthDebugDetails({ emailAddress })
      );
      if (passwordResult?.error) {
        setError(getErrorMessage(passwordResult.error));
        return;
      }

      await completeSignInIfReady(passwordResult?.status ? passwordResult : activeSignIn);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [
    beginAttempt,
    completeSignInIfReady,
    email,
    getAuthDebugDetails,
    password,
    signIn,
    startPasswordSetup,
  ]);

  const sendSignInCode = React.useCallback(async () => {
    if (!signIn) {
      setError('Authentication is still loading. Try again in a moment.');
      return;
    }

    const emailAddress = normalizeEmail(email);
    if (!emailAddress) {
      setError('Enter your email address.');
      return;
    }

    beginAttempt('sign-in.email-code.start', { emailAddress });
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const { error: createError } = await withAuthTimeout(
        'sign-in.create',
        () => signIn.create({ identifier: emailAddress }),
        () => getAuthDebugDetails({ emailAddress })
      );
      if (createError) {
        setError(getErrorMessage(createError));
        return;
      }

      const { error: sendError } = await withAuthTimeout(
        'sign-in.email-code.send',
        () => signIn.emailCode.sendCode({ emailAddress }),
        () => getAuthDebugDetails({ emailAddress })
      );
      if (sendError) {
        setError(getErrorMessage(sendError));
        return;
      }

      setStep(SIGN_IN_CODE_STEP);
      setNotice(`We sent a sign-in code to ${emailAddress}.`);
      setCode('');
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [beginAttempt, email, getAuthDebugDetails, signIn]);

  const resendSignInCode = React.useCallback(async () => {
    if (!signIn) {
      setError('Authentication is still loading. Try again in a moment.');
      return;
    }

    const emailAddress = normalizeEmail(email);
    if (!emailAddress) {
      setError('Enter your email address.');
      return;
    }

    beginAttempt('sign-in.email-code.resend', { emailAddress });
    setLoading(true);
    setError('');
    try {
      const { error: sendError } = await withAuthTimeout(
        'sign-in.email-code.resend',
        () => signIn.emailCode.sendCode({ emailAddress }),
        () => getAuthDebugDetails({ emailAddress })
      );
      if (sendError) {
        setError(getErrorMessage(sendError));
        return;
      }

      setNotice(`We sent a new sign-in code to ${emailAddress}.`);
      setCode('');
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [beginAttempt, email, getAuthDebugDetails, signIn]);

  const verifySignInCode = React.useCallback(async () => {
    if (!signIn) {
      setError('Authentication is still loading. Try again in a moment.');
      return;
    }

    const nextCode = normalizeCode(code);
    if (!nextCode) {
      setError('Enter the code from your email.');
      return;
    }

    beginAttempt('sign-in.email-code.verify');
    setLoading(true);
    setError('');
    try {
      const { error: verifyError } = await withAuthTimeout(
        'sign-in.email-code.verify',
        () => signIn.emailCode.verifyCode({ code: nextCode }),
        getAuthDebugDetails
      );
      if (verifyError) {
        setError(getErrorMessage(verifyError));
        return;
      }

      await completeSignInIfReady();
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [beginAttempt, code, completeSignInIfReady, getAuthDebugDetails, signIn]);

  const verifyTrustCode = React.useCallback(async () => {
    if (!signIn) {
      setError('Authentication is still loading. Try again in a moment.');
      return;
    }

    const nextCode = normalizeCode(code);
    if (!nextCode) {
      setError('Enter the verification code from your email.');
      return;
    }

    beginAttempt('sign-in.trust-code.verify');
    setLoading(true);
    setError('');
    try {
      const { error: verifyError } = await withAuthTimeout(
        'sign-in.trust-code.verify',
        () => signIn.mfa.verifyEmailCode({ code: nextCode }),
        getAuthDebugDetails
      );
      if (verifyError) {
        setError(getErrorMessage(verifyError));
        return;
      }

      await completeSignInIfReady();
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [beginAttempt, code, completeSignInIfReady, getAuthDebugDetails, signIn]);

  const startPasswordSetup = React.useCallback(
    async (emailAddress, activeSignIn) => {
      if (!activeSignIn?.resetPasswordEmailCode?.sendCode) {
        setError('This account does not support password setup from the mobile sign-in screen. Use Email Code to sign in.');
        return false;
      }

      const { error: sendError } = await withAuthTimeout(
        'sign-in.password-setup.send-code',
        () => activeSignIn.resetPasswordEmailCode.sendCode(),
        () => getAuthDebugDetails({ emailAddress })
      );
      if (sendError) {
        setError(getErrorMessage(sendError));
        return false;
      }

      setStep(PASSWORD_SETUP_CODE_STEP);
      setNotice(`We sent a code to ${emailAddress}. Enter it to enable password sign-in for this account.`);
      setCode('');
      return true;
    },
    [getAuthDebugDetails]
  );

  const verifyPasswordSetupCode = React.useCallback(async () => {
    if (!signIn) {
      setError('Authentication is still loading. Try again in a moment.');
      return;
    }

    const nextCode = normalizeCode(code);
    if (!nextCode || !password) {
      setError('Enter the code from your email and the password you want to use.');
      return;
    }

    beginAttempt('sign-in.password-setup.verify');
    setLoading(true);
    setError('');
    try {
      const verifyResult = await withAuthTimeout(
        'sign-in.password-setup.verify-code',
        () => signIn.resetPasswordEmailCode.verifyCode({ code: nextCode }),
        getAuthDebugDetails
      );
      if (verifyResult?.error) {
        setError(getErrorMessage(verifyResult.error));
        return;
      }

      const activeSignIn = verifyResult?.status ? verifyResult : signIn;
      const passwordResult = await withAuthTimeout(
        'sign-in.password-setup.submit-password',
        () =>
          activeSignIn.resetPasswordEmailCode.submitPassword({
            password,
            signOutOfOtherSessions: false,
          }),
        getAuthDebugDetails
      );
      if (passwordResult?.error) {
        setError(getErrorMessage(passwordResult.error));
        return;
      }

      await completeSignInIfReady(passwordResult?.status ? passwordResult : activeSignIn);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [
    beginAttempt,
    code,
    completeSignInIfReady,
    getAuthDebugDetails,
    password,
    signIn,
  ]);

  const handleSignUp = React.useCallback(async () => {
    if (!signUp) {
      setError('Authentication is still loading. Try again in a moment.');
      return;
    }

    const emailAddress = normalizeEmail(email);
    const nextUsername = normalizeUsername(username);
    if (!emailAddress || (authMethod === 'password' && !password)) {
      setError(authMethod === 'password' ? 'Enter an email and password.' : 'Enter your email address.');
      return;
    }
    if (signUpRequiresUsername && !nextUsername) {
      setError('Choose a username.');
      return;
    }

    beginAttempt('sign-up.start', {
      emailAddress,
      authMethod,
      hasUsername: Boolean(nextUsername),
    });
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const { error: signUpError } =
        authMethod === 'code'
          ? await withAuthTimeout(
              'sign-up.create',
              () =>
                signUp.create({
                  emailAddress,
                  ...(nextUsername ? { username: nextUsername } : {}),
                }),
              () => getAuthDebugDetails({ emailAddress, authMethod })
            )
          : await withAuthTimeout(
              'sign-up.password',
              () =>
                signUp.password({
                  emailAddress,
                  password,
                  ...(nextUsername ? { username: nextUsername } : {}),
                }),
              () => getAuthDebugDetails({ emailAddress, authMethod })
            );
      if (signUpError) {
        setError(getErrorMessage(signUpError));
        return;
      }

      if (signUp.status === 'complete') {
        await finalizeSignUp();
        return;
      }

      const { error: sendError } = await withAuthTimeout(
        'sign-up.email-code.send',
        () => signUp.verifications.sendEmailCode(),
        () => getAuthDebugDetails({ emailAddress })
      );
      if (sendError) {
        setError(getErrorMessage(sendError));
        return;
      }

      setStep(SIGN_UP_CODE_STEP);
      setNotice(`We sent a verification code to ${emailAddress}.`);
      setCode('');
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [
    authMethod,
    beginAttempt,
    email,
    finalizeSignUp,
    getAuthDebugDetails,
    password,
    signUp,
    signUpRequiresUsername,
    username,
  ]);

  const resendSignUpCode = React.useCallback(async () => {
    if (!signUp) {
      setError('Authentication is still loading. Try again in a moment.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      beginAttempt('sign-up.email-code.resend', { emailAddress: normalizeEmail(email) });
      const { error: sendError } = await withAuthTimeout(
        'sign-up.email-code.resend',
        () => signUp.verifications.sendEmailCode(),
        () => getAuthDebugDetails({ emailAddress: normalizeEmail(email) })
      );
      if (sendError) {
        setError(getErrorMessage(sendError));
        return;
      }

      setNotice(`We sent a new verification code to ${normalizeEmail(email)}.`);
      setCode('');
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [beginAttempt, email, getAuthDebugDetails, signUp]);

  const resendTrustCode = React.useCallback(async () => {
    if (!signIn) {
      setError('Authentication is still loading. Try again in a moment.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      beginAttempt('sign-in.trust-code.resend');
      await startTrustCode(signIn.status);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [beginAttempt, signIn, signIn?.status, startTrustCode]);

  const verifySignUpCode = React.useCallback(async () => {
    if (!signUp) {
      setError('Authentication is still loading. Try again in a moment.');
      return;
    }

    const nextCode = normalizeCode(code);
    if (!nextCode) {
      setError('Enter the verification code from your email.');
      return;
    }

    beginAttempt('sign-up.email-code.verify');
    setLoading(true);
    setError('');
    try {
      const { error: verifyError } = await withAuthTimeout(
        'sign-up.email-code.verify',
        () =>
          signUp.verifications.verifyEmailCode({
            code: nextCode,
          }),
        getAuthDebugDetails
      );
      if (verifyError) {
        setError(getErrorMessage(verifyError));
        return;
      }

      if (signUp.status === 'complete') {
        await finalizeSignUp();
        return;
      }

      if (signUp.missingFields?.includes('password')) {
        setError('This sign-up method requires a password. Go back and use Password.');
        return;
      }

      setError('The account still has missing requirements. Check the email and password fields.');
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [beginAttempt, code, finalizeSignUp, getAuthDebugDetails, signUp]);

  const submitForm = React.useCallback(() => {
    if (step === SIGN_IN_CODE_STEP) return verifySignInCode();
    if (step === SIGN_UP_CODE_STEP) return verifySignUpCode();
    if (step === TRUST_CODE_STEP) return verifyTrustCode();
    if (step === PASSWORD_SETUP_CODE_STEP) return verifyPasswordSetupCode();
    if (authMode === 'signup') return handleSignUp();
    if (authMethod === 'code') return sendSignInCode();
    return handlePasswordSignIn();
  }, [
    authMode,
    handlePasswordSignIn,
    handleSignUp,
    sendSignInCode,
    authMethod,
    step,
    verifySignInCode,
    verifySignUpCode,
    verifyPasswordSetupCode,
    verifyTrustCode,
  ]);

  const isCodeStep =
    step === SIGN_IN_CODE_STEP ||
    step === SIGN_UP_CODE_STEP ||
    step === TRUST_CODE_STEP ||
    step === PASSWORD_SETUP_CODE_STEP;
  const heading = isCodeStep
    ? step === PASSWORD_SETUP_CODE_STEP
      ? 'Set your password'
      : 'Check your email'
    : authMode === 'signup'
      ? 'Create your account'
      : 'Welcome back';
  const subheading = isCodeStep
    ? step === PASSWORD_SETUP_CODE_STEP
      ? 'Enter the email code and choose the password you will use next time.'
      : 'Enter the 6 digit code to finish signing in.'
    : authMode === 'signup'
      ? 'Use email and password. We will verify your email before creating the session.'
      : authMethod === 'code'
        ? 'Get a one-time email code.'
        : 'Sign in with the email and password on your account.';
  const submitLabel = isCodeStep
    ? step === PASSWORD_SETUP_CODE_STEP
      ? 'Set Password'
      : 'Verify Code'
    : authMode === 'signup'
      ? 'Create Account'
      : authMethod === 'code'
        ? 'Send Code'
        : 'Sign In';
  const emailError = getFieldError(activeErrors, ['emailAddress', 'identifier']);
  const usernameError = getFieldError(activeErrors, ['username']);
  const passwordError = getFieldError(activeErrors, ['password']);
  const codeError = getFieldError(activeErrors, ['code']);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <View style={styles.headerRow}>
            {isCodeStep ? (
              <TouchableOpacity
                onPress={resetAttempt}
                disabled={busy}
                activeOpacity={0.8}
                style={styles.iconButton}
              >
                <ArrowLeft size={20} color="#E8EDF2" />
              </TouchableOpacity>
            ) : (
              <View style={styles.brandMark}>
                <ShieldCheck size={20} color="#061016" strokeWidth={2.6} />
              </View>
            )}

            <TouchableOpacity
              onPress={close}
              disabled={busy}
              activeOpacity={0.8}
              style={styles.iconButton}
            >
              <X size={20} color="#E8EDF2" />
            </TouchableOpacity>
          </View>

          <View style={styles.hero}>
            <Text style={styles.kicker}>DRUTA</Text>
            <Text style={styles.title}>{heading}</Text>
            <Text style={styles.subtitle}>{subheading}</Text>
          </View>

          {!isCodeStep ? (
            <View style={styles.modeSwitch}>
              <ModeButton active={authMode === 'signin'} onPress={() => switchMode('signin')}>
                Sign In
              </ModeButton>
              <ModeButton active={authMode === 'signup'} onPress={() => switchMode('signup')}>
                Sign Up
              </ModeButton>
            </View>
          ) : null}

          {!isCodeStep && authMode === 'signin' ? (
            <View style={styles.methodSwitch}>
              <ModeButton active={authMethod === 'password'} onPress={() => setMethod('password')}>
                Password
              </ModeButton>
              <ModeButton active={authMethod === 'code'} onPress={() => setMethod('code')}>
                Email Code
              </ModeButton>
            </View>
          ) : null}

          <View style={styles.form}>
            {isCodeStep ? (
              <>
                <IconInput
                  icon={<ShieldCheck size={18} color="#9CA3AF" />}
                  error={codeError}
                  value={code}
                  onChangeText={setCode}
                  placeholder="Email code"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  maxLength={12}
                />
                {step === PASSWORD_SETUP_CODE_STEP ? (
                  <IconInput
                    icon={<Lock size={18} color="#9CA3AF" />}
                    error={passwordError}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="New password"
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    textContentType="newPassword"
                  />
                ) : null}
              </>
            ) : (
              <>
                <IconInput
                  icon={<Mail size={18} color="#9CA3AF" />}
                  error={emailError}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                />

                {authMode === 'signup' && signUpRequiresUsername ? (
                  <IconInput
                    icon={<ShieldCheck size={18} color="#9CA3AF" />}
                    error={usernameError}
                    value={username}
                    onChangeText={setUsername}
                    placeholder="Username"
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="username"
                  />
                ) : null}

                {authMethod === 'password' ? (
                  <IconInput
                    icon={<Lock size={18} color="#9CA3AF" />}
                    error={passwordError}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    textContentType={authMode === 'signup' ? 'newPassword' : 'password'}
                  />
                ) : null}
              </>
            )}
          </View>

          {visibleError ? <Text style={styles.errorBanner}>{visibleError}</Text> : null}
          {notice ? <Text style={styles.noticeBanner}>{notice}</Text> : null}
          <View
            nativeID="clerk-captcha"
            collapsable={false}
            onLayout={handleCaptchaLayout}
            style={styles.captchaContainer}
          />

          <PrimaryButton onPress={submitForm} disabled={busy || !isClerkReady} loading={busy}>
            {submitLabel}
          </PrimaryButton>

          {isCodeStep ? (
            <SecondaryButton
              disabled={busy || !isClerkReady}
              onPress={
                step === SIGN_IN_CODE_STEP
                  ? resendSignInCode
                  : step === TRUST_CODE_STEP
                    ? resendTrustCode
                    : step === PASSWORD_SETUP_CODE_STEP
                      ? () => startPasswordSetup(normalizeEmail(email), signIn)
                      : resendSignUpCode
              }
            >
              Resend Code
            </SecondaryButton>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#061016',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 22,
  },
  headerRow: {
    position: 'absolute',
    top: 18,
    left: 22,
    right: 22,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  brandMark: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#7DD3FC',
  },
  hero: {
    marginTop: 48,
    marginBottom: 24,
  },
  kicker: {
    color: '#7DD3FC',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    marginTop: 10,
    letterSpacing: 0,
  },
  subtitle: {
    color: '#A9B4C3',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  modeSwitch: {
    flexDirection: 'row',
    gap: 8,
    padding: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  methodSwitch: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  modeButton: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  modeButtonActive: {
    backgroundColor: '#E8F7FF',
  },
  modeText: {
    color: '#A9B4C3',
    fontSize: 14,
    fontWeight: '800',
  },
  modeTextActive: {
    color: '#061016',
  },
  form: {
    gap: 12,
    marginTop: 18,
  },
  inputShell: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#101A24',
  },
  inputShellError: {
    borderColor: '#FB7185',
  },
  inputIcon: {
    width: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 52,
    paddingRight: 14,
    color: '#F8FAFC',
    fontSize: 16,
  },
  fieldError: {
    color: '#FDA4AF',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  errorBanner: {
    marginTop: 14,
    color: '#FFE4E6',
    backgroundColor: 'rgba(190,18,60,0.24)',
    borderWidth: 1,
    borderColor: 'rgba(251,113,133,0.32)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    lineHeight: 18,
  },
  noticeBanner: {
    marginTop: 14,
    color: '#DFF7FF',
    backgroundColor: 'rgba(14,116,144,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.32)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    lineHeight: 18,
  },
  captchaContainer: {
    minHeight: 1,
    width: '100%',
  },
  primaryButton: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#7DD3FC',
    marginTop: 18,
  },
  primaryButtonText: {
    color: '#061016',
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginTop: 10,
  },
  secondaryButtonText: {
    color: '#E8EDF2',
    fontSize: 15,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.62,
  },
});
